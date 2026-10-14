import { LIGHTER_WS } from "../config";
import type { SocketStatus } from "./types";

type Handler = (msg: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * One shared connection to Lighter's stream. The whole interface is
 * subscribe(channel, handler) -> unsubscribe: reconnect with backoff,
 * resubscribe after a drop, keepalive and ref-counting of channels all live
 * behind it, so nothing above this file knows a socket exists.
 *
 * Channels are written the way the subscribe frame wants them
 * ("order_book/4095"); the server echoes them back with a colon
 * ("order_book:4095"), which is normalised here.
 */
class LighterSocket {
  private ws: WebSocket | null = null;
  private subs = new Map<string, Set<Handler>>();
  private listeners = new Set<(s: SocketStatus) => void>();
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  status: SocketStatus = "closed";

  subscribe(channel: string, handler: Handler): () => void {
    let set = this.subs.get(channel);
    if (!set) {
      set = new Set();
      this.subs.set(channel, set);
      this.send({ type: "subscribe", channel });
    }
    set.add(handler);
    this.ensureConnected();
    return () => {
      const s = this.subs.get(channel);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        this.subs.delete(channel);
        this.send({ type: "unsubscribe", channel });
        if (this.subs.size === 0) this.close();
      }
    };
  }

  /** Drop and re-request a channel's snapshot (used when a delta is missed). */
  resync(channel: string) {
    this.send({ type: "unsubscribe", channel });
    this.send({ type: "subscribe", channel });
  }

  onStatus(fn: (s: SocketStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: SocketStatus) {
    if (this.status === s) return;
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  private send(frame: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private ensureConnected() {
    if (this.ws || this.subs.size === 0) return;
    this.setStatus("connecting");
    const ws = new WebSocket(LIGHTER_WS);
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.setStatus("open");
      for (const channel of this.subs.keys()) this.send({ type: "subscribe", channel });
      // Lighter closes a connection that is silent for 2 minutes.
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), 30_000);
    };

    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "ping") return this.send({ type: "pong" });
      if (typeof msg.channel !== "string") return;
      const handlers = this.subs.get(msg.channel.replace(":", "/"));
      handlers?.forEach((h) => h(msg));
    };

    ws.onclose = () => {
      clearInterval(this.pingTimer);
      this.ws = null;
      this.setStatus("closed");
      if (this.subs.size === 0) return;
      const delay = Math.min(1000 * 2 ** this.retries++, 15_000);
      this.retryTimer = setTimeout(() => this.ensureConnected(), delay);
    };
    // onerror is always followed by onclose, which owns recovery.
    ws.onerror = () => {};
  }

  private close() {
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setStatus("closed");
  }
}

let instance: LighterSocket | null = null;

/** Browser only: call from effects / subscribe callbacks, never during render. */
export function getSocket(): LighterSocket {
  return (instance ??= new LighterSocket());
}
