import io from "socket.io-client";

const backend = process.env.BACKEND!

export const socket = io(backend, {
  autoConnect: false,
});
