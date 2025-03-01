import { open } from "@tauri-apps/plugin-dialog";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useFile } from "../contexts/FileContext";

export const DragAndDrop = () => {
  const { path, setPath } = useFile();

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

  return (
    <div className="w-max p-[90px] flex items-center justify-center bg-[#F4F7FC] rouned-lg rounded-lg max-w-[382px] h-[211px]">
      {path ? (
        <div>
          <p className="text-[#4C5EF9] font-semibold">File Selected</p>
          <p className="text-[#595959]">{path}</p>
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
  );
};
