import io from "socket.io-client";

const backend = process.env.BACKEND!

export const socket = io(backend, {
  autoConnect: false,
   transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  secure: process.env.NODE_ENV === "production",
  
  // Explicit path (sometimes needed with Railway's proxy)
  path: "/socket.io/",
});
