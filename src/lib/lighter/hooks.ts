"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { applyBookMessage, emptyBook, type Book } from "./book";
import { getSocket } from "./socket";
import type { MarketStats, SocketStatus, Trade } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A channel store is one socket subscription shared by every component that
 * reads it. The first reader subscribes, the last one leaving unsubscribes and
 * resets state (so the next reader starts from a fresh snapshot). Renders are
 * coalesced to one per animation frame: a busy book can send many deltas a
 * second and React only needs the latest.
 */
function channelStore<S>(
  channel: string,
  init: S,
  reduce: (state: S, msg: any, resync: () => void) => S,
) {
  let state = init;
  let unsub: (() => void) | null = null;
  let frame = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      listeners.forEach((l) => l());
    });
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!unsub) {
        const socket = getSocket();
        unsub = socket.subscribe(channel, (msg) => {
          state = reduce(state, msg, () => socket.resync(channel));
          notify();
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsub?.();
          unsub = null;
          state = init;
        }
      };
    },
    getSnapshot: () => state,
    getServerSnapshot: () => init,
  };
}

type ChannelStore<S> = ReturnType<typeof channelStore<S>>;

function perMarket<S>(make: (marketId: number) => ChannelStore<S>) {
  const cache = new Map<number, ChannelStore<S>>();
  return (marketId: number) => {
    let s = cache.get(marketId);
    if (!s) cache.set(marketId, (s = make(marketId)));
    return s;
  };
}

const idle = <S,>(value: S): ChannelStore<S> => ({
  subscribe: () => () => {},
  getSnapshot: () => value,
  getServerSnapshot: () => value,
});

// ---- all-market stats (prices, 24h change, funding) -------------------------

type StatsMap = Record<number, MarketStats>;
const NO_STATS: StatsMap = {};

const statsStore = channelStore<StatsMap>("market_stats/all", NO_STATS, (state, msg) => {
  const incoming = msg.market_stats as Record<string, MarketStats> | undefined;
  if (!incoming) return state;
  const next = { ...state };
  for (const s of Object.values(incoming)) next[s.market_id] = { ...next[s.market_id], ...s };
  return next;
});

export function useMarketStats(): StatsMap {
  return useSyncExternalStore(statsStore.subscribe, statsStore.getSnapshot, statsStore.getServerSnapshot);
}

// ---- order book -------------------------------------------------------------

const EMPTY_BOOK = emptyBook();
const bookStore = perMarket<Book>((id) =>
  channelStore<Book>(`order_book/${id}`, EMPTY_BOOK, (state, msg, resync) => {
    // The channel also carries frames with no book payload (acks, errors);
    // only a snapshot or a delta may touch the book.
    const isBook = msg.type === "subscribed/order_book" || msg.type === "update/order_book";
    if (!isBook || !msg.order_book) return state;
    const r = applyBookMessage(state, msg.type, msg.order_book);
    if (r.resync) {
      resync();
      return state;
    }
    return r.book;
  }),
);
const idleBook = idle(EMPTY_BOOK);

export function useOrderBook(marketId: number | undefined): Book {
  const store = marketId === undefined ? idleBook : bookStore(marketId);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

// ---- trades -----------------------------------------------------------------

const NO_TRADES: Trade[] = [];
const MAX_TRADES = 60;

const toTrade = (t: any): Trade => ({
  id: Number(t.trade_id),
  price: Number(t.price),
  size: Number(t.size),
  side: t.is_maker_ask ? "buy" : "sell",
  ts: Number(t.timestamp),
});

const tradeStore = perMarket<Trade[]>((id) =>
  channelStore<Trade[]>(`trade/${id}`, NO_TRADES, (state, msg) => {
    const incoming: Trade[] = (msg.trades ?? []).map(toTrade);
    if (incoming.length === 0) return state;
    if (msg.type === "subscribed/trade") return incoming.sort((a, b) => b.id - a.id).slice(0, MAX_TRADES);
    const seen = new Set(state.map((t) => t.id));
    const fresh = incoming.filter((t) => !seen.has(t.id)).sort((a, b) => b.id - a.id);
    return fresh.length ? [...fresh, ...state].slice(0, MAX_TRADES) : state;
  }),
);
const idleTrades = idle(NO_TRADES);

/** Newest first. */
export function useTrades(marketId: number | undefined): Trade[] {
  const store = marketId === undefined ? idleTrades : tradeStore(marketId);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

// ---- connection status ------------------------------------------------------

export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  useEffect(() => {
    const socket = getSocket();
    const off = socket.onStatus(setStatus);
    // Catch a transition that happened between render and this effect.
    queueMicrotask(() => setStatus(socket.status));
    return off;
  }, []);
  return status;
}
