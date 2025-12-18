import { Server, Socket } from "socket.io";
import {
  deleteRedisRoom,
  setRedisRoom,
  getRedisRoom as gR,
} from "../utils/redis";
import { getRoomFromSocket } from "../game/gameController";
import {
  GameEvent,
  Languages,
  Player,
  PlayerData,
  ReactionType,
  Settings,
  SettingValue,
} from "../types";
import {
  endGame,
  endRound,
  guessWord,
  handleDrawAction,
  handleReaction,
  handleNewPlayerJoin,
  handleNewRoom,
  handlePlayerLeft,
  handlePlayerLeftById,
  handleSettingsChange,
  handleVoteKick,
  startGame,
  wordSelected,
} from "../game/roomController";

const disconnectGrace = new Map<string, NodeJS.Timeout>();

function cancelDisconnectGrace(clientId?: string) {
  if (!clientId) return;
  const t = disconnectGrace.get(clientId);
  if (t) {
    clearTimeout(t);
    disconnectGrace.delete(clientId);
  }
}

export function setupSocket(io: Server) {
  io.on(GameEvent.CONNECT, (socket: Socket) => {
    console.log("A user connected:", socket.id);
    socket.on(
      GameEvent.JOIN_ROOM,
      async (
        playerData: PlayerData,
        language: Languages = Languages.en,
        roomId?: string,
        create?: boolean,
        clientIdArg?: string
      ) => {
        // Fallback to English if the client sends null/undefined
        const safeLanguage = language ?? Languages.en;
        const clientId = clientIdArg || String(socket.handshake.query.clientId || "");
        if (!playerData) {
          socket.emit("error", "playerData is required");
          return socket.disconnect();
        }

        if (!create && !roomId) {
          socket.emit("error", "Room Id is required");
          return socket.disconnect();
        }

        if (create) {
          cancelDisconnectGrace(clientId);
          return await handleNewRoom(
            io,
            socket,
            playerData,
            safeLanguage,
            clientId
          );
        } 
        if (roomId) {
          cancelDisconnectGrace(clientId);
          await handleNewPlayerJoin(roomId, socket, io, playerData, safeLanguage, clientId);
        }
      }
    );

    socket.on(GameEvent.START_GAME, async ({ words }: { words: string[] }) => {
      const room = await getRoomFromSocket(socket);
      if (!room) return;
      if (room.creator != socket.id) {
        return socket.emit("error", "You are not the host");
      } else if (room.gameState.currentRound != 0) {
        return socket.emit("error", "Game already started");
      } else if (room.players.length < 2) {
        return socket.emit("error", "At least 2 players requred to join game");
      }
      if (words) {
        room.settings.customWords = words;
        await setRedisRoom(room.roomId, room);
      }
      await startGame(room, io);
    });

    socket.on(GameEvent.DRAW_START, async (data: any) =>
      handleDrawAction(io, socket, "START", data)
    );
    socket.on(GameEvent.DRAW_POINT, async (data: any) =>
      handleDrawAction(io, socket, "POINT", data)
    );
    socket.on(GameEvent.DRAW_END, async (data: any) =>
      handleDrawAction(io, socket, "END", data)
    );
  

    socket.on(GameEvent.DRAW_CLEAR, async () =>
      handleDrawAction(io, socket, "CLEAR")
    );
    socket.on(GameEvent.DRAW_UNDO, async () =>
      handleDrawAction(io, socket, "UNDO")
    );
    socket.on(GameEvent.DRAW_SYNC, async () =>
      handleDrawAction(io, socket, "SYNC")
    );

    socket.on(GameEvent.GUESS, async (data: any) => {
      const { guess }: { guess: string } = data;
      const room = await getRoomFromSocket(socket);
      if (!room) return;
      await guessWord(room.roomId, guess, socket, io);
    });

    socket.on(GameEvent.WORD_SELECT, async (word: string) => {
      const room = await getRoomFromSocket(socket);
      if (!room) return;
      await wordSelected(room.roomId, word, io);
    });

    socket.on(GameEvent.REACTION, async (payload) => {
      await handleReaction(socket, io, payload?.type);
    });

    socket.on(
      GameEvent.CHANGE_SETTIING,
      async (setting: keyof Settings, value: any) => {
        await handleSettingsChange(socket, io, setting, value);
      }
    );

    socket.on(GameEvent.DISCONNECT, async () => {
      console.log("User disconnected:", socket.id);
      // Schedule cleanup with grace; capture room and playerId
      const room = await getRoomFromSocket(socket);
      const clientId = String(socket.handshake.query.clientId || "");
      if (!room) return;
      const player = room.players.find((p) => p.playerId === socket.id);
      if (!player) return;
      const graceMs = 8000;
      const t = setTimeout(async () => {
        try {
          // Use new helper to remove by ids without relying on socket.rooms
          await handlePlayerLeftById(room.roomId, player.playerId, io);
        } finally {
          if (clientId) disconnectGrace.delete(clientId);
        }
      }, graceMs);
      if (clientId) {
        const prev = disconnectGrace.get(clientId);
        if (prev) clearTimeout(prev);
        disconnectGrace.set(clientId, t);
      }
    });

    socket.on(GameEvent.VOTE_KICK, (playerId: string) => {
      handleVoteKick(socket, io, playerId);
    });
  });
}
