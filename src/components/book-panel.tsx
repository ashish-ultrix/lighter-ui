"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { clock, num } from "@/lib/format";
import { topLevels } from "@/lib/lighter/book";
import { useOrderBook, useTrades } from "@/lib/lighter/hooks";
import type { Level, MarketMeta } from "@/lib/lighter/types";
import { Glyph, Panel, PillTabs } from "./ui";

const ROWS = 14;
const ROW_H = 17.6;
/** the last-price / spread strip between the two sides */
const SPREAD_H = 30;

type View = "book" | "trades";
type Side = "all" | "bids" | "asks";

/** Order book / trades without the card chrome, for the mobile chart tabs. */
export function BookBody({
  market,
  view,
  onPickPrice,
}: {
  market: MarketMeta | undefined;
  view: View;
  onPickPrice: (price: number) => void;
}) {
  const [side, setSide] = useState<Side>("all");
  return (
    <div className="flex h-full min-h-0 flex-col">
      {view === "book" && <SideFilter value={side} onChange={setSide} />}
      {view === "book" ? <OrderBook market={market} side={side} onPickPrice={onPickPrice} /> : <Trades market={market} />}
    </div>
  );
}

export function BookPanel({ market, onPickPrice }: { market: MarketMeta | undefined; onPickPrice: (price: number) => void }) {
  const [view, setView] = useState<View>("book");
  const [side, setSide] = useState<Side>("all");
  return (
    <Panel className="h-full">
      <div className="flex shrink-0 items-center border-b-[0.5px] border-line p-[5px]">
        <PillTabs
          tabs={[
            { id: "book", label: "Order Book" },
            { id: "trades", label: "Trades" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === "book" && <SideFilter value={side} onChange={setSide} />}
      {view === "book" ? <OrderBook market={market} side={side} onPickPrice={onPickPrice} /> : <Trades market={market} />}
    </Panel>
  );
}

function SideFilter({ value, onChange }: { value: Side; onChange: (s: Side) => void }) {
  const items: Array<{ id: Side; glyph: string; label: string }> = [
    { id: "all", glyph: "book-all", label: "Bids and asks" },
    { id: "bids", glyph: "book-bids", label: "Bids only" },
    { id: "asks", glyph: "book-asks", label: "Asks only" },
  ];
  return (
    <div className="flex shrink-0 items-center gap-[3.5px] border-b-[0.5px] border-line px-[7px] py-[7px]">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          aria-label={i.label}
          aria-pressed={value === i.id}
          className={cn(
            "press grid size-[17.6px] place-items-center rounded-[2px]",
            value === i.id ? "bg-white/[0.05]" : "opacity-50",
          )}
        >
          <Glyph name={i.glyph} className="size-3" />
        </button>
      ))}
    </div>
  );
}

const headCell = "font-mono text-[11px] uppercase leading-3 text-[#a9abae]";

function withTotals(levels: Level[]) {
  let acc = 0;
  return levels.map((l) => ({ ...l, total: (acc += l.size) }));
}

function OrderBook({ market, side, onPickPrice }: { market: MarketMeta | undefined; side: Side; onPickPrice: (p: number) => void }) {
  const book = useOrderBook(market?.marketId);
  const trades = useTrades(market?.marketId);
  const pd = market?.priceDecimals ?? 2;
  const sd = market?.sizeDecimals ?? 4;

  // Rows are sized to the room there is. A fixed count left a blank gap
  // whenever one side of a thin book had fewer levels than its half.
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(ROWS);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRoom(Math.max(2, Math.floor((e.contentRect.height - SPREAD_H) / ROW_H))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [book.ready]);

  const { asks, bids, maxTotal } = useMemo(() => {
    const t = topLevels(book, room);
    let na = 0;
    let nb = 0;
    if (side === "asks") na = Math.min(t.asks.length, room);
    else if (side === "bids") nb = Math.min(t.bids.length, room);
    else {
      // Each side gets half; a side that can't use its half hands the rest over.
      na = Math.min(t.asks.length, Math.max(Math.floor(room / 2), room - t.bids.length));
      nb = Math.min(t.bids.length, room - na);
    }
    const a = withTotals(t.asks.slice(0, na));
    const b = withTotals(t.bids.slice(0, nb));
    return { asks: a.reverse(), bids: b, maxTotal: Math.max(a[0]?.total ?? 0, b[b.length - 1]?.total ?? 0, 1e-9) };
  }, [book, room, side]);

  const bestAsk = book.asks.size ? Math.min(...Array.from(book.asks.keys(), Number)) : undefined;
  const bestBid = book.bids.size ? Math.max(...Array.from(book.bids.keys(), Number)) : undefined;
  const spread = bestAsk !== undefined && bestBid !== undefined ? bestAsk - bestBid : undefined;
  const lastTrade = trades[0];

  if (!book.ready) {
    return <div className="grid flex-1 place-items-center text-[12px] text-muted">Waiting for the book…</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col font-mono text-[12px]">
      <div className="grid shrink-0 grid-cols-3 border-b-[0.5px] border-line bg-white/[0.05] px-[7px] py-[3.5px]">
        <span className={headCell}>Price</span>
        <span className={cn(headCell, "text-right")}>
          Size <span className="text-fg">{market?.symbol}</span>
        </span>
        <span className={cn(headCell, "text-right")}>Total</span>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-hidden">
        {side !== "bids" && (
          <div>
            {asks.map((l) => (
              <Row key={l.price} level={l} side="ask" pd={pd} sd={sd} maxTotal={maxTotal} onPick={onPickPrice} />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-y-[0.5px] border-line px-[7px]" style={{ height: SPREAD_H }}>
          <span
            className={cn(
              "text-[14px] font-medium",
              lastTrade?.side === "buy" ? "text-up" : lastTrade?.side === "sell" ? "text-down" : "text-fg",
            )}
          >
            {lastTrade ? num(lastTrade.price, pd) : "–"}
          </span>
          <span className="text-[11px] text-muted">Spread {spread !== undefined ? num(spread, pd) : "–"}</span>
        </div>
        {side !== "asks" && (
          <div>
            {bids.map((l) => (
              <Row key={l.price} level={l} side="bid" pd={pd} sd={sd} maxTotal={maxTotal} onPick={onPickPrice} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  level,
  side,
  pd,
  sd,
  maxTotal,
  onPick,
}: {
  level: Level & { total: number };
  side: "ask" | "bid";
  pd: number;
  sd: number;
  maxTotal: number;
  onPick: (p: number) => void;
}) {
  return (
    <button
      onClick={() => onPick(level.price)}
      className="hover-raise relative grid h-[17.6px] w-full shrink-0 grid-cols-3 items-center px-[7px] text-left"
    >
      {/* Depth bar: scaleX on the compositor, no layout. Deliberately not
          transitioned; the book updates several times a second. */}
      <span
        aria-hidden
        className={cn("absolute inset-0 origin-right", side === "ask" ? "bg-down-soft" : "bg-up-soft")}
        style={{ transform: `scaleX(${Math.min(level.total / maxTotal, 1)})` }}
      />
      <span className={cn("relative", side === "ask" ? "text-down" : "text-up")}>{num(level.price, pd)}</span>
      <span className="relative text-right text-fg/70">{num(level.size, sd)}</span>
      <span className="relative text-right text-[#a9abae]">{num(level.total, sd)}</span>
    </button>
  );
}

function Trades({ market }: { market: MarketMeta | undefined }) {
  const trades = useTrades(market?.marketId);
  const pd = market?.priceDecimals ?? 2;
  const sd = market?.sizeDecimals ?? 4;
  if (trades.length === 0) {
    return <div className="grid flex-1 place-items-center text-[12px] text-muted">No recent trades</div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col font-mono text-[12px]">
      <div className="grid shrink-0 grid-cols-3 border-b-[0.5px] border-line bg-white/[0.05] px-[7px] py-[3.5px]">
        <span className={headCell}>Price</span>
        <span className={cn(headCell, "text-right")}>
          Size <span className="text-fg">{market?.symbol}</span>
        </span>
        <span className={cn(headCell, "text-right")}>Time</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {trades.map((t) => (
          <div key={t.id} className="grid h-[17.6px] grid-cols-3 items-center px-[7px]">
            <span className={t.side === "buy" ? "text-up" : "text-down"}>{num(t.price, pd)}</span>
            <span className="text-right text-fg/70">{num(t.size, sd)}</span>
            <span className="text-right text-[#a9abae]">{clock(t.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
