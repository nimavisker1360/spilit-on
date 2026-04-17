"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

import {
  REALTIME_EVENT_NAME,
  REALTIME_SOCKET_PATH,
  type RealtimeEvent,
  type RealtimeRole
} from "@/lib/realtime/events";

type UseRealtimeEventsInput = {
  role: RealtimeRole;
  onEvent: (event: RealtimeEvent) => void;
};

export function useRealtimeEvents({ role, onEvent }: UseRealtimeEventsInput) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let isUnmounted = false;
    let socket: Socket | null = null;

    async function connect() {
      try {
        await fetch(REALTIME_SOCKET_PATH, { cache: "no-store" });
      } catch {
        return;
      }

      if (isUnmounted) {
        return;
      }

      socket = io({
        path: REALTIME_SOCKET_PATH,
        addTrailingSlash: false,
        transports: ["websocket", "polling"],
        auth: { role }
      });

      socket.on(REALTIME_EVENT_NAME, (event: RealtimeEvent) => {
        onEventRef.current(event);
      });
    }

    void connect();

    return () => {
      isUnmounted = true;

      if (socket) {
        socket.off(REALTIME_EVENT_NAME);
        socket.disconnect();
      }
    };
  }, [role]);
}
