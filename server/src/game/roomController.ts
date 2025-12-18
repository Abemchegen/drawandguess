import { Server, Socket } from "socket.io";
import {
  DrawData,
  Languages,
  MidGameState,
  Player,
  PlayerData,
  ReactionType,
  Room,
  RoomState,
  RoundEndReason,
  Settings,
} from "../types";
import {
  deleteRedisRoom,
  getRedisRoom,
  setRedisRoom,
} from "../utils/redis";
import { GameEvent , Stroke} from "../types";
import { convertToUnderscores, getRandomWords, normalizeForCompare } from "../utils/word";
import { generateEmptyRoom } from "./gameController";
import { getRoomFromSocket } from "./gameController";
import {
  DRAWER_POINTS,
  DRAWING_TIME,
  END_ROUND_TIME,
  HINTS_TIME,
  WINNER_SHOW_TIME,
  WORDCHOOSE_TIME,
} from "../constants";
import GraphemeSplitter from "grapheme-splitter";

const timers = new Map();
const hintTimers = new Map();
const splitter = new GraphemeSplitter();
const inProgressStrokes = new Map<string, Map<string, Stroke>>();
const startGameTimers = new Map();

function ensurePlayerFlags(room: Room) {
  room.players = room.players.map((p) => ({
    ...p,
    hasDrawn: p.hasDrawn ?? false,
    joinedAt: p.joinedAt ?? Date.now(),
  }));
}

function startRound(room: Room) {
  ensurePlayerFlags(room);
  room.players = room.players.map((p) => ({ ...p, hasDrawn: false }));
  room.gameState.roundOrder = room.players.map((p) => p.playerId);
  room.gameState.currentDrawerId = null;
  room.gameState.currentPlayer = -1;
  room.gameState.roundStartedAt = Date.now();
}

function removeFromRoundOrder(room: Room, playerId: string) {
  room.gameState.roundOrder = (room.gameState.roundOrder || []).filter(
    (id) => id !== playerId
  );
}

function getCurrentDrawer(room: Room): Player | null {
  if (!room.gameState.currentDrawerId) return null;
  return (
    room.players.find((p) => p.playerId === room.gameState.currentDrawerId) ||
    null
  );
}

function pickNextDrawer(room: Room): Player | null {
  ensurePlayerFlags(room);
  const activeOrder = (room.gameState.roundOrder || []).filter((id) =>
    room.players.some((p) => p.playerId === id)
  );
  room.gameState.roundOrder = activeOrder;
  const nextId = activeOrder.find((id) => {
    const player = room.players.find((p) => p.playerId === id);
    return player && !player.hasDrawn;
  });
  if (!nextId) return null;

  const drawer = room.players.find((p) => p.playerId === nextId) || null;
  if (!drawer) return null;
  drawer.hasDrawn = true;
  room.gameState.currentDrawerId = drawer.playerId;
  room.gameState.currentPlayer = room.players.findIndex(
    (p) => p.playerId === drawer.playerId
  );
  return drawer;
}

function allEligibleDrew(room: Room) {
  ensurePlayerFlags(room);
  const eligible = (room.gameState.roundOrder || [])
    .map((id) => room.players.find((p) => p.playerId === id))
    .filter(Boolean) as Player[];
  if (eligible.length === 0) return false;
  return eligible.every((p) => p.hasDrawn);
}

export async function handleReaction(
  socket: Socket,
  io: Server,
  type: ReactionType | undefined
) {
  const room = await getRoomFromSocket(socket);
  if (!room) return;

  const currentDrawer = getCurrentDrawer(room);
  if (currentDrawer && currentDrawer.playerId === socket.id) return;

  if (type !== "like" && type !== "dislike") return;

  const socketData = socket.data as { lastReactionRound?: number };
  const currentRound = room.gameState.currentRound;
  if (socketData.lastReactionRound === currentRound) return;
  socketData.lastReactionRound = currentRound;

  io.to(room.roomId).emit(GameEvent.REACTION, {
    playerId: socket.id,
    type,
  });
}

function clearTimers(roomId: string) {
  const timer = timers.get(roomId);
  const hintTimer = hintTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(roomId);
  }
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimers.delete(roomId);
  }
}

function clearInProgressStrokes(roomId: string) {
  inProgressStrokes.delete(roomId);
}

function resetRoundState(
  room: Room,
  options?: {
    resetScores?: boolean;
    resetRoundCounters?: boolean;
    roomState?: RoomState;
    clearWord?: boolean;
    durationSeconds?: number;
  }
) {
  const {
    resetScores = false,
    resetRoundCounters = false,
    roomState,
    clearWord = true,
    durationSeconds,
  } =
    options || {};

  room.gameState.strokes = [];
  room.gameState.hintLetters = [];
  room.gameState.guessedWords = [];
  if (clearWord) room.gameState.word = "";
  room.gameState.timerStartedAt = new Date();
  room.gameState.phaseEndsAt = durationSeconds
    ? Date.now() + durationSeconds * 1000
    : undefined;

  room.players = room.players.map((p) => ({
    ...p,
    guessed: false,
    guessedAt: null,
    hasDrawn: false,
    ...(resetScores ? { score: 0 } : {}),
  }));

  if (resetRoundCounters) {
    room.gameState.currentRound = 0;
    room.gameState.currentPlayer = -1;
    room.gameState.currentDrawerId = null;
    room.gameState.roundOrder = [];
    room.gameState.roundStartedAt = Date.now();
  }

  if (roomState !== undefined) {
    room.gameState.roomState = roomState;
  }

  return room;
}

async function getCurrentPlayerOrEnd(roomId: string, io: Server) {
  const room = await getRedisRoom(roomId);
  if (!room) return null;
  ensurePlayerFlags(room);
  const drawerId = room.gameState.currentDrawerId;
  if (!drawerId) {
    await endRound(roomId, io, RoundEndReason.LEFT);
    return null;
  }
  const cp = room.players.find((p) => p.playerId === drawerId) || null;
  if (!cp) {
    await endRound(roomId, io, RoundEndReason.LEFT);
    return null;
  }
  return cp;
}

export async function startGame(room: Room, io: Server) {
  clearTimers(room.roomId);
  clearInProgressStrokes(room.roomId);
  resetRoundState(room, {
    resetScores: true,
    resetRoundCounters: true,
    roomState: RoomState.CHOOSING_WORD,
    durationSeconds: END_ROUND_TIME,
  });
  room.gameState.currentRound = 1;
  startRound(room);
  await setRedisRoom(room.roomId, room);
  io.to(room.roomId).emit(GameEvent.GAME_STARTED, room);
  await nextRound(room.roomId, io);
  return room;
}

export async function endRound(
  roomId: string,
  io: Server,
  reason: RoundEndReason = RoundEndReason.TIMEUP
) {
  let room = await getRedisRoom(roomId);
  if (!room) return;
  clearTimers(room.roomId);
  clearInProgressStrokes(room.roomId);

  const currentDrawerId = room.gameState.currentDrawerId;

  if (reason !== RoundEndReason.LEFT && currentDrawerId) {
    await givePoints(roomId, io, currentDrawerId);
    room = await getRedisRoom(roomId);
    if (!room) return;
  }

  const word = room.gameState.word;
  // Advance turn state; we don't rely on index anymore.
  room.gameState.currentDrawerId = null;
  room.gameState.currentPlayer = -1;
  await setRedisRoom(roomId, room);

  room = await getRedisRoom(roomId);
  if (!room) return;
  resetRoundState(room, {
    roomState: RoomState.GUESSED,
    durationSeconds: END_ROUND_TIME,
  });
  await setRedisRoom(roomId, room);

  const emitRoom = JSON.parse(JSON.stringify(room));
  const endedRound = Math.min(3, emitRoom.gameState.currentRound);

  io.to(room.roomId).emit(GameEvent.TURN_END, emitRoom, {
    endedRound,
    word: word,
    reason,
    time: END_ROUND_TIME,
    clearDrawing: true,
  });
  setTimeout(async () => {
    if (room.gameState.currentRound > 3) {
      return await endGame(roomId, io);
    }
    await nextRound(roomId, io);
  }, END_ROUND_TIME * 1000);
}

export async function guessWord(
  roomId: string,
  guess: string,
  socket: Socket,
  io: Server
) {
  const room = await getRedisRoom(roomId);
  if (!room) return;

  const player = room.players.find((e) => e.playerId === socket.id);
  if (!player) return;

  const currentPlayer = await getCurrentPlayerOrEnd(room.roomId, io);
  if (!currentPlayer) return;

  if (
    player.playerId !== currentPlayer.playerId &&
    normalizeForCompare(room.gameState.word).toLowerCase() === normalizeForCompare(guess).toLowerCase() &&
    !player.guessed
  ) {
    // Mark player as guessed
    player.guessed = true;
    player.guessedAt = new Date();

    await setRedisRoom(room.roomId, room);
    io.to(room.roomId).emit(GameEvent.GUESSED, player);

    // Check if all players (except the current one) have guessed
    if (
      room.players.every(
        (p) => p.guessed || p.playerId === currentPlayer.playerId
      )
    ) {
      await endRound(room.roomId, io, RoundEndReason.ALL_GUESSED);
    }
  } else {
    io.to(room.roomId).emit(GameEvent.GUESS, guess, player);
  }
}

export async function nextRound(roomId: string, io: Server) {
  let room = await getRedisRoom(roomId);
  if (!room) return;

  ensurePlayerFlags(room);
  room.gameState.roundOrder = (room.gameState.roundOrder || []).filter((id) =>
    room.players.some((p) => p.playerId === id)
  );

  if (allEligibleDrew(room)) {
    room.gameState.currentRound += 1;
    if (room.gameState.currentRound > 3) {
      await setRedisRoom(room.roomId, room);
      return await endGame(roomId, io);
    }
    startRound(room);
  }

  let currentPlayer = getCurrentDrawer(room);
  if (!currentPlayer) {
    currentPlayer = pickNextDrawer(room);
  }

  // If still no drawer, end game if not enough players
  if (!currentPlayer) {
    await setRedisRoom(room.roomId, room);
    if (room.players.length < 2) {
      return await endGame(roomId, io);
    }
    return; // Cannot proceed without a drawer but keep state
  }

  // Get random words
  const words = await getRandomWords(
    3,
    room.settings.language,
    room.settings.onlyCustomWords,
    room.settings.customWords
  );

  // Send words to current player
  io.to(currentPlayer.playerId).emit(GameEvent.CHOOSE_WORD, {
    words,
    time: WORDCHOOSE_TIME,
    currentRound: room.gameState.currentRound,
    drawerId: currentPlayer.playerId,
  });

  // Send choosing word event to other players in the room
  io.to(room.roomId)
    .except(currentPlayer.playerId)
    .emit(GameEvent.CHOOSING_WORD, {
      currentPlayer,
      time: WORDCHOOSE_TIME,
      currentRound: room.gameState.currentRound,
    });

  room.gameState.roomState = RoomState.CHOOSING_WORD;
  room.gameState.timerStartedAt = new Date();
  room.gameState.phaseEndsAt = Date.now() + WORDCHOOSE_TIME * 1000;
  await setRedisRoom(room.roomId, room);

  const timeOut = setTimeout(async () => {
    const room = await getRedisRoom(roomId);
    if (!room) return;

    let fallbackWords = words;

    async function fallbackFix(room) {
      if (room.gameState.word !== "") return;
      if (!fallbackWords || fallbackWords.length === 0) {
        fallbackWords = await getRandomWords(
          3,
          room.settings.language,
          room.settings.onlyCustomWords,
          room.settings.customWords
        );
      }

      if (!fallbackWords || fallbackWords.length === 0) {
        return await endRound(roomId, io, RoundEndReason.TIMEUP);
      }
    }
    fallbackFix(room);
    const randomWord =
      fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
    await wordSelected(roomId, randomWord, io);
  }, WORDCHOOSE_TIME * 1000);
  timers.set(roomId, timeOut);
}

export async function wordSelected(roomId: string, word: string, io: Server) {
  const room = await getRedisRoom(roomId);
  if (!room) return;
  clearTimers(room.roomId);

  room.gameState.word = word;
  room.gameState.roomState = RoomState.DRAWING;
  room.gameState.timerStartedAt = new Date();
  room.gameState.phaseEndsAt = Date.now() + DRAWING_TIME * 1000;
  await setRedisRoom(room.roomId, room);

  // await setRedisRoom(roomId, room);

  const player = await getCurrentPlayerOrEnd(room.roomId, io);
  if (!player) return;

  // Send the selected word to the drawer
  io.to(player.playerId).emit(GameEvent.WORD_CHOSEN, {
    word,
    time: 60,
    drawerId: player.playerId,
  });

  // convert the word into array of letter lengths
  const words_lens = convertToUnderscores(word);
  io.to(room.roomId).except(player.playerId).emit(GameEvent.GUESS_WORD_CHOSEN, {
    word: words_lens,
    time: 60,
    drawerId: player.playerId,
  });

  const timeOut = setTimeout(async () => {
    await endRound(roomId, io, RoundEndReason.TIMEUP);
  }, 60 * 1000);
  timers.set(roomId, timeOut);

  if (room.settings.hints > 0) {
    const hintsTimeout = setTimeout(async () => {
      await sendHint(io, roomId);
    }, 60 * 0.5 * 1000);
    hintTimers.set(roomId, hintsTimeout);
  }
}

export async function givePoints(roomId: string, io : Server, drawerId?: string) {
  const room = await getRedisRoom(roomId);
  if (!room) return;
  const now = new Date();
  const playersWhoGuessed = room.players.filter((player) => player.guessed);
  if (playersWhoGuessed.length === 0) {
    await setRedisRoom(room.roomId, room);
    return;
  }

  playersWhoGuessed.forEach((player, index) => {
    const points = 200;
    const timerStartedAt = new Date(room.gameState.timerStartedAt ?? now);
    const guessedAt = new Date(player.guessedAt ?? now);

    const secondsTaken = Math.abs(
      (timerStartedAt.getTime() - guessedAt.getTime()) / 1000
    );
    player.score += Math.round(Math.max(points - secondsTaken, 0));
  });

  // Prefer the explicitly passed drawer so we don't accidentally advance turns.
  const currentPlayer = drawerId
    ? room.players.find((p) => p.playerId === drawerId)
    : room.players.find((p) => p.playerId === room.gameState.currentDrawerId);
  if (!currentPlayer) return;
  const guessers =  Math.max(1, room.players.length - 1);
  const BONUS_PER_GUESS = 200 / guessers;
  const drawerReward = Math.round(
    DRAWER_POINTS + playersWhoGuessed.length * BONUS_PER_GUESS * 1.1
  );

  const cappedDrawerReward = Math.min(drawerReward, Math.round(200 * 1.25));
  currentPlayer.score += cappedDrawerReward;

  await setRedisRoom(room.roomId, room);
}

export async function endGame(roomId: string, io: Server) {
  const room = await getRedisRoom(roomId);
  if (!room) return;
  // If already ended, skip to avoid double resets overwriting newer state.
  if (room.gameState.currentRound === 0) return;

  clearTimers(room.roomId);
  clearInProgressStrokes(room.roomId);

  // Emit the final standings as seen at game end (scores intact for winner display).
  const finalRoom = JSON.parse(JSON.stringify(room)) as Room;

  const resetRoom = resetRoundState(
    {
      ...room,
      vote_kickers: [],
    },
    {
      resetScores: true,
      resetRoundCounters: true,
      roomState: RoomState.NOT_STARTED,
      clearWord: true,
    }
  );

  await setRedisRoom(roomId, resetRoom);
  io.to(roomId).emit(GameEvent.GAME_ENDED, { room: finalRoom, time: WINNER_SHOW_TIME });

 
}

export const handleNewRoom = async (
  io: Server,
  socket: Socket,
  playerData: PlayerData,
  language: Languages,
  clientId?: string,
) => {
  let roomId;
    roomId = await generateEmptyRoom(socket, language);
  // Ensure the creator joins the room before returning to avoid races where
  // the socket disconnects before join completes and leaves an orphan room.
  await handleNewPlayerJoin(roomId, socket, io, playerData, language, clientId);
};

export async function handleDrawAction(
  io : Server,
  socket: Socket,
  // action: "DRAW" | "CLEAR" | "UNDO" | "SYNC",
  action:  "CLEAR" | "UNDO" | "SYNC" | "START" | "POINT" | "END" ,
  drawData?: any
) {
  const room = await getRoomFromSocket(socket);
  if (!room || room.gameState.currentRound === 0) return;

  const currentPlayer = await getCurrentPlayerOrEnd(room.roomId, io);
  if (!currentPlayer) return;
  if (currentPlayer.playerId !== socket.id) return;

  room.gameState.strokes = room.gameState.strokes || [];

  switch (action) {
   
    case "START": {
      const { strokeId, color, lineWidth } = drawData ?? {};
      if (!strokeId) return;
      let rp = inProgressStrokes.get(room.roomId);
      if (!rp) {
        rp = new Map();
        inProgressStrokes.set(room.roomId, rp);
      }
      rp.set(strokeId, {
        strokeId,
        color,
        lineWidth,
        points: [],
        playerId: socket.id,
      });
      break;
    }
    case "POINT": {
      if (!drawData) return;
      const { strokeId, x, y, color, lineWidth, end } = drawData;
      const rp = inProgressStrokes.get(room.roomId);
      const stroke = rp?.get(strokeId);
      if (stroke) {
        const point = { x, y, color, lineWidth, end, strokeId, playerId: socket.id };
        stroke.points = stroke.points ?? [];
        stroke.points.push(point);
        socket.to(room.roomId).emit(GameEvent.DRAW_DATA, point);
      }
      break;
    }

    case "END": {
      const { strokeId } = drawData ?? {};
      const rp = inProgressStrokes.get(room.roomId);
      const stroke = rp?.get(strokeId);
      if (stroke) {
        stroke.points = stroke.points ?? []
        if (stroke.points.length > 0) {
          stroke.points[stroke.points.length - 1].end = true;
        }
        room.gameState.strokes = room.gameState.strokes ?? [];
        room.gameState.strokes.push(stroke);
        rp!.delete(strokeId);
        socket.to(room.roomId).emit(GameEvent.DRAW_FULL, room.gameState.strokes);
      }
      break;
    }
    
    case "CLEAR":
      room.gameState.strokes = [];
      socket.to(room.roomId).emit(GameEvent.CLEAR_DRAW);
      break;

    case "SYNC":
      socket.emit(GameEvent.DRAW_FULL, room.gameState.strokes ?? []);
      break;

    case "UNDO":
      if (!room.gameState.strokes || room.gameState.strokes.length === 0){
        
         return;
      }
      if (room.gameState.strokes.length === 0) return;     
      const removed = room.gameState.strokes.pop()!;
      io.to(room.roomId).emit(GameEvent.UNDO_DRAW, removed);
      break;
  }

  await setRedisRoom(room.roomId, room);
}

export const handlePlayerLeft = async (socket: Socket, io: Server) => {
  const room = await getRoomFromSocket(socket);
  if (!room) return;
  ensurePlayerFlags(room);

  const playerIndex = room.players.findIndex((e) => e.playerId === socket.id);
  if (playerIndex === -1) return;
  const player = room.players[playerIndex];
  if (!player) return;

  removeFromRoundOrder(room, player.playerId);

  // Ownership transfer 
  if (room.creator === player.playerId) {
    const nextOwner = room.players.find((p) => p.playerId !== socket.id);
    room.creator = nextOwner ? nextOwner.playerId : null;
    await setRedisRoom(room.roomId, room);
  }

  // If the leaving player is the current drawer, end the round
  if (room.gameState.currentDrawerId === player.playerId) {
    // Wipe any ongoing strokes from this drawer before ending the round so
    // remaining clients don't keep stale drawings.
    clearInProgressStrokes(room.roomId);
    room.gameState.strokes = [];
    room.gameState.currentDrawerId = null;
    await setRedisRoom(room.roomId, room);
    io.to(room.roomId).emit(GameEvent.CLEAR_DRAW);
    await endRound(room.roomId, io, RoundEndReason.LEFT);
    // After ending the round, if fewer than 2 players remain, end game immediately.
    const latest = await getRedisRoom(room.roomId);
    if (latest && latest.players.length < 2 && latest.gameState.currentRound >= 1) {
      await endGame(room.roomId, io);
      return;
    }
  }

  room.players = room.players.filter((e) => e.playerId != socket.id);
  if (room.players.length <= 0) {
    await deleteRedisRoom(room.roomId);
    clearTimers(room.roomId);
    clearInProgressStrokes(room.roomId);
    if (startGameTimers.has(room.roomId)) {
      clearTimeout(startGameTimers.get(room.roomId));
      startGameTimers.delete(room.roomId);
    }
    return
  }
  await setRedisRoom(room.roomId, room);
  socket.to(room.roomId).emit(GameEvent.PLAYER_LEFT, player);
  if (room.players.length < 2 && room.gameState.currentRound >= 1) {
    // Less than 2 players left in the room — immediately end game
    await endGame(room.roomId, io);
  }

  
};

export const handleSettingsChange = async <K extends keyof Settings> (
  socket: Socket,
  io: Server,
  setting: K,
  value: Settings[K]
) => {
  if (typeof setting !== "string") return;

  const room = await getRoomFromSocket(socket);
  if (!room) return;

  if (!(setting in room.settings))
    return socket.emit("error", "Invalid setting value");

  const settingType = typeof room.settings[setting];
  if (typeof value !== settingType)
    return socket.emit("error", `Invalid value type for ${setting}`);

  // Validate rules around onlyCustomWords and customWords size
  // If enabling onlyCustomWords, ensure there are enough custom words (players * 9)
  if (setting === "onlyCustomWords") {
    const wantOnly = Boolean(value as unknown as boolean);
    if (wantOnly) {
      const wordsCount = Array.isArray(room.settings.customWords)
        ? room.settings.customWords.length
        : 0;
      const required = Math.max(0, (room.settings.players || 0) * 9);
      if (wordsCount < required) {
        return socket.emit(
          "error",
          `Not enough custom words. Need at least ${required} words.`
        );
      }
    }
  }

  // If changing players while onlyCustomWords is enabled, ensure new players value
  // still satisfies the required number of custom words.
  if (setting === "players" && room.settings.onlyCustomWords) {
    const newPlayers = Number(value as unknown as number) || 0;
    const wordsCount = Array.isArray(room.settings.customWords)
      ? room.settings.customWords.length
      : 0;
    const required = Math.max(0, newPlayers * 9);
    if (wordsCount < required) {
      return socket.emit(
        "error",
        `Not enough custom words for ${newPlayers} players. Need at least ${required} words.`
      );
    }
  }

  // If updating customWords array while onlyCustomWords is enabled, ensure enough words
  if (setting === "customWords" && room.settings.onlyCustomWords) {
    const newWords = Array.isArray(value) ? (value as unknown as any[]) : [];
    const required = Math.max(0, (room.settings.players || 0) * 9);
    if (newWords.length < required) {
      return socket.emit(
        "error",
        `Not enough custom words. Need at least ${required} words.`
      );
    }
  }

  room.settings[setting] = value ;

  await setRedisRoom(room.roomId, room);
  io.to(room.roomId).emit(GameEvent.SETTINGS_CHANGED, setting, value);
};

export async function sendHint(io: Server, roomId: string) {
  const room = await getRedisRoom(roomId);
  if (!room) return;
  const word = room.gameState.word;
  if (!word) return;
  if (room.gameState.hintLetters.length >= room.settings.hints) return;

  if (hintTimers.get(roomId)) {
    clearTimeout(hintTimers.get(roomId));
  }

  // Cannot make the whole word appear randomly
  if (room.gameState.hintLetters.length  >= word.length - 1) return;

  // const torevealIndices = new Set<number>();
  const alreadyRevealed = new Set(room.gameState.hintLetters.map(h => h.index));
  const chars = splitter.splitGraphemes(word);
  const remaining = chars
  .map((c, i) => ({ c, i }))
  .filter(x => !/\s/u.test(x.c) && !alreadyRevealed.has(x.i))
  .map(x => x.i);

  if (remaining.length === 0) return;

  const chosenIndex = remaining[Math.floor(Math.random() * remaining.length)];
  const hint = { index: chosenIndex, letter: chars[chosenIndex] };

  const currentPlayer = await getCurrentPlayerOrEnd(roomId, io);
  if (!currentPlayer) return;

  room.gameState.hintLetters.push(hint);
  await setRedisRoom(room.roomId, room);

  // Emit hint to the room (except the current drawer)
  // console.log(`Emitting hint for room ${roomId}: index=${hint.index} letter=${hint.letter}`);
  try {
    io.to(roomId).except(currentPlayer.playerId).emit(GameEvent.GUESS_HINT, hint);
  } catch (err) {
    console.error('Failed to emit hint via except(), falling back to manual broadcast', err);
    // Fallback: manually emit to all sockets in room except current player
    io.in(roomId).fetchSockets().then((sockets) => {
      sockets.forEach((s) => {
        if (s.id !== currentPlayer.playerId) {
          s.emit(GameEvent.GUESS_HINT, hint);
        }
      });
    }).catch((e) => console.error('Failed to fallback emit sockets', e));
  }

  if (room.gameState.hintLetters.length !== room.settings.hints) {
    hintTimers.set(roomId, setTimeout(sendHint, HINTS_TIME * 1000, io, roomId));
  }
}

export async function handleNewPlayerJoin(
  roomId: string,
  socket: Socket,
  io: Server,
  playerData: PlayerData,
  language: Languages,
  clientId?: string
) {
  const room = await getRedisRoom(roomId);
  if (!room) {
      socket.emit("error", "The room you're trying to join does not exist.");
      return socket.disconnect();
    // return handleNewRoom(io, socket, playerData, language, false);
  }

  if (room.players.length >= room.settings.players) {
    socket.emit("error", "The room you're trying to join is full");
    return socket.disconnect();
  }

  // Try to find existing player by stable clientId and reuse their slot
  const cid = clientId || String(socket.handshake.query.clientId || "");

  const existingByClient = cid
    ? room.players.find((p) => p.clientId === cid)
    : undefined;

  let player: Player;
  if (existingByClient) {
    player = {
      ...existingByClient,
      playerId: socket.id,
      clientId: cid || existingByClient.clientId,
    };

    // If this reconnecting player was the current drawer, remap drawer id
    if (room.gameState.currentDrawerId === existingByClient.playerId) {
      room.gameState.currentDrawerId = socket.id;
    }
    // Also remap any occurrences in roundOrder
    room.gameState.roundOrder = (room.gameState.roundOrder || []).map((id) =>
      id === existingByClient.playerId ? socket.id : id
    );
  } else {
    player = {
      ...playerData,
      score: 0,
      playerId: socket.id,
      clientId: cid || undefined,
      guessed: false,
      guessedAt: null,
      hasDrawn: false,
      joinedAt: Date.now(),
    };
  }

    console.log("join")


  // Prevent duplicate entries for the same socket id
  const existingIndex = existingByClient
    ? room.players.findIndex((p) => p.clientId === cid)
    : room.players.findIndex((p) => p.playerId === socket.id);
  if (existingIndex !== -1) {
    // Replace existing entry (keep position)
    room.players[existingIndex] = { ...room.players[existingIndex], ...player };
  } else {
    room.players.push(player);
  }

  await setRedisRoom(roomId, room);

  socket.join(roomId);
  socket.emit(GameEvent.JOINED_ROOM, room);
  // Notify other players about the new join (exclude the joining socket)
  socket.to(room.roomId).emit(GameEvent.PLAYER_JOINED, player);


  if (room.gameState.roomState != RoomState.NOT_STARTED) {
    handleInBetweenJoin(roomId, socket, io);
  }
}

// Helper used by disconnect grace timeout to remove player by id
export const handlePlayerLeftById = async (roomId: string, playerId: string, io: Server) => {
  const room = await getRedisRoom(roomId);
  if (!room) return;
  ensurePlayerFlags(room);

  const playerIndex = room.players.findIndex((e) => e.playerId === playerId);
  if (playerIndex === -1) return;
  const player = room.players[playerIndex];
  if (!player) return;

  removeFromRoundOrder(room, player.playerId);

  // Ownership transfer
  if (room.creator === player.playerId) {
    const nextOwner = room.players.find((p) => p.playerId !== player.playerId);
    room.creator = nextOwner ? nextOwner.playerId : null;
    await setRedisRoom(room.roomId, room);
  }

  // If the leaving player is the current drawer, end the round
  if (room.gameState.currentDrawerId === player.playerId) {
    clearInProgressStrokes(room.roomId);
    room.gameState.strokes = [];
    room.gameState.currentDrawerId = null;
    await setRedisRoom(room.roomId, room);
    io.to(room.roomId).emit(GameEvent.CLEAR_DRAW);
    await endRound(room.roomId, io, RoundEndReason.LEFT);
    const latest = await getRedisRoom(room.roomId);
    if (latest && latest.players.length < 2 && latest.gameState.currentRound >= 1) {
      await endGame(room.roomId, io);
      return;
    }
  }

  room.players = room.players.filter((e) => e.playerId != player.playerId);
  if (room.players.length <= 0) {
    await deleteRedisRoom(room.roomId);
    clearTimers(room.roomId);
    clearInProgressStrokes(room.roomId);
    if (startGameTimers.has(room.roomId)) {
      clearTimeout(startGameTimers.get(room.roomId));
      startGameTimers.delete(room.roomId);
    }
    return;
  }
  await setRedisRoom(room.roomId, room);
  io.to(room.roomId).emit(GameEvent.PLAYER_LEFT, player);
  if (room.players.length < 2 && room.gameState.currentRound >= 1) {
    await endGame(room.roomId, io);
  }
};

export async function handleInBetweenJoin(
  roomId: string,
  socket: Socket,
  io: Server
) {
  const room = await getRedisRoom(roomId);
  if (!room) return;
  socket.join(roomId);
  ensurePlayerFlags(room);
  const currentPlayerIndex = room.players.findIndex(
    (p) => p.playerId === room.gameState.currentDrawerId
  );
  const currentPlayerObj = currentPlayerIndex >= 0 ? room.players[currentPlayerIndex] : null;

  // subtract now from timerStartedAt
  const now = Date.now();
  const phaseEndsAt = room.gameState.phaseEndsAt ?? 0;
  const timeLeftMs = phaseEndsAt ? phaseEndsAt - now : 0;
  const time = Math.max(0, Math.round(timeLeftMs / 1000));

  const midgameState : MidGameState =  {
    ...room.gameState,
    word:
      room.gameState.roomState === RoomState.CHOOSING_WORD
        ? []
        : convertToUnderscores(room.gameState.word),
    time,
    currentPlayer: currentPlayerIndex >= 0 ? currentPlayerIndex : -1,
  };
  console.log("in middle join")
  socket.emit(GameEvent.GAME_STATE,  midgameState);
  socket.emit(GameEvent.DRAW_FULL, room.gameState.strokes ?? []);
  // Re-broadcast the active phase timer so reconnecting client aligns with others.
  if (room.gameState.roomState === RoomState.CHOOSING_WORD) {
    if (currentPlayerObj) {
      socket.emit(GameEvent.CHOOSING_WORD, {
        currentPlayer: currentPlayerObj,
        time: Math.max(0, time),
        currentRound: room.gameState.currentRound,
          drawerId: room.gameState.currentDrawerId,
      });
    }
  } else if (room.gameState.roomState === RoomState.DRAWING) {
    const isDrawer = room.gameState.currentDrawerId === socket.id;
    if (isDrawer) {
      socket.emit(GameEvent.WORD_CHOSEN, {
        word: room.gameState.word,
        time: Math.max(0, time),
        drawerId: room.gameState.currentDrawerId,
      });
    } else {
      socket.emit(GameEvent.GUESS_WORD_CHOSEN, {
        word: convertToUnderscores(room.gameState.word),
        time: Math.max(0, time),
        drawerId: room.gameState.currentDrawerId,
      });
    }
  }
}

export async function handleVoteKick(
  socket: Socket,
  io: Server,
  playerId: string
) {
  const room = await getRoomFromSocket(socket);
  if (!room) return;

  const voteKickers = room.vote_kickers;
  const player = room.players.find((e) => e.playerId === playerId);
  if (!player) return;

  const voter = room.players.find((e) => e.playerId === socket.id);
  if (!voter) return;

  const voteKicker = voteKickers.find((e) => e[0] === playerId);
  if (!voteKicker) {
    voteKickers.push([playerId, [voter.playerId]]);
  } else {
    if (voteKicker[1].includes(voter.playerId)) return;
    voteKicker[1].push(voter.playerId);
  }

  const votesNeeded = Math.ceil(room.players.length / 2);
  const votes = voteKickers.find((e) => e[0] === playerId)?.[1].length ?? 0;

  io.to(room.roomId).emit(GameEvent.KICKING_VOTE, {
    voter: voter.name,
    player: player.name,
    votes,
    votesNeeded,
  });

  if (votes >= votesNeeded) {
    const kickedId = playerId;
    const wasDrawer = room.gameState.currentDrawerId === kickedId;
    const wasCreator = room.creator === kickedId;

    removeFromRoundOrder(room, kickedId);
    room.players = room.players.filter((e) => e.playerId !== kickedId);
    room.vote_kickers = room.vote_kickers.filter((e) => e[0] !== kickedId);

    if (wasCreator) {
      const nextOwner = room.players.find((p) => p.playerId !== kickedId) || null;
      room.creator = nextOwner ? nextOwner.playerId : null;
    }

    await setRedisRoom(room.roomId, room);

    io.to(room.roomId).emit(GameEvent.PLAYER_LEFT, player);
    io.to(kickedId).emit(GameEvent.KICKED);
    io.sockets.sockets.get(kickedId)?.leave(room.roomId);

    if (wasDrawer) {
      clearInProgressStrokes(room.roomId);
      room.gameState.strokes = [];
      room.gameState.currentDrawerId = null;
      await setRedisRoom(room.roomId, room);
      io.to(room.roomId).emit(GameEvent.CLEAR_DRAW);
      await endRound(room.roomId, io, RoundEndReason.LEFT);
    } else if (room.players.length < 2 && room.gameState.currentRound >= 1) {
      await endGame(room.roomId, io);
    }
  }
  await setRedisRoom(room.roomId, room);
}
