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

server.listen(8000, function () {
  console.log("listening on *:8000");
});
