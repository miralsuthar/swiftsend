import { open } from "@tauri-apps/plugin-dialog";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useFile } from "../contexts/FileContext";
import { AnimatePresence, motion } from "framer-motion";

export const DragAndDrop = () => {
  const { path, setPath } = useFile();

  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(100);
  const [isUploading, setIsUploading] = useState(false);

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
    });

    if (progress >= total) {
      setTimeout(() => setIsUploading(false), 500);
    }

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

  useEffect(() => {
    if (path) {
      setIsUploading(true);
    }
  }, [path]);

  const percent = Math.min(100, (progress / total) * 100).toFixed(2);

  return (
    <div>
      <div className="w-max p-[90px] flex items-center justify-center bg-[#F4F7FC] rouned-lg rounded-lg max-w-[382px] h-[211px] border border-dashed border-gray-300">
        {path ? (
          <div>
            <p className="text-[#4C5EF9] font-semibold">File Selected</p>
            <p className="text-[#595959] w-full text-wrap">{path}</p>
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
    </div>
  );
};
