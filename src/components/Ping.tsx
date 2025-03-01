import { invoke } from "@tauri-apps/api/core";
import { useFile } from "../contexts/FileContext";
import { cn } from "../utils/cn";

export const Ping = () => {
  const { connected, setConnected, setPath } = useFile();

  const handlePing = async () => {
    await invoke("shutdown");
    setConnected(false);
    setPath("");
  };

  return (
    <div
      onClick={handlePing}
      className="flex items-center justify-center gap-1 bg-[#F4F7FC] p-2 rounded-lg cursor-pointer"
    >
      {connected ? (
        <span className="relative flex size-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#DBDEFF]"></span>
          <span className="relative inline-flex size-3 rounded-full bg-[#4C5EF9]"></span>
        </span>
      ) : (
        <span className="relative flex size-3">
          <span className="relative inline-flex size-3 rounded-full bg-[#D6D6D6]"></span>
        </span>
      )}
      <p
        className={cn(
          "text-xs font-semibold",
          !connected && "text-[#D6D6D6]",
          connected && "text-black",
        )}
      >
        Connected
      </p>
    </div>
  );
};
