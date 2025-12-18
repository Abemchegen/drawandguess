
export enum RoomState {
  NOT_STARTED = "NOT_STARTED",
  PLAYER_CHOOSE_WORD = "PLAYER_CHOOSE_WORD",
  CHOOSING_WORD = "CHOOSING_WORD",
  DRAWING = "DRAWING",
  GUESSED = "GUESSED",
  TIMEUP = "TIMEUP",
  WINNER = "WINNER",
}

export interface PlayerData {
  name: string;
}

export type EndTurnData = {
  word: string;
  reason: RoundEndReason;
  time: number;
  clearDrawing?: boolean;
};

export enum RoundEndReason {
  ALL_GUESSED = 1,
  TIMEUP,
  LEFT,
}

export interface Player extends PlayerData {
  playerId: string;
  clientId?: string;
  score: number;
  guessed: boolean;
  guessedAt: Date | null;
  hasDrawn: boolean;
  joinedAt: number;
}

export interface GameState {
  currentRound: number;
  strokes?: Stroke[];
  guessedWords: string[];
  word: string;
  currentPlayer: number;
  currentDrawerId: string | null;
  roundOrder: string[];
  roundStartedAt: number;
  hintLetters: GuessedLetters[];
  roomState: RoomState;
  timerStartedAt: Date;
  phaseEndsAt?: number; // epoch ms when current phase should end
}

export interface MidGameState {
  currentRound: number;
  strokes?: Stroke[];
  guessedWords: string[];
  currentPlayer: number;
  currentDrawerId: string | null;
  roundOrder: string[];
  roundStartedAt: number;
  hintLetters: GuessedLetters[];
  roomState: RoomState;
  timerStartedAt: Date;
  phaseEndsAt?: number; // epoch ms when current phase should end
  word: number[];
  time: number
}


export interface GuessedLetters {
  index: number;
  letter: string;
}

export interface DrawData {
  x: number;
  y: number;
  color: string;
  lineWidth: number;
  end: boolean;
  playerId?: string;
  strokeId?: string; 
}

export interface Stroke {
  strokeId: string;
  color?: string;
  lineWidth?: number;
  points?: DrawData[];
  playerId?: string;
}


export interface Settings {
  players: number;
  onlyCustomWords: boolean;
  customWords: string[];
  language: Languages;
  hints: number;
}

export enum SettingValue {
  players = "players",
  onlyCustomWords = "onlyCustomWords",
  customWords = "customWords",
  language = "language",
  hints = "hints",
}

export interface Room {
  roomId: string; // Unique identifier for the room
  creator: string | null; // Player ID of the creator of the room
  players: Player[]; // List of players in the room
  gameState: GameState; // Current state of the game
  settings: Settings;
  vote_kickers: [string, string[]][];
}

export enum Languages {
  en = "English",
  am = "Amharic",
}

export enum GameEvent {
  // CLient Events
  CONNECT = "connect",
  DISCONNECT = "disconnecting",
  JOIN_ROOM = "joinRoom",
  LEAVE_ROOM = "leaveRoom",
  START_GAME = "startGame",
  DRAW = "draw",
  DRAW_CLEAR = "clear",
  DRAW_UNDO = "undo",
  GUESS = "guess",
  CHANGE_SETTIING = "changeSettings",
  WORD_SELECT = "wordSelect",
  VOTE_KICK = "voteKick",
  DRAW_SYNC = "drawSync",
  DRAW_START = "drawStart",
  DRAW_POINT = "drawPoint",
  DRAW_END = "drawEnd",
  


  // Server Events
  JOINED_ROOM = "joinedRoom",
  PLAYER_JOINED = "playerJoined",
  PLAYER_LEFT = "playerLeft",
  GAME_STARTED = "gameStarted",
  GAME_ENDED = "gameEnded",
  DRAW_DATA = "drawData",
  CLEAR_DRAW = "clearDraw",
  UNDO_DRAW = "undoDraw",
  GUESSED = "guessed",
  TURN_END = "turnEnded",
  CHOOSE_WORD = "chooseWord",
  CHOOSING_WORD = "choosingWord",
  WORD_CHOSEN = "wordChosen",
  GUESS_WORD_CHOSEN = "guessWordChosen",
  SETTINGS_CHANGED = "settingsChanged",
  GUESS_FAIL = "guessFail",
  GUESS_HINT = "guessHint",
  GAME_STATE = "gameState",
  KICKING_VOTE = "kickVote",
  KICKED = "kicked",
  DRAW_FULL = "drawFull",

  REACTION = "reaction",
}

export type ReactionType = "like" | "dislike";

export interface ReactionPayload {
  type: ReactionType;
  playerId?: string;
}
