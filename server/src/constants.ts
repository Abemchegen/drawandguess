import { Languages, Settings } from "./types";

export const WORDCHOOSE_TIME = 10;
export const DRAWING_TIME = 60
export const END_ROUND_TIME = 5;
export const WINNER_SHOW_TIME = 10;

export const DRAWER_POINTS = 10;
// export const BONUS_PER_GUESS = 25;

export const INITIAL_HINTS_TIME = 30;
export const HINTS_TIME = 10;

export const DEFAULT_GAME_SETTINGS: Settings = {
  players: 8,
  customWords: [],
  onlyCustomWords: false,
  language: Languages.en,
  hints: 2,
};
