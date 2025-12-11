import PlayerScores from "./PlayerScores";
import GameCanvas from "./GameCanvas";
import Chat from "./Chat";
import { Room } from "../types";
import GameHeader from "./Header";
import useIsMobile from "../hooks/useIsMobile";
import OverlayContent from "./OverlayContent";
import AudioManager from "./Audio/AudioManager";
import GuessInput from "./GuessInput";
import MessagesContext from "../context/MessagesContext";
import ToastStack from "./Overlay/ToastMessage";
import clsx from "clsx";

const Game = ({ room }: { room: Room }) => {
  const isMobile = useIsMobile();

  return (
    <MessagesContext>
      <GameHeader />
      <div
        className={clsx("flex flex-grow justify-center w-full", {
          "flex-col": isMobile,
        })}
      >
        <AudioManager />
        <div className="flex-col">{!isMobile && <PlayerScores />}</div>
        <div className="">
          <div className="relative overflow-hidden">
            <GameCanvas room={room} />
            <OverlayContent />
            <ToastStack />
          </div>
        </div>
        <div className="flex-col">
          <GuessInput />
          <div className="flex">
            {isMobile && <PlayerScores />}
            <Chat />
          </div>
        </div>
      </div>
    </MessagesContext>
  );
};

export default Game;
