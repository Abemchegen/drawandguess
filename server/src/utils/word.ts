import fs from "fs";
import path from "path";
import { Languages } from "../types";
import GraphemeSplitter from "grapheme-splitter";

const WORDS_DIR = path.join(__dirname, "../../words");
const LANGUAGE_FILE_NAMES: Record<Languages, string> = {
  [Languages.en]: "en",
  [Languages.am]: "am",
};

function resolveLanguage(language?: Languages | null): Languages {
  return Object.values(Languages).includes(language as Languages)
    ? (language as Languages)
    : Languages.en;
}
const CUSTOM_WORDS_WEIGHT = 3;

// Cache words in memory
const wordsCache: Record<Languages, string[]> = {} as Record<
  Languages,
  string[]
>;

// Load words for a language
function loadWords(language: Languages): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lang = resolveLanguage(language);
    if (wordsCache[lang]) {
      return resolve(wordsCache[lang]);
    }

    const fileName = LANGUAGE_FILE_NAMES[lang] ?? String(lang).toLowerCase();
    const filePath = path.join(WORDS_DIR, `${fileName}.txt`);
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        return reject(
          new Error(`Failed to load words for ${lang}: ${err.message}`)
        );
      }
      const text = data.replace(/^\uFEFF/, ""); 
      const words = text
        .split("\n")
        .map((line) => normalizeForCompare(line))
        .filter(Boolean);

      if (words.length === 0) {
        return reject(new Error(`No words found in ${filePath}`));
      }

      wordsCache[lang] = words;
      resolve(words);
    });
  });
}

// Function to get random words
export async function getRandomWords(
  n: number = 1,
  language: Languages,
  onlyCustomWords: boolean = false,
  customWords: string[] = []
): Promise<string[]> {
  try {
    const lang = resolveLanguage(language);
    let words: string[] = [];
    const normalizedCustom = customWords
        .map(w => normalizeForCompare(w))
        .filter(Boolean);

    if (onlyCustomWords) {
      if (normalizedCustom.length < n) {
        throw new Error(`Not enough custom words provided`);
      }
      words = normalizedCustom;
    } else {
      const loadedWords = await loadWords(lang);

      words = [
        ...loadedWords,
        ...Array(CUSTOM_WORDS_WEIGHT).fill(normalizedCustom).flat(),
      ];
      if (words.length < n) {
        throw new Error(`Not enough words available in ${lang}`);
      }
    }

    // Shuffle the words array
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }

    // Return the first n words
    return words.slice(0, n);
  } catch (error) {
    throw error;
  }
}

// Convert phrase to underscores
const splitter = new GraphemeSplitter();

export function convertToUnderscores(phrase: string): number[] {
  return phrase
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => splitter.splitGraphemes(word).length);
}

// for amharic
export function normalizeForCompare(s: string): string {
  return s
    .replace(/\s+/gu, " ")   
    .trim()
    .normalize("NFC");       
}