import copyIcon from "../assets/copy.png";
import { motion } from "framer-motion";

interface CopyTextProps {
  text: string;
}

export const CopyText = ({ text }: CopyTextProps) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="text-[#4C5EF9] font-semibold bg-[#F4F7FC] w-full p-4 rounded-lg flex items-center justify-between gap-4 relative">
      <p className="scrollbar overflow-x-auto pr-8">{text}</p>
      <motion.button
        initial={{ scale: 1 }}
        transition={{
          type: "spring",
          bounce: 0.25,
          damping: 10,
          stiffness: 100,
        }}
        whileHover={{
          scale: 0.9,
        }}
        whileTap={{
          scale: 1.5,
        }}
        onClick={handleCopy}
        className="transition-all h-6 w-6 cursor-pointer absolute top-2 right-2 bg-white p-1 rounded-sm"
      >
        <img src={copyIcon} alt="copy" />
      </motion.button>
    </div>
  );
};
