//! Command line arguments.

use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
    str::FromStr,
    sync::Arc,
    time::Duration,
};

use anyhow::Context;
use console::style;
use data_encoding::HEXLOWER;
use futures::{future::BoxFuture, TryFutureExt};
use futures_buffered::BufferedStreamExt;
use indicatif::{
    HumanBytes, HumanDuration, MultiProgress, ProgressBar, ProgressDrawTarget, ProgressStyle,
};
use iroh::{
    discovery::{dns::DnsDiscovery, pkarr::PkarrPublisher},
    Endpoint, RelayMode, SecretKey,
};
use iroh_blobs::{
    format::collection::Collection,
    get::{
        db::DownloadProgress,
        fsm::{AtBlobHeaderNextError, DecodeError},
        request::get_hash_seq_and_sizes,
    },
    net_protocol::Blobs,
    provider::{self, CustomEventSender},
    store::{ExportMode, ImportMode, ImportProgress},
    ticket::BlobTicket,
    BlobFormat, HashAndFormat, TempTag,
};
use n0_future::{future::Boxed, StreamExt};
use rand::Rng;
use tokio::sync::Mutex;
use walkdir::WalkDir;

/// Send a file or directory between two machines, using blake3 verified streaming.
///
/// For all subcommands, you can specify a secret key using the IROH_SECRET
/// environment variable. If you don't, a random one will be generated.
///
/// You can also specify a port for the magicsocket. If you don't, a random one
/// will be chosen.
///

pub fn canonicalized_path_to_string(
    path: impl AsRef<Path>,
    must_be_relative: bool,
) -> anyhow::Result<String> {
    let mut path_str = String::new();
    let parts = path
        .as_ref()
        .components()
        .filter_map(|c| match c {
            Component::Normal(x) => {
                let c = match x.to_str() {
                    Some(c) => c,
                    None => return Some(Err(anyhow::anyhow!("invalid character in path"))),
                };

                if !c.contains('/') && !c.contains('\\') {
                    Some(Ok(c))
                } else {
                    Some(Err(anyhow::anyhow!("invalid path component {:?}", c)))
                }
            }
            Component::RootDir => {
                if must_be_relative {
                    Some(Err(anyhow::anyhow!("invalid path component {:?}", c)))
                } else {
                    path_str.push('/');
                    None
                }
            }
            _ => Some(Err(anyhow::anyhow!("invalid path component {:?}", c))),
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    let parts = parts.join("/");
    path_str.push_str(&parts);
    Ok(path_str)
}

pub async fn show_ingest_progress(
    recv: async_channel::Receiver<ImportProgress>,
) -> anyhow::Result<()> {
    let mp = MultiProgress::new();
    mp.set_draw_target(ProgressDrawTarget::stderr());
    let op = mp.add(ProgressBar::hidden());
    op.set_style(
        ProgressStyle::default_spinner().template("{spinner:.green} [{elapsed_precise}] {msg}")?,
    );
    // op.set_message(format!("{} Ingesting ...\n", style("[1/2]").bold().dim()));
    // op.set_length(total_files);
    let mut names = BTreeMap::new();
    let mut sizes = BTreeMap::new();
    let mut pbs = BTreeMap::new();
    loop {
        let event = recv.recv().await;
        match event {
            Ok(ImportProgress::Found { id, name }) => {
                names.insert(id, name);
            }
            Ok(ImportProgress::Size { id, size }) => {
                sizes.insert(id, size);
                let total_size = sizes.values().sum::<u64>();
                op.set_message(format!(
                    "{} Ingesting {} files, {}\n",
                    style("[1/2]").bold().dim(),
                    sizes.len(),
                    HumanBytes(total_size)
                ));
                let name = names.get(&id).cloned().unwrap_or_default();
                let pb = mp.add(ProgressBar::hidden());
                pb.set_style(ProgressStyle::with_template(
                    "{msg}{spinner:.green} [{elapsed_precise}] [{wide_bar:.cyan/blue}] {bytes}/{total_bytes}",
                )?.progress_chars("#>-"));
                pb.set_message(format!("{} {}", style("[2/2]").bold().dim(), name));
                pb.set_length(size);
                pbs.insert(id, pb);
            }
            Ok(ImportProgress::OutboardProgress { id, offset }) => {
                if let Some(pb) = pbs.get(&id) {
                    pb.set_position(offset);
                }
            }
            Ok(ImportProgress::OutboardDone { id, .. }) => {
                // you are not guaranteed to get any OutboardProgress
                if let Some(pb) = pbs.remove(&id) {
                    pb.finish_and_clear();
                }
            }
            Ok(ImportProgress::CopyProgress { .. }) => {
                // we are not copying anything
            }
            Err(e) => {
                op.set_message(format!("Error receiving progress: {e}"));
                break;
            }
        }
    }
    op.finish_and_clear();
    Ok(())
}

async fn import(
    path: PathBuf,
    db: impl iroh_blobs::store::Store,
) -> anyhow::Result<(TempTag, u64, Collection)> {
    let path = path.canonicalize()?;
    anyhow::ensure!(path.exists(), "path {} does not exist", path.display());
    let root = path.parent().context("context get parent")?;
    // walkdir also works for files, so we don't need to special case them
    let files = WalkDir::new(path.clone()).into_iter();
    // flatten the directory structure into a list of (name, path) pairs.
    // ignore symlinks.
    let data_sources: Vec<(String, PathBuf)> = files
        .map(|entry| {
            let entry = entry?;
            if !entry.file_type().is_file() {
                // Skip symlinks. Directories are handled by WalkDir.
                return Ok(None);
            }
            let path = entry.into_path();
            let relative = path.strip_prefix(root)?;
            let name = canonicalized_path_to_string(relative, true)?;
            anyhow::Ok(Some((name, path)))
        })
        .filter_map(Result::transpose)
        .collect::<anyhow::Result<Vec<_>>>()?;
    let (send, recv) = async_channel::bounded(32);
    let progress = iroh_blobs::util::progress::AsyncChannelProgressSender::new(send);
    let show_progress = tokio::spawn(show_ingest_progress(recv));
    // import all the files, using num_cpus workers, return names and temp tags
    let mut names_and_tags = futures_lite::stream::iter(data_sources)
        .map(|(name, path)| {
            let db = db.clone();
            let progress = progress.clone();
            async move {
                let (temp_tag, file_size) = db
                    .import_file(path, ImportMode::TryReference, BlobFormat::Raw, progress)
                    .await?;
                anyhow::Ok((name, temp_tag, file_size))
            }
        })
        .buffered_unordered(num_cpus::get())
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<anyhow::Result<Vec<_>>>()?;
    drop(progress);
    names_and_tags.sort_by(|(a, _, _), (b, _, _)| a.cmp(b));
    // total size of all files
    let size = names_and_tags.iter().map(|(_, _, size)| *size).sum::<u64>();
    // collect the (name, hash) tuples into a collection
    // we must also keep the tags around so the data does not get gced.
    let (collection, tags) = names_and_tags
        .into_iter()
        .map(|(name, tag, _)| ((name, *tag.hash()), tag))
        .unzip::<_, _, Collection, Vec<_>>();
    let temp_tag = collection.clone().store(&db).await?;
    // now that the collection is stored, we can drop the tags
    // data is protected by the collection
    drop(tags);
    show_progress.await??;
    Ok((temp_tag, size, collection))
}

fn validate_path_component(component: &str) -> anyhow::Result<()> {
    anyhow::ensure!(
        !component.contains('/'),
        "path components must not contain the only correct path separator, /"
    );
    Ok(())
}

fn get_export_path(root: &Path, name: &str) -> anyhow::Result<PathBuf> {
    let parts = name.split('/');
    let mut path = root.to_path_buf();
    for part in parts {
        validate_path_component(part)?;
        path.push(part);
    }
    Ok(path)
}

async fn export(
    db: impl iroh_blobs::store::Store,
    collection: Collection,
    path: &PathBuf,
) -> anyhow::Result<()> {
    println!("exporing data....");

    let root = PathBuf::from(path);

    for (name, hash) in collection.iter() {
        let target = get_export_path(&root, name)?;
        if target.exists() {
            eprintln!(
                "target {} already exists. Export stopped.",
                target.display()
            );
            eprintln!("You can remove the file or directory and try again. The download will not be repeated.");
            anyhow::bail!("target {} already exists", target.display());
        }
        db.export(
            *hash,
            target,
            ExportMode::TryReference,
            Box::new(move |_position| Ok(())),
        )
        .await?;
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct SendStatus {
    /// the multiprogress bar
    mp: MultiProgress,
}

impl SendStatus {
    fn new() -> Self {
        let mp = MultiProgress::new();
        mp.set_draw_target(ProgressDrawTarget::stderr());
        Self { mp }
    }

    fn new_client(&self) -> ClientStatus {
        let current = self.mp.add(ProgressBar::hidden());
        current.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.green} [{elapsed_precise}] {msg}")
                .unwrap(),
        );
        current.enable_steady_tick(Duration::from_millis(100));
        current.set_message("waiting for requests");
        ClientStatus {
            current: current.into(),
        }
    }
}

#[derive(Debug, Clone)]
struct ClientStatus {
    current: Arc<ProgressBar>,
}

impl Drop for ClientStatus {
    fn drop(&mut self) {
        if Arc::strong_count(&self.current) == 1 {
            self.current.finish_and_clear();
        }
    }
}

impl CustomEventSender for ClientStatus {
    fn send(&self, event: iroh_blobs::provider::Event) -> Boxed<()> {
        self.try_send(event);
        Box::pin(std::future::ready(()))
    }

    fn try_send(&self, event: provider::Event) {
        tracing::info!("{:?}", event);
        let msg = match event {
            provider::Event::ClientConnected { connection_id } => {
                Some(format!("{} got connection", connection_id))
            }
            provider::Event::TransferBlobCompleted {
                connection_id,
                hash,
                index,
                size,
                ..
            } => Some(format!(
                "{} transfer blob completed {} {} {}",
                connection_id,
                hash,
                index,
                HumanBytes(size)
            )),
            provider::Event::TransferCompleted {
                connection_id,
                stats,
                ..
            } => Some(format!(
                "{} transfer completed {} {}",
                connection_id,
                stats.send.write_bytes.size,
                HumanDuration(stats.send.write_bytes.stats.duration)
            )),
            provider::Event::TransferAborted { connection_id, .. } => {
                Some(format!("{} transfer completed", connection_id))
            }
            _ => None,
        };
        if let Some(msg) = msg {
            self.current.set_message(msg);
        }
    }
}

// async fn send(args: SendArgs) -> anyhow::Result<SendResources> {
//     let secret_key = get_or_create_secret(args.common.verbose > 0)?;
//     // create a magicsocket endpoint
//     let mut builder = Endpoint::builder()
//         .alpns(vec![iroh_blobs::protocol::ALPN.to_vec()])
//         .secret_key(secret_key)
//         .relay_mode(args.common.relay.into());
//     if args.ticket_type == AddrInfoOptions::Id {
//         builder =
//             builder.add_discovery(|secret_key| Some(PkarrPublisher::n0_dns(secret_key.clone())));
//     }
//     if let Some(addr) = args.common.magic_ipv4_addr {
//         builder = builder.bind_addr_v4(addr);
//     }
//     if let Some(addr) = args.common.magic_ipv6_addr {
//         builder = builder.bind_addr_v6(addr);
//     }
//
//     // use a flat store - todo: use a partial in mem store instead
//     let suffix = rand::thread_rng().gen::<[u8; 16]>();
//     let cwd = std::env::current_dir()?;
//     let blobs_data_dir = cwd.join(format!(".sendme-send-{}", HEXLOWER.encode(&suffix)));
//     if blobs_data_dir.exists() {
//         println!(
//             "can not share twice from the same directory: {}",
//             cwd.display(),
//         );
//         std::process::exit(1);
//     }
//
//     tokio::fs::create_dir_all(&blobs_data_dir).await?;
//
//     let endpoint = builder.bind().await?;
//     let ps = SendStatus::new();
//     let blobs = Blobs::persistent(&blobs_data_dir)
//         .await?
//         .events(ps.new_client().into())
//         .build(&endpoint);
//
//     let router = iroh::protocol::Router::builder(endpoint)
//         .accept(iroh_blobs::ALPN, blobs.clone())
//         .spawn()
//         .await?;
//
//     let path = args.path;
//     let (temp_tag, size, collection) = import(path.clone(), blobs.store().clone()).await?;
//     let hash = *temp_tag.hash();
//
//     // wait for the endpoint to figure out its address before making a ticket
//     let _ = router.endpoint().home_relay().initialized().await?;
//
//     // make a ticket
//     let mut addr = router.endpoint().node_addr().await?;
//     apply_options(&mut addr, args.ticket_type);
//     let ticket = BlobTicket::new(addr, hash, BlobFormat::HashSeq)?;
//     let entry_type = if path.is_file() { "file" } else { "directory" };
//     println!(
//         "imported {} {}, {}, hash {}",
//         entry_type,
//         path.display(),
//         HumanBytes(size),
//         print_hash(&hash, args.common.format)
//     );
//     if args.common.verbose > 0 {
//         for (name, hash) in collection.iter() {
//             println!("    {} {name}", print_hash(hash, args.common.format));
//         }
//     }
//     println!("to get this data, use");
//     println!("sendme receive {}", ticket);
//
//     drop(temp_tag);
//
//     // // Wait for exit
//     // tokio::signal::ctrl_c().await?;
//     //
//     // println!("shutting down");
//     // tokio::time::timeout(Duration::from_secs(2), router.shutdown()).await??;
//     // tokio::fs::remove_dir_all(blobs_data_dir).await?;
//     Ok(SendResources {
//         blobs_data_dir,
//         router,
//         ticket,
//     })
// }

// Helper function to wrap the connection in a thread-safe way
fn wrap_connection<T: Clone + Send + Sync + 'static>(
    conn: T,
) -> impl Fn() -> BoxFuture<'static, anyhow::Result<T>> {
    let conn = Arc::new(conn);
    move || {
        let conn = conn.clone();
        Box::pin(async move { Ok((*conn).clone()) })
    }
}

#[derive(Debug)]
struct SendResources {
    blobs_data_dir: PathBuf,
    router: iroh::protocol::Router,
    ticket: BlobTicket,
}

static SEND_RESOURCES: Mutex<Option<SendResources>> = Mutex::const_new(None);

#[tauri::command]
pub async fn send_files(path: String) -> anyhow::Result<String, String> {
    let secret_key = SecretKey::generate(rand::rngs::OsRng);
    let mut builder = Endpoint::builder()
        .alpns(vec![iroh_blobs::protocol::ALPN.to_vec()])
        .secret_key(secret_key)
        .relay_mode(RelayMode::Default);

    let suffix = rand::thread_rng().gen::<[u8; 16]>();
    // let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let download_dir = dirs::download_dir().ok_or_else(|| "No document directory".to_string())?;
    let sendme_dir = download_dir.join(".sendme");
    let blobs_data_dir = sendme_dir.join(format!(".sendme-send-{}", HEXLOWER.encode(&suffix)));
    if blobs_data_dir.exists() {
        return Err("Cannot share twice from the same directory".to_string());
    }

    tokio::fs::create_dir_all(&blobs_data_dir)
        .await
        .map_err(|e| e.to_string())?;

    let endpoint = builder.bind().await.map_err(|e| e.to_string())?;
    let blobs = Blobs::persistent(&blobs_data_dir)
        .await
        .map_err(|e| e.to_string())?
        .build(&endpoint);

    let router = iroh::protocol::Router::builder(endpoint)
        .accept(iroh_blobs::ALPN, blobs.clone())
        .spawn()
        .await
        .map_err(|e| e.to_string())?;

    let path = PathBuf::from(path);
    let (temp_tag, _size, _collection) = import(path, blobs.store().clone())
        .await
        .map_err(|e| e.to_string())?;

    let hash = *temp_tag.hash();
    let _ = router.endpoint().home_relay().initialized().await;
    let addr = router
        .endpoint()
        .node_addr()
        .await
        .map_err(|e| e.to_string())?;
    let ticket = BlobTicket::new(addr, hash, BlobFormat::HashSeq).map_err(|e| e.to_string())?;

    let resources = SendResources {
        blobs_data_dir,
        router,
        ticket: ticket.clone(),
    };

    *SEND_RESOURCES.lock().await = Some(resources);
    Ok(ticket.to_string())
}

#[tauri::command]
pub async fn shutdown() -> anyhow::Result<(), String> {
    if let Some(resources) = SEND_RESOURCES.lock().await.take() {
        println!("shutting down");

        tokio::time::timeout(Duration::from_secs(2), resources.router.shutdown())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;

        tokio::fs::remove_dir_all(resources.blobs_data_dir)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn receive_files(ticket: String, path: String) -> anyhow::Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
        rt.block_on(async move {
            let received_ticket = BlobTicket::from_str(&ticket).map_err(|e| e.to_string())?;
            println!("Received ticket: {}", received_ticket.to_string());
            let addr = received_ticket.node_addr().clone();
            let secret_key = SecretKey::generate(rand::rngs::OsRng);

            let builder = Endpoint::builder()
                .alpns(vec![])
                .secret_key(secret_key)
                .relay_mode(RelayMode::Default);

            let receive_path = PathBuf::from(path);

            let sendme_dir = receive_path.join(".sendme");

            let endpoint = builder.bind().await.map_err(|e| e.to_string())?;
            let dir_name = format!(".sendme-get-{}", received_ticket.hash().to_hex());
            let iroh_data_dir = sendme_dir.join(dir_name);

            let db = iroh_blobs::store::fs::Store::load(&iroh_data_dir)
                .await
                .map_err(|e| e.to_string())?;

            let connection = endpoint
                .connect(addr, iroh_blobs::protocol::ALPN)
                .await
                .map_err(|e| e.to_string())?;

            let hash_and_format = HashAndFormat {
                hash: received_ticket.hash(),
                format: received_ticket.format(),
            };

            let (send, _recv) = async_channel::bounded(32);
            let progress = iroh_blobs::util::progress::AsyncChannelProgressSender::new(send);

            let get_conn = || async move { Ok(connection) };
            iroh_blobs::get::db::get_to_db(&db, get_conn, &hash_and_format, progress)
                .await
                .map_err(|e| e.to_string())?;

            let collection = Collection::load_db(&db, &hash_and_format.hash)
                .await
                .map_err(|e| e.to_string())?;

            export(db, collection, &receive_path)
                .await
                .map_err(|e| e.to_string())?;
            tokio::fs::remove_dir_all(iroh_data_dir)
                .await
                .map_err(|e| e.to_string())?;

            Ok(())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
