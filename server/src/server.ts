import express from "express";
import http from "http";
import cors from "cors";
import { setupSocket } from "./socket/socketHandlers";
import { setupCommandLine } from "./utils/commandline";

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = require("socket.io")(server, {
  cors: {
    origin: process.env.FRONTEND,
        credentials: true,

    methods: ["GET", "POST"],
  },
    transports: ["websocket", "polling"],
  allowEIO3: true,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true
  }
});
setupSocket(io);
setupCommandLine(io);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Origin:', req.headers.origin);
  next();
});
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    websocketClients: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  });
});
const PORT = process.env.PORT || 8000;
server.listen(PORT, function () {
  console.log(`🚀 Server listening on port ${PORT}`); // Use the variable, not hardcoded 8000
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
});