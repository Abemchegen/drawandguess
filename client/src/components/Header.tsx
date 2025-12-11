import { useEffect, useRef, useState } from "react";
import {
  EndTurnData,
  GameEvent,
  MidGameState,
  ReactionType,
  Room,
  RoomState,
} from "../types";
import { socket } from "../socketHandler";
import { AnimatePresence, motion } from "framer-motion";
import { useRoom } from "../context/RoomContext";
import { ThumbsDown, ThumbsUp } from "lucide-react";

const GameHeader = () => {
  const [word, setWord] = useState<string | number[]>("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [timer, setTimer] = useState<number>(60);
  const [hintLetters, setHintLetters] = useState<
    { letter: string; index: number }[]
  >([]);
  const [reaction, setReaction] = useState<ReactionType | null>(null);
  const { myTurn, currentRound, currentPlayer, roomState } = useRoom();

  useEffect(() => {
    console.log("Timer", timer);
  }, [timer]);

  function initTimer({
    word,
    time,
  }: {
    word: string | number[];
    time: number;
  }) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimer(time);
    intervalRef.current = setInterval(() => {
      setTimer((e) => (e > 0 ? e - 1 : e));
    }, 1000);

    setWord(word);
    setHintLetters([]);
  }
  function initTimerForWord({ time }: { time: number }) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimer(time);

    intervalRef.current = setInterval(() => {
      setTimer((e) => (e > 0 ? e - 1 : e));
    }, 1000);
    setWord("");
    setHintLetters([]);
  }

  function endTurn(_room: Room, data: EndTurnData) {
    setWord("");
    setTimer(data.time);
  }

  function hintLetter(data: { letter: string; index: number }) {
    setHintLetters((e) => [...e, data]);
  }

  function gameStateUpdate(gameState: MidGameState) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimer(gameState.time);

    intervalRef.current = setInterval(() => {
      setTimer((e) => (e > 0 ? e - 1 : e));
    }, 1000);
    setWord(gameState.word);
    setHintLetters(gameState.hintLetters ?? []);
  }

  useEffect(() => {
    setReaction(null);
  }, [currentRound, currentPlayer?.playerId]);

  useEffect(() => {
    socket.on(GameEvent.WORD_CHOSEN, initTimer);
    socket.on(GameEvent.GUESS_WORD_CHOSEN, initTimer);
    socket.on(GameEvent.CHOOSE_WORD, initTimerForWord);
    socket.on(GameEvent.CHOOSING_WORD, initTimerForWord);
    socket.on(GameEvent.TURN_END, endTurn);
    socket.on(GameEvent.GUESS_HINT, hintLetter);
    socket.on(GameEvent.GAME_ENDED, endTurn);
    socket.on(GameEvent.GAME_STATE, gameStateUpdate);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      socket.off(GameEvent.WORD_CHOSEN, initTimer);
      socket.off(GameEvent.GUESS_WORD_CHOSEN, initTimer);
      socket.off(GameEvent.CHOOSE_WORD, initTimerForWord);
      socket.off(GameEvent.CHOOSING_WORD, initTimerForWord);
      socket.off(GameEvent.TURN_END, endTurn);
      socket.off(GameEvent.GAME_ENDED, endTurn);
      socket.off(GameEvent.GUESS_HINT, hintLetter);
      socket.off(GameEvent.GAME_STATE, gameStateUpdate);
    };
  }, []);

  function sendReaction(type: ReactionType) {
    if (myTurn || reaction) return;
    socket.emit(GameEvent.REACTION, { type });
    setReaction(type);
  }

  function renderWord() {
    if (typeof word === "string") return <span>{word}</span>; // Show full word for drawer

    let wordIndex = 0;
    return word.map((length, wordPartIndex) => {
      const wordPart = Array.from({ length }, () => {
        const hint = hintLetters.find((e) => e.index === wordIndex);
        const displayChar = hint ? hint.letter : "_";
        wordIndex++; // Increment for next letter
        return (
          <motion.span
            key={wordIndex}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: hint ? 0.1 : 0 }}
            className="inline-block"
          >
            {displayChar}
          </motion.span>
        );
      });

      return (
        <span key={wordPartIndex} className="flex items-center gap-1">
          {wordPartIndex > 0 && <span className="px-1"> </span>}{" "}
          {/* Space between words */}
          {wordPart}
        </span>
      );
    });
  }

  return (
    <div className=" mx-auto bg-card rounded-lg text-primary font-bold py-2 px-4 flex items-center justify-between z-100 shadow-lg text-center">
      <span className="text-lg font-semibold">{timer}</span>
      <span className="text-xl font-bold self-center flex gap-5 relative select-none">
        <AnimatePresence>{renderWord()}</AnimatePresence>
        <span className="text-xs -left-4 relative flex gap-2">
          {typeof word !== "string" &&
            word.map((n, i) => <span key={i}>{n}</span>)}
        </span>
      </span>
      {!myTurn && currentRound > 0 && roomState == RoomState.DRAWING && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => sendReaction("like")}
            disabled={!!reaction}
            className={`px-3 py-1 rounded  text-green-500 text-primary transition-colors disabled:opacity-50 ${
              reaction === "like" ? "bg-primary " : ""
            }`}
          >
            <ThumbsUp />
          </button>
          <button
            type="button"
            onClick={() => sendReaction("dislike")}
            disabled={!!reaction}
            className={`px-3 py-1 rounded text-red-500  text-primary transition-colors disabled:opacity-50 ${
              reaction === "dislike" ? "bg-primary " : ""
            }`}
          >
            <ThumbsDown />
          </button>
        </div>
      )}
    </div>
  );
};

export default GameHeader;
