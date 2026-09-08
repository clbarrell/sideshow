import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import { deviceKey } from "./identity";
import type { ClientMsg, Player, RoomState, ServerMsg } from "../shared/protocol";

export interface RoomHandle {
  you: Player | null;
  state: RoomState | null;
  error: string | null;
  waiting: string | null;
  connected: boolean;
  send: (msg: ClientMsg) => void;
  /** Send opaque game traffic. The shell never looks inside `d`. */
  sendGame: (d: unknown, to?: string) => void;
}

interface Options {
  code: string;
  role: "host" | "controller";
  name?: string;
  onLaunch?: (gameId: string, seed: number) => void;
  onGame?: (from: string, d: unknown) => void;
}

/**
 * One socket for the whole party. It is opened when the projector or the phone
 * first lands on the party URL and is never torn down between games — the phase
 * changes underneath it.
 */
export function useRoom(opts: Options): RoomHandle {
  const { code, role } = opts;
  const [you, setYou] = useState<Player | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);

  // Keep callbacks in a ref so a re-render never tears down the socket.
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    if (!code) return;

    setYou(null);
    setState(null);
    setError(null);
    setWaiting(null);
    setConnected(false);

    const socket = new PartySocket({
      host: window.location.host,
      party: "room",
      room: code,
      // A newer connection with this identity deliberately replaces this one.
      shouldReconnectOnClose: (event) => event.code !== 4001,
    });
    socketRef.current = socket;

    const hello = () => {
      if (socketRef.current !== socket) return;
      setConnected(true);
      setError(null);
      setWaiting(null);
      socket.send(
        JSON.stringify({
          t: "hello",
          role,
          key: role === "controller" ? deviceKey() : undefined,
          name: cb.current.name,
        } satisfies ClientMsg),
      );
    };

    const onMessage = (e: MessageEvent) => {
      if (socketRef.current !== socket) return;
      const msg: ServerMsg = JSON.parse(e.data);
      switch (msg.t) {
        case "welcome":
          setYou(msg.you);
          setState(msg.state);
          setError(null);
          setWaiting(null);
          break;
        case "state":
          setState(msg.state);
          break;
        case "launch":
          cb.current.onLaunch?.(msg.gameId, msg.seed);
          break;
        case "g":
          cb.current.onGame?.(msg.from, msg.d);
          break;
        case "waiting":
          setWaiting(msg.message);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };

    socket.addEventListener("open", hello);
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", (event) => {
      if (socketRef.current !== socket) return;
      setConnected(false);
      if (event.code === 4001) setError("This party is open on another screen.");
    });

    return () => {
      if (socketRef.current === socket) socketRef.current = null;
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, role]);

  const send = useCallback((msg: ClientMsg) => {
    socketRef.current?.send(JSON.stringify(msg));
  }, []);

  const sendGame = useCallback((d: unknown, to?: string) => send({ t: "g", d, to }), [send]);

  return { you, state, error, waiting, connected, send, sendGame };
}
