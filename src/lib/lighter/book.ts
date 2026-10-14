import type { Level } from "./types";

/**
 * Order book state kept as price->size maps keyed by the exact price string
 * Lighter sends, so a delta can never miss because of float formatting.
 */
export interface Book {
  bids: Map<string, number>;
  asks: Map<string, number>;
  /** nonce of the last applied message; the next delta's begin_nonce must equal it */
  nonce: number;
  ready: boolean;
}

export const emptyBook = (): Book => ({ bids: new Map(), asks: new Map(), nonce: 0, ready: false });

interface WireLevel {
  price: string;
  size: string;
}
interface WireBook {
  asks: WireLevel[];
  bids: WireLevel[];
  nonce: number;
  begin_nonce: number;
}

function applyLevels(side: Map<string, number>, levels: WireLevel[]) {
  for (const l of levels) {
    const size = Number(l.size);
    if (size === 0) side.delete(l.price);
    else side.set(l.price, size);
  }
}

export type BookResult = { book: Book; resync: false } | { resync: true };

/**
 * Pure reducer for order_book messages. A snapshot replaces everything; a
 * delta must chain (begin_nonce === previous nonce) or the caller has to ask
 * for a fresh snapshot, because applying it would corrupt the book silently.
 */
export function applyBookMessage(book: Book, type: string, wire: WireBook): BookResult {
  if (type === "subscribed/order_book") {
    const next = emptyBook();
    applyLevels(next.asks, wire.asks);
    applyLevels(next.bids, wire.bids);
    next.nonce = wire.nonce;
    next.ready = true;
    return { book: next, resync: false };
  }
  if (!book.ready || wire.begin_nonce !== book.nonce) return { resync: true };
  const next: Book = { bids: new Map(book.bids), asks: new Map(book.asks), nonce: wire.nonce, ready: true };
  applyLevels(next.asks, wire.asks);
  applyLevels(next.bids, wire.bids);
  return { book: next, resync: false };
}

/** Best `n` levels per side; asks ascending, bids descending. */
export function topLevels(book: Book, n: number): { asks: Level[]; bids: Level[] } {
  const toLevels = (m: Map<string, number>) =>
    Array.from(m, ([p, size]) => ({ price: Number(p), size }));
  return {
    asks: toLevels(book.asks).sort((a, b) => a.price - b.price).slice(0, n),
    bids: toLevels(book.bids).sort((a, b) => b.price - a.price).slice(0, n),
  };
}
