import { invoke } from "@tauri-apps/api/core";
import { DragAndDrop } from "./components/DragAndDrop";
import { FileProvier, useFile } from "./contexts/FileContext";
import { Receive } from "./components/Receive";
import { Ping } from "./components/Ping";

function MainContent() {
  const { path, setConnected } = useFile();

  const shareFileHandler = async () => {
    setConnected(true);
    await invoke("send_files", { path: path });
  };

  return (
    <main className="px-20 py-20 flex flex-col gap-10 relative">
      <div className="absolute top-5 right-5">
        <Ping />
      </div>
      <div className="flex items-center justify-between">
        <DragAndDrop />
        <button
          className="text-white bg-[#4C5EF9] px-[30px] py-[10px] rounded-lg cursor-pointer disabled:bg-[#D6D6D6]"
          disabled={path.length === 0}
          onClick={shareFileHandler}
        >
          Share
        </button>
      </div>
      <div>
        <Receive />
      </div>
    </main>
  );
}

function App() {
  return (
    <FileProvier>
      <MainContent />
    </FileProvier>
  );
}

export default App;
