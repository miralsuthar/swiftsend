import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../utils/cn";

export const Receive = () => {
  const [ticket, setTicket] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(100);

  async function receive(e: React.FormEvent) {
    e.preventDefault();
    if (ticket.length === 0) return;
    const filePath = await open({
      multiple: false,
      directory: true,
    });

    setIsDownloading(true);
    if (!filePath) return;

    await invoke("receive_files", { ticket: ticket, path: filePath });
  }

  useEffect(() => {
    const unlisten = listen("download_progress", (event) => {
      const { progress, total } = event.payload as any;
      setProgress(progress);
      setTotal(total);

      if (progress >= total) {
        setTimeout(() => setIsDownloading(false), 500);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const percent = Math.min(100, (progress / total) * 100).toFixed(2);

  return (
    <motion.div>
      <motion.div
        animate={{
          borderRadius: isDownloading ? "0.5rem 0.5rem 0 0" : "0.5rem",
        }}
        className={cn(
          "bg-[#F4F7FC] border border-[#E7EBEF] w-full p-2 rounded-lg",
          isDownloading && "rounded-t-lg rounded-b-none",
        )}
        transition={{
          duration: 0.3,
        }}
      >
        <form onSubmit={receive} className="flex items-center justify-between">
          <input
            required
            className="bg-transparent w-full placeholder:font-semibold placeholder:text-[#B2B2B2] outline-none"
            placeholder="Paste your ticket"
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
          />
          <button
            type="submit"
            disabled={ticket.length === 0}
            className="text-white bg-[#4C5EF9] px-[30px] py-[5px] rounded-lg cursor-pointer disabled:bg-[#D6D6D6]"
          >
            Receive
          </button>
        </form>
      </motion.div>
      <AnimatePresence>
        {isDownloading && (
          <motion.div
            initial={{
              height: 0,
              opacity: 0,
            }}
            animate={{
              height: "20px",
              opacity: 1,
            }}
            transition={{ duration: 0.1 }}
            exit={{
              height: 0,
              opacity: 0,
            }}
            className="bg-[#E7EBEF] h-5 w-full rounded-b-lg flex items-center justify-start px-2"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ ease: "linear" }}
              className="bg-[#4C5EF9] h-1 rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
