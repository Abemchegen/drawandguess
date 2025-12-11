import { useEffect, useRef, useState } from "react";
import { socket } from "../socketHandler";
import { GameEvent } from "../types";
import { SendIcon } from "lucide-react";
import Button from "./ui/Button";
import useIsMobile from "../hooks/useIsMobile";
import { AnimatePresence } from "framer-motion";
import Message from "./Chat/Message";
import useMessages from "../hooks/useMessages";
import { useRoom } from "../context/RoomContext";
import clsx from "clsx";

const Chat = () => {
  const [message, setMessage] = useState<string>("");
  const messagesBottomDiv = useRef<HTMLDivElement | null>(null);
  const { messages } = useMessages();
  const { myTurn } = useRoom();

  const isMobile = useIsMobile();

  const handleSend = () => {
    if (message.trim()) {
      socket.emit(GameEvent.GUESS, { guess: message });
      setMessage("");
    }
  };

  const scrollToBottom = () => {
    if (!messagesBottomDiv || !messagesBottomDiv.current) return;
    messagesBottomDiv.current.scrollTop =
      messagesBottomDiv.current?.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="h-[10px] min-w-[200px] m-2  w-1/2 sm:w-auto ">
      <div
        className={clsx(
          "h-[300px] sm:h-[400px] overflow-y-auto sm:p-4 bg-card rounded-lg border-2 border-dashed transition-colors duration-200 scroll-smooth",
          {
            "sm:h-[715px]": myTurn,
            "border-theme": true,
          }
        )}
        ref={messagesBottomDiv}
      >
        <AnimatePresence>
          {messages.map((msg, index) => (
            <Message key={index} message={msg} />
          ))}
        </AnimatePresence>
      </div>

      {!isMobile && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex relativeflex-col sm:flex-row bottom-0"
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your guess..."
            className="w-full input p-3 pl-4 pr-12 rounded-lg sm:rounded-sm font-medium"
          />
          <Button
            endIcon={<SendIcon />}
            onClick={handleSend}
            className="rounded-lg sm:rounded-sm"
            type="button"
          >
            {isMobile && "Send"}
          </Button>
        </form>
      )}
    </div>
  );
};

export default Chat;
