import { open } from "@tauri-apps/plugin-dialog";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useFile } from "../contexts/FileContext";
import { AnimatePresence, motion } from "framer-motion";
import { platform } from "@tauri-apps/plugin-os";
import folderImage from "../assets/folder.svg";

export const DragAndDrop = () => {
  const { path, setPath, connected } = useFile();

  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(100);
  const [isUploading, setIsUploading] = useState(false);

  const currentPlatform = platform();

  const handleRemove = () => {
    if (connected) return;
    setPath("");
  };

  const handleBrowseFolder = async () => {
    const filePath = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "All Files",
          extensions: [
            "txt",
            "jpg",
            "jpeg",
            "png",
            "gif",
            "pdf",
            "doc",
            "docx",
            "xls",
            "xlsx",
            "csv",
            "mp4",
            "mp3",
            "zip",
            "rar",
            "7z",
            "tar",
            "gz",
          ],
        },
      ],
    });

    if (filePath) {
      console.log(filePath);
      setPath(filePath);
    }
  };

  useEffect(() => {
    const unlisten = listen("upload_progress", (event) => {
      const { progress, total } = event.payload as any;
      setProgress(progress);
      setTotal(total);

      // Start uploading when we receive the first progress event
      if (progress === 0) {
        setIsUploading(true);
      }

      // Reset state when upload is complete
      if (progress >= total) {
        setTimeout(() => {
          setIsUploading(false);
          setProgress(0);
        }, 500);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    let unlisten: Promise<UnlistenFn>;

    const setupListener = async () => {
      unlisten = listen("tauri://drag-drop", (event) => {
        const file = (event.payload as any)["paths"][0] as string;
        console.log("File: ", file);
        setPath(file);
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten;
      }
    };
  }, []);

  const percent = Math.min(100, (progress / total) * 100).toFixed(2);

  return (
    <div className="relative overflow-hidden">
      <div className="p-[90px] flex items-center justify-center bg-[#F4F7FC] rouned-lg rounded-lg w-[382px] h-[211px] border border-dashed border-gray-300">
        {path ? (
          <div className="flex flex-col items-center justify-center gap-2">
            <motion.div
              initial={{
                scale: 0,
                opacity: 0,
              }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              transition={{
                type: "spring",
                bounce: 0.25,
                damping: 10,
                stiffness: 100,
              }}
              exit={{
                scale: 0,
                opacity: 0,
              }}
              className="w-20"
            >
              <img className="w-full" src={folderImage} />
            </motion.div>
            <motion.p
              initial={{
                opacity: 0,
                scale: 0,
              }}
              animate={{
                opacity: 1,
                scale: 1,
              }}
              transition={{
                duration: 0.5,
              }}
              exit={{
                opacity: 0,
                scale: 0,
              }}
              className="text-center"
            >
              {path.substring(path.lastIndexOf("/") + 1)}
            </motion.p>
          </div>
        ) : (
          <div className="text-sm flex flex-col items-center justify-center gap-3 ">
            <p className="text-center font-semibold text-[#595959]">
              Drag your documents, phots or videos here to <br /> start sharing
            </p>
            <div className="flex items-center gap-2">
              <div className="bg-[#D6D6D6] w-11 h-0.5 rounded-full" />
              <p className="text-[#D6D6D6]">OR</p>
              <div className="bg-[#D6D6D6] w-11 h-0.5 rounded-full" />
            </div>
            <button
              className="text-white bg-[#4C5EF9] px-[17px] py-[10px] rounded-lg cursor-pointer"
              onClick={handleBrowseFolder}
            >
              Browse Folder
            </button>
          </div>
        )}
      </div>
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{
              height: 0,
              opacity: 0,
            }}
            animate={{
              height: "40px",
              opacity: 1,
            }}
            transition={{ duration: 0.1 }}
            exit={{
              height: 0,
              opacity: 0,
            }}
            className="h-10 mx-auto bg-[#F8FAFC] w-8/12 rounded-b-lg flex items-center justify-start px-2"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ ease: "linear" }}
              className="bg-[#4C5EF9] h-2 rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!connected && path && (
          <motion.div
            initial={{
              opacity: 0,
            }}
            transition={{
              duration: 0.5,
            }}
            exit={{
              opacity: 0,
            }}
            className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center"
            whileHover={{ opacity: 1 }}
          >
            <div className="w-full h-full bg-white blur-xl" />
            <motion.button
              onClick={handleRemove}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-md bg-[#4C5EF9] cursor-pointer text-white"
            >
              Remove
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
