import { createContext, ReactNode, useContext, useState } from "react";

export type FileContextType = {
  path: string;
  connected: boolean;
  setPath: (path: string) => void;
  setConnected: (connected: boolean) => void;
};

export const FileContext = createContext<FileContextType | undefined>(
  undefined,
);

export const FileProvier = ({ children }: { children: ReactNode }) => {
  const [path, setPath] = useState("");
  const [connected, setConnected] = useState(false);
  return (
    <FileContext.Provider value={{ path, setPath, connected, setConnected }}>
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
