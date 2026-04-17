import type { Server as HttpServer } from "http";

import { Server as SocketIOServer, type Socket } from "socket.io";

import {
  REALTIME_EVENT_NAME,
  REALTIME_SOCKET_PATH,
  getRealtimeTargets,
  parseRealtimeRole,
  roomForRole,
  type RealtimeEvent
} from "@/lib/realtime/events";

declare global {
  // eslint-disable-next-line no-var
  var __restaurantRealtimeIO: SocketIOServer | undefined;
}

function resolveRole(socket: Socket) {
  const authRole = socket.handshake.auth?.role;
  const queryRole = socket.handshake.query.role;

  if (typeof authRole === "string") {
    return parseRealtimeRole(authRole);
  }

  if (typeof queryRole === "string") {
    return parseRealtimeRole(queryRole);
  }

  return null;
}

export function ensureRealtimeServer(httpServer?: HttpServer): SocketIOServer | null {
  if (globalThis.__restaurantRealtimeIO) {
    return globalThis.__restaurantRealtimeIO;
  }

  if (!httpServer) {
    return null;
  }

  const io = new SocketIOServer(httpServer, {
    path: REALTIME_SOCKET_PATH,
    addTrailingSlash: false,
    transports: ["websocket", "polling"]
  });

  io.on("connection", (socket) => {
    const role = resolveRole(socket);

    if (role) {
      socket.join(roomForRole(role));
    }
  });

  globalThis.__restaurantRealtimeIO = io;
  return io;
}

export function emitRealtimeEvent(event: RealtimeEvent) {
  const io = ensureRealtimeServer();

  if (!io) {
    return;
  }

  const targets = new Set(getRealtimeTargets(event));

  for (const role of targets) {
    io.to(roomForRole(role)).emit(REALTIME_EVENT_NAME, event);
  }
}
