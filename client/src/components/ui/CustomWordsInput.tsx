import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CustomWordsInputProps {
  words: string[];
  setWords: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function CustomWordsInput({
  words,
  setWords,
}: CustomWordsInputProps) {
  const [input, setInput] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const newWord = input.trim().replace(/,$/, ""); // Remove trailing comma
      if (newWord) {
        setWords([...words, newWord]);
        setInput(""); // Clear input
      }
    }
  };

  const removeWord = (index: number) => {
    setWords(words.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        <AnimatePresence>
          {words.map((word, index) => (
            <motion.div
              key={word} // Using word as key for unique animations
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
              className="bg-card text-text-primary px-3 py-1 rounded-full flex items-center space-x-2"
            >
              <span>{word}</span>
              <button
                className="text-error-main font-bold hover:opacity-80"
                onClick={() => removeWord(index)}
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <textarea
        className="w-full border border-theme rounded-lg p-2 bg-input text-text-primary outline-none"
        placeholder="Type a word and press ','"
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        rows={2}
      />
    </div>
  );
}
