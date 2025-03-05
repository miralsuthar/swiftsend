import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

export const Receive = () => {
  const [ticket, setTicket] = useState("");

  async function receive(e: React.FormEvent) {
    e.preventDefault();
    if (ticket.length === 0) return;
    const filePath = await open({
      multiple: false,
      directory: true,
    });

    if (!filePath) return;

    await invoke("receive_files", { ticket: ticket, path: filePath });
  }

  return (
    <div className="bg-[#F4F7FC] border border-[#E7EBEF] w-full p-2 rounded-lg">
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
    </div>
  );
};
