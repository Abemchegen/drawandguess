import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";  // Use ES6 import
import { setupSocket } from "./socket/socketHandlers";
import { setupCommandLine } from "./utils/commandline";

const app = express();
const server = http.createServer(app);

// Get URLs from environment
const FRONTEND_URL = process.env.FRONTEND || "http://localhost:3000";
const BACKEND_URL = process.env.BACKEND
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : "http://localhost:8000";

console.log("Frontend URL:", FRONTEND_URL);
console.log("Backend URL:", BACKEND_URL);

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

// CRITICAL: Use Server class, not require()
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  allowEIO3: true,
  
  // Railway-specific WebSocket settings
  pingTimeout: 60000,
  pingInterval: 25000,
  
  // Enable WebSocket compression
  perMessageDeflate: {
    threshold: 1024
  }
});

// Health endpoint (Railway needs this)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    websocketClients: io.engine.clientsCount,
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
    timestamp: new Date().toISOString()
  });
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Origin:', req.headers.origin);
  next();
});

setupSocket(io);
setupCommandLine(io);

// Use Railway's PORT
const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log("🚀 Server started successfully!");
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 Backend URL: ${BACKEND_URL}`);
  console.log(`🔗 Frontend URL: ${FRONTEND_URL}`);
  console.log(`✅ Health: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket ready on: wss://.../socket.io/`);
});