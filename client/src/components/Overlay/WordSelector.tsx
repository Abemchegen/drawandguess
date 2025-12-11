import { socket } from "../../socketHandler";
import { GameEvent } from "../../types";
import Button from "../ui/Button";

export default function WordSelector({ words }: { words: string[] }) {
  function handleWordSelect(word: string) {
    socket.emit(GameEvent.WORD_SELECT, word);
  }

  return (
    <div className="flex text-background flex-wrap gap-2 items-center justify-center">
      {words.map((e) => {
        return (
          <Button
            className="text-background text-lg"
            onClick={() => handleWordSelect(e)}
            color=""
            key={e}
          >
            {e}
          </Button>
        );
      })}
    </div>
  );
}
