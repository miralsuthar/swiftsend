import { createContext, ReactNode, useContext, useState } from "react";

export type FileContextType = {
  path: string;
  connected: boolean;
  setPath: (path: string) => void;
  setConnected: (connected: boolean) => void;
  ticket: string;
  setTicket: (ticket: string) => void;
};

export const FileContext = createContext<FileContextType | undefined>(
  undefined,
);

export const FileProvier = ({ children }: { children: ReactNode }) => {
  const [path, setPath] = useState("");
  const [connected, setConnected] = useState(false);
  const [ticket, setTicket] = useState("");
  return (
    <FileContext.Provider
      value={{ path, setPath, connected, setConnected, ticket, setTicket }}
    >
      {children}
    </FileContext.Provider>
  );
};

export const useFile = () => {
  const context = useContext(FileContext);
  if (context === undefined) {
    throw new Error("useFile must be used within a FileProvider");
  }

  return context;
};
