import io from "socket.io-client";

// Stable clientId persisted across reconnects
function ensureClientId(): string {
  let cid = localStorage.getItem("clientId");
  if (!cid) {
    if (window.crypto && "randomUUID" in window.crypto) {
      cid = window.crypto.randomUUID();
    } else {
      cid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    localStorage.setItem("clientId", cid);
  }
  return cid as string;
}
const clientId = ensureClientId();

// Determine backend URL - CRITICAL for Railway
let backendUrl;
backendUrl = process.env.BACKEND || window.location.origin.replace(/^http/, 'ws');
console.log("Connecting to backend:", backendUrl);

export const socket = io(backendUrl, {
  autoConnect: false,
  
  // Railway-specific settings
  transports: ["websocket", "polling"],  // Try polling first, then upgrade
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  
  // Force secure WebSocket in production
  secure: process.env.NODE_ENV === "production",
  
  // Important for Railway's proxy
  path: "/socket.io/",
  
  // Timeout settings
  timeout: 20000,
  
  // Query parameters for handshake
  query: {
    clientType: "web",
    version: "1.0",
    clientId,
  }
});

// Add connection listeners for debugging
socket.on("connect", () => {
  console.log("✅ WebSocket connected:", socket.id);
  console.log("Transport:", socket.io.engine.transport.name);
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection failed:", error.message);
  console.log("Error details:", error);
  
  // Fallback to polling if WebSocket fails
  if (socket.io.engine.transport.name === "websocket") {
    console.log("Trying polling fallback...");
    socket.io.opts.transports = ["polling", "websocket"];
  }
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});