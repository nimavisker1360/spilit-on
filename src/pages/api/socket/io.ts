import type { Server as HttpServer } from "http";
import type { Socket as NetSocket } from "net";

import type { NextApiRequest, NextApiResponse } from "next";

import { ensureRealtimeServer } from "@/lib/realtime/server";

type NextApiResponseWithSocket = NextApiResponse & {
  socket: NetSocket & {
    server: HttpServer;
  };
};

export default function handler(_request: NextApiRequest, response: NextApiResponseWithSocket) {
  ensureRealtimeServer(response.socket.server);
  response.status(200).json({ ok: true });
}
