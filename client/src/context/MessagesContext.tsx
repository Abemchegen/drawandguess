import React, { createContext, useEffect, useRef, useState } from "react";
import {
  EndTurnData,
  GameEvent,
  Player,
  ReactionPayload,
  ReactionType,
} from "../types";
import { socket } from "../socketHandler";
import { IMessage, MessageType } from "../components/Chat/Message";
import { useRoom } from "./RoomContext";

interface MessagesContextValue {
  messages: IMessage[];
}

// eslint-disable-next-line react-refresh/only-export-components
export const MessageContext = createContext<MessagesContextValue | undefined>(
  undefined
);

export default function MessagesContext({
  children,
}: {
  children: React.ReactNode;
}) {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const roomCtx = useRoom();
  const { currentPlayer, me, myTurn, players } = roomCtx;
  const hasWelcomedSelf = useRef(false);

  function addReactionMessage(payload: ReactionPayload) {
    if (!payload?.type) return;
    const sender = players.find((p) => p.playerId === payload.playerId);
    if (!sender) return;
    // if (mutedPlayers.includes(sender.playerId)) return;

    const verb = payload.type === "like" ? "liked" : "disliked";
    setMessages((prev) => [
      ...prev,
      {
        sender: sender.name,
        message: `${verb} the drawing`,
        type: MessageType.Reaction,
        reactionType: payload.type as ReactionType,
      },
    ]);
  }

  function addMessageToChat(message: string, player: Player) {
    // && player.playerId != socket.id
    if (player.guessed) return;
    // if (mutedPlayers.includes(player.playerId)) return;
    if (myTurn) {
      setMessages((prev) => [
        ...prev,
        { sender: player.name, message, type: MessageType.GuessClose },
      ]);
    }
    setMessages((prev) => [
      ...prev,
      { sender: player.name, message, type: MessageType.Guess },
    ]);
  }

  function addPlayerJoinMessage(player: Player) {
    setMessages((prev) => [
      ...prev,
      { sender: player.name, message: "", type: MessageType.PlayerJoin },
    ]);
  }

  function addPlayerLeftMessage(player: Player) {
    setMessages((prev) => [
      ...prev,
      { sender: player.name, message: "", type: MessageType.PlayerLeft },
    ]);
  }
  function addErrorMessage(message: string) {
    setMessages((prev) => [
      ...prev,
      { sender: "", message, type: MessageType.Error },
    ]);
  }

  function addGuessedMessage(player: Player) {
    setMessages((prev) => [
      ...prev,
      {
        sender: player.name,
        message: "has guessed the word",
        type: MessageType.WordGuessed,
      },
    ]);
  }
  function addWordChosen(_: unknown, payload?: { drawerId?: string }) {
    const drawer = payload?.drawerId
      ? players.find((p) => p.playerId === payload.drawerId) ?? null
      : currentPlayer;
    if (!drawer) return;
    setMessages((prev) => [
      ...prev,
      {
        sender: drawer.name,
        message: "is now drawing",
        type: MessageType.WordChoosen,
      },
    ]);
  }

  function addWordWas(_: unknown, data: EndTurnData) {
    if (!currentPlayer) return;
    setMessages((prev) => [
      ...prev,
      {
        sender: "",
        message: data.word,
        type: MessageType.WordWas,
      },
    ]);
  }

  function clearChat() {
    setMessages([]);
  }

  function handleVoteKicking({
    voter,
    player: votee,
    votes,
    votesNeeded,
  }: {
    voter: string;
    player: string;
    votes: number;
    votesNeeded: number;
  }) {
    setMessages([
      ...messages,
      {
        sender: "",
        message: `${voter} is voting to kick ${votee} (${votes}/${votesNeeded})`,
        type: MessageType.VoteKick,
      },
    ]);
  }

  useEffect(() => {
    if (me && !hasWelcomedSelf.current) {
      addPlayerJoinMessage(me);
      hasWelcomedSelf.current = true;
    }
    if (!me) {
      hasWelcomedSelf.current = false;
    }
  }, [me]);

  useEffect(() => {
    socket.on(GameEvent.GAME_STARTED, clearChat);
    socket.on(GameEvent.GUESS, addMessageToChat);
    socket.on(GameEvent.PLAYER_JOINED, addPlayerJoinMessage);
    socket.on(GameEvent.PLAYER_LEFT, addPlayerLeftMessage);
    socket.on(GameEvent.GUESSED, addGuessedMessage);
    socket.on(GameEvent.WORD_CHOSEN, addWordChosen);
    socket.on(GameEvent.GUESS_WORD_CHOSEN, addWordChosen);
    socket.on(GameEvent.TURN_END, addWordWas);
    socket.on(GameEvent.KICKING_VOTE, handleVoteKicking);
    socket.on(GameEvent.REACTION, addReactionMessage);
    socket.on("error", addErrorMessage);

    return () => {
      socket.off(GameEvent.GAME_STARTED, clearChat);
      socket.off(GameEvent.GUESS, addMessageToChat);
      socket.off(GameEvent.PLAYER_JOINED, addPlayerJoinMessage);
      socket.off(GameEvent.PLAYER_LEFT, addPlayerLeftMessage);
      socket.off(GameEvent.GUESSED, addGuessedMessage);
      socket.off(GameEvent.WORD_CHOSEN, addWordChosen);
      socket.off(GameEvent.GUESS_WORD_CHOSEN, addWordChosen);
      socket.off(GameEvent.TURN_END, addWordWas);
      socket.off(GameEvent.KICKING_VOTE, handleVoteKicking);
      socket.off(GameEvent.REACTION, addReactionMessage);
      socket.off("error", addErrorMessage);
    };
  }, []);

  return (
    <MessageContext.Provider
      value={{
        messages,
      }}
    >
      {children}
    </MessageContext.Provider>
  );
}
