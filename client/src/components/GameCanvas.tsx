import { useEffect, useRef, useState } from "react";
import { socket } from "../socketHandler";
import { DrawData, GameEvent, Room, Stroke } from "../types";
import Toolbar from "./Toolbar";
import { useRoom } from "../context/RoomContext";

const GameCanvas = (_props: { room: Room }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lineWidth, setLineWidth] = useState<number>(5);
  const { myTurn } = useRoom();

  const [color, setColor] = useState<string>("#000000");
  const drawing = useRef<boolean>(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeId = useRef<string | null>(null);
  const [drawingLocked, setDrawingLocked] = useState(false);

  // Helper to redraw all strokes to a canvas
  const redrawToCanvas = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    strokesRef.current.forEach((stroke) => drawStrokeOnCanvas(stroke));
  };

  function genStrokeId() {
    return `${socket.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
  }

  function clearCanvas() {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }

  function clearAllStrokes() {
    // Clear both canvas pixels and the in-memory stroke buffer
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx)
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    strokesRef.current = [];
  }
  function drawStrokeOnCanvas(stroke: Stroke) {
    if (!canvasRef.current) return;
    if (!stroke.points || stroke.points.length === 0) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    // Path stroke
    for (let i = 0; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      ctx.lineWidth = p.lineWidth;
      ctx.strokeStyle = p.color;
      if (i === 0) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      }
      if (p.end) ctx.beginPath();
    }
  }
  function redrawAll() {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) redrawToCanvas(ctx);
    // clearCanvas();
    // strokesRef.current.forEach((s) => drawStrokeOnCanvas(s));
  }

  function getCoords(event: MouseEvent | TouchEvent) {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const point = "touches" in event ? event.touches[0] : event;
    return {
      x: ((point.clientX - rect.left) * canvasRef.current.width) / rect.width,
      y: ((point.clientY - rect.top) * canvasRef.current.height) / rect.height,
    };
  }

  function startDrawing(event: MouseEvent | TouchEvent) {
    if (drawingLocked) return;
    if (!myTurn) return;

    drawing.current = true;
    const strokeId = genStrokeId();
    currentStrokeId.current = strokeId;
    const stroke: Stroke = {
      strokeId,
      color,
      lineWidth,
      points: [],
      playerId: socket.id,
    };

    strokesRef.current.push(stroke);
    socket.emit(GameEvent.DRAW_START, { strokeId, color, lineWidth });
    const { x, y } = getCoords(event);
    const point: DrawData = { x, y, color, lineWidth, end: false, strokeId };
    const lastIndex = strokesRef.current.length - 1;
    if (lastIndex >= 0) {
      const lastStroke = strokesRef.current[lastIndex];
      lastStroke.points = lastStroke.points ?? [];
      lastStroke.points.push(point);
    }
    drawStrokeOnCanvas(stroke);
    socket.emit(GameEvent.DRAW_POINT, point);

    event.preventDefault();
  }

  function draw(event: MouseEvent | TouchEvent) {
    if (!drawing.current || !canvasRef.current) return;
    const { x, y } = getCoords(event);
    const strokeId = currentStrokeId.current;
    if (!strokeId) return;
    const point: DrawData = { x, y, color, lineWidth, end: false, strokeId };
    const stroke = strokesRef.current.find((s) => s.strokeId === strokeId);
    if (stroke) {
      stroke.points = stroke.points ?? [];
      stroke.points.push(point);
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.lineWidth = point.lineWidth;
        ctx.lineCap = "round";
        ctx.strokeStyle = point.color;
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
      }
    }

    socket.emit(GameEvent.DRAW_POINT, point);
    event.preventDefault();
  }

  function stopDrawing() {
    if (!drawing.current) return;
    drawing.current = false;
    const strokeId = currentStrokeId.current;
    if (!strokeId) return;
    const stroke = strokesRef.current.find((s) => s.strokeId === strokeId);
    if (stroke && stroke.points && stroke.points.length > 0) {
      const last = stroke.points[stroke.points.length - 1];
      if (last) last.end = true;
      socket.emit(GameEvent.DRAW_END, { strokeId });
    }
    currentStrokeId.current = null;
  }

  function receiveDrawPoint(data: DrawData) {
    const sid = data.strokeId;
    if (!sid) return;
    const fromMe = data.playerId && data.playerId === socket.id;
    // find or create stroke object
    let s = strokesRef.current.find((st) => st.strokeId === sid);
    if (!s) {
      s = {
        strokeId: sid,
        color: data.color,
        lineWidth: data.lineWidth,
        points: [],
      };
      strokesRef.current.push(s);
    } else if (fromMe) {
      // If the stroke already exists locally and this is my own echo, skip.
      return;
    }
    s.points = s.points ?? [];
    const last = s.points[s.points.length - 1];
    // Skip duplicate points (can happen when server echoes back our own draw)
    if (
      !last ||
      last.x !== data.x ||
      last.y !== data.y ||
      last.end !== data.end
    ) {
      s.points.push(data);
    }
    // draw incremental
    drawStrokeOnCanvas(s);
  }

  // Ensure we stop drawing when the user releases the mouse/touch outside
  // the canvas (common source of 'stuck drawing' bugs).
  useEffect(() => {
    const onGlobalMouseUp = () => stopDrawing();
    const onGlobalTouchEnd = () => stopDrawing();
    const onGlobalTouchCancel = () => stopDrawing();

    window.addEventListener("mouseup", onGlobalMouseUp);
    window.addEventListener("touchend", onGlobalTouchEnd);
    window.addEventListener("touchcancel", onGlobalTouchCancel);

    return () => {
      window.removeEventListener("mouseup", onGlobalMouseUp);
      window.removeEventListener("touchend", onGlobalTouchEnd);
      window.removeEventListener("touchcancel", onGlobalTouchCancel);
    };
    // stopDrawing is stable (defined in same component scope)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTurnEnd() {
    clearCanvas();
    setDrawingLocked(true);
  }

  function handleChoseWord() {
    setDrawingLocked(false);
  }

  // function handleMidJoin(gameState: MidGameState) {
  //   // Sync strokes
  //   // handleDrawFull(gameState.strokes ?? []);

  //   // Unlock drawing if I'm the drawer and we're in drawing phase
  //   const isDrawingPhase = gameState.roomState === RoomState.DRAWING;
  //   // Prefer id-based detection to avoid relying on potentially stale players array
  //   const amDrawer = gameState.currentDrawerId
  //     ? gameState.currentDrawerId === socket.id
  //     : gameState.currentPlayer !== undefined &&
  //       players[gameState.currentPlayer]?.playerId === socket.id;

  //   // Lock unless I'm the drawer during drawing phase
  //   setDrawingLocked(!(isDrawingPhase && amDrawer));
  // }

  function handleDrawFull(strokes: Stroke[]) {
    if (!strokes) return;
    strokesRef.current = strokes;
    clearCanvas();
    strokes.forEach((s) => drawStrokeOnCanvas(s));
  }

  function handleUndo(removedStroke: any) {
    if (!removedStroke) return;
    const sid = removedStroke.strokeId;
    if (!sid) return;
    strokesRef.current = strokesRef.current.filter((s) => s.strokeId !== sid);
    redrawAll();
  }

  useEffect(() => {
    socket.on(GameEvent.DRAW_DATA, receiveDrawPoint);
    socket.on(GameEvent.WORD_CHOSEN, clearAllStrokes);
    socket.on(GameEvent.CLEAR_DRAW, clearAllStrokes);
    socket.on(GameEvent.UNDO_DRAW, handleUndo);
    socket.on(GameEvent.DRAW_FULL, handleDrawFull);
    socket.on(GameEvent.TURN_END, handleTurnEnd);
    socket.on(GameEvent.CHOOSE_WORD, handleChoseWord);
    // socket.on(GameEvent.GAME_STATE, handleMidJoin);

    return () => {
      socket.off(GameEvent.DRAW_DATA, receiveDrawPoint);
      socket.off(GameEvent.WORD_CHOSEN, clearAllStrokes);
      socket.off(GameEvent.CLEAR_DRAW, clearAllStrokes);
      socket.off(GameEvent.UNDO_DRAW, handleUndo);
      socket.off(GameEvent.DRAW_FULL, handleDrawFull);
      socket.off(GameEvent.TURN_END, handleTurnEnd);
      socket.off(GameEvent.CHOOSE_WORD, handleChoseWord);
      // socket.off(GameEvent.GAME_STATE, handleMidJoin);
    };
  }, []);

  return (
    <>
      <div id="game-canvas" className="m-auto relative">
        <canvas
          className="bg-white border-2 border-theme"
          ref={canvasRef}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onMouseDown={(e: any) => startDrawing(e)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onTouchStart={(e: any) => startDrawing(e)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onMouseMove={(e: any) => draw(e)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onTouchMove={(e: any) => draw(e)}
          onMouseUp={stopDrawing}
          onMouseLeave={() => stopDrawing()}
          onTouchEnd={stopDrawing}
          width={800}
          height={600}
        />
      </div>

      <Toolbar
        onLineWidthChange={setLineWidth}
        onColorChange={setColor}
        handleClear={clearAllStrokes}
      />
    </>
  );
};

export default GameCanvas;
