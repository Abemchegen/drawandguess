import { useEffect, useState } from "react";
import { socket } from "../socketHandler";
import { GameEvent, Languages, PlayerData } from "../types";
import Button from "./ui/Button";

export default function JoinGameForm() {
  const [playerData, setPlayerData] = useState<PlayerData>({
    name: localStorage.getItem("name") as string | "",
    // appearance: [0, 0, 0],
  });
  const [language, setLanguage] = useState<Languages>(
    localStorage.getItem("language") as Languages | Languages.am
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const handleSocketError = (err?: any) => {
    if (!err) {
      // setError("");
      return;
    }
    if (typeof err === "string") {
      setError(err);
    } else if (err instanceof Error) {
      setError(err.message);
    } else {
      try {
        setError(JSON.stringify(err));
      } catch {
        setError(String(err));
      }
    }
  };

  useEffect(() => {
    socket.on("error", handleSocketError);

    return () => {
      socket.off("error", handleSocketError);
    };
  }, []);

  // param isPrivate: boolean = false
  const handleJoin = (create: boolean = false) => {
    if (playerData.name.trim() === "") {
      setError("Please enter your name");
      return;
    }
    localStorage.setItem("name", playerData.name);
    localStorage.setItem("language", language);
    if (!socket.connected) socket.connect();
    if (!roomId && !create) {
      setError("Please provide a room id to join a room!");
      return;
    }
    socket.emit(GameEvent.JOIN_ROOM, playerData, language, roomId, create);
    console.log("tried to join");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center">
        <h1>Draw, Guess, Win!</h1>
      </div>
      <span className="p-5">{error}</span>
      <div className="bg-card p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
        {/* Name Input & Language Selector */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            name="name"
            value={playerData.name}
            onChange={(e) => {
              setPlayerData({ ...playerData, name: e.target.value });
              setError("");
            }}
            placeholder="Enter your name"
            className="min-w-15 input text-lg"
          />
          <select
            className="p-2 input text-lg"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Languages)}
          >
            {Object.entries(Languages).map(([key, value]) => {
              return (
                <option key={key} value={key}>
                  {value}
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex flex-col space-x-2 space-y-2">
          <div className="flex space-x-2">
            <input
              type="text"
              name="roomId"
              value={roomId ?? ""}
              onChange={(e) => {
                setRoomId(e.target.value);
                setError("");
              }}
              placeholder="Enter the room id"
              className="min-w-15 input text-lg"
            />
            {/* Play Button */}
            <Button
              variant="success"
              size="md"
              fullWidth
              onClick={() => handleJoin(false)}
            >
              Join!
            </Button>
          </div>
          <p>or</p>

          {/* Create Private Room Button */}
          <Button
            variant="success"
            size="md"
            fullWidth
            className=""
            onClick={() => handleJoin(true)}
          >
            Create Private Room
          </Button>
        </div>
      </div>
    </div>
  );
}
