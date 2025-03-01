import copyIcon from "../assets/copy.png";

interface CopyTextProps {
  text: string;
}

export const CopyText = ({ text }: CopyTextProps) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="text-[#4C5EF9] font-semibold bg-[#F4F7FC] w-full p-4 rounded-lg flex items-center justify-between gap-4 relative">
      <p className="overflow-x-auto pr-8">{text}</p>
      <button
        onClick={handleCopy}
        className="hover:scale-90 transition-all h-6 w-6 cursor-pointer absolute top-2 right-2 bg-white p-1 rounded-sm"
      >
        <img src={copyIcon} alt="copy" />
      </button>
    </div>
  );
};
