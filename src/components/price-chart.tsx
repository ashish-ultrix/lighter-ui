"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { num, pct } from "@/lib/format";
import { fetchCandles, resolutionSeconds } from "@/lib/lighter/rest";
import { useMarketStats, useTrades } from "@/lib/lighter/hooks";
import type { Candle, MarketMeta, Resolution } from "@/lib/lighter/types";
import { BookBody } from "./book-panel";
import { MarketBar } from "./market-bar";
import { Glyph, Panel, PillTabs, useDismiss } from "./ui";

const UP = "#1dea99";
const DOWN = "#f05562";
const QUICK: Resolution[] = ["5m", "15m", "1h", "4h"];
const MORE: Resolution[] = ["1m", "1d"];

const FLAT = "#8c8d91";

/** A candle with no range means nothing traded: draw it neutral, not as a green or red move. */
function toBar(c: Candle) {
  const bar = { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close };
  if (c.open === c.high && c.high === c.low && c.low === c.close) {
    return { ...bar, color: FLAT, wickColor: FLAT, borderColor: FLAT };
  }
  return bar;
}

type View = "price" | "book" | "trades" | "funding" | "details";

interface PriceChartProps {
  markets: MarketMeta[];
  market: MarketMeta | undefined;
  onSelect: (symbol: string) => void;
  /** Phone layout: compact ticker, book and trades become tabs here. */
  mobile?: boolean;
  onPickPrice?: (price: number) => void;
}

export function PriceChart({ markets, market, onSelect, mobile, onPickPrice }: PriceChartProps) {
  const [resolution, setResolution] = useState<Resolution>("5m");
  const [view, setView] = useState<View>("price");
  const panel = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const last = useRef<Candle | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["candles", market?.marketId, resolution],
    queryFn: () => fetchCandles(market!.marketId, resolution),
    enabled: !!market,
    refetchInterval: 60_000,
  });
  const trades = useTrades(market?.marketId);

  // Create the chart once; autoSize follows the container.
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8c8d91",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.07)" },
      timeScale: { borderColor: "rgba(255,255,255,0.07)", timeVisible: true, secondsVisible: false },
    });
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    volume.current = c.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = candles.current = volume.current = null;
    };
  }, []);

  // Price precision follows the market.
  useEffect(() => {
    if (!market || !candles.current) return;
    candles.current.applyOptions({
      priceFormat: { type: "price", precision: market.priceDecimals, minMove: 10 ** -market.priceDecimals },
    });
  }, [market]);

  // The previous series' last candle is meaningless for a new market or timeframe.
  useEffect(() => {
    last.current = null;
  }, [market?.marketId, resolution]);

  // Historical candles. Re-fit only when the market or timeframe changes, so the
  // minute refetch never throws away the user's zoom and scroll position.
  const fitted = useRef("");
  useEffect(() => {
    if (!data || !candles.current || !volume.current) return;
    candles.current.setData(data.map(toBar));
    volume.current.setData(
      data.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(29,234,153,.28)" : "rgba(240,85,98,.28)",
      })),
    );
    last.current = data[data.length - 1] ?? null;
    const key = `${market?.marketId}:${resolution}`;
    if (fitted.current !== key) {
      fitted.current = key;
      chart.current?.timeScale().fitContent();
    }
  }, [data, market?.marketId, resolution]);

  // Live tick: fold the newest trade into the current (or a new) candle.
  const newest = trades[0];
  useEffect(() => {
    if (!newest || !candles.current || !volume.current || !last.current) return;
    const step = resolutionSeconds(resolution);
    const bucket = Math.floor(newest.ts / 1000 / step) * step;
    const prev = last.current;
    if (bucket < prev.time) return;
    // Quiet markets skip whole buckets; carry the last close across them so the
    // series stays contiguous instead of jumping.
    for (let t = prev.time + step; t < bucket; t += step) {
      const flat: Candle = { time: t, open: prev.close, high: prev.close, low: prev.close, close: prev.close, volume: 0 };
      candles.current.update(toBar(flat));
    }
    const base = bucket === prev.time ? prev : { ...prev, time: bucket, open: prev.close, high: prev.close, low: prev.close, volume: 0 };
    const next: Candle = {
      ...base,
      high: Math.max(base.high, newest.price),
      low: Math.min(base.low, newest.price),
      close: newest.price,
    };
    last.current = next;
    candles.current.update(toBar(next));
  }, [newest, resolution]);

  function snapshot() {
    const canvas = chart.current?.takeScreenshot();
    canvas?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${market?.symbol ?? "chart"}-${resolution}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panel.current?.requestFullscreen?.();
  }

  return (
    <Panel className="h-full bg-white/[0.05]">
      <div ref={panel as React.RefObject<HTMLDivElement>} className="flex min-h-0 flex-1 flex-col bg-bg">
        <MarketBar markets={markets} market={market} onSelect={onSelect} compact={mobile} />

        <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b-[0.5px] border-line px-[5px]">
          <PillTabs
            className="no-scrollbar min-w-0 overflow-x-auto"
            tabs={[
              { id: "price", label: "Price" },
              ...(mobile
                ? ([
                    { id: "book", label: "Order Book" },
                    { id: "trades", label: "Trades" },
                  ] as const)
                : []),
              { id: "funding", label: "Funding" },
              { id: "details", label: "Details" },
            ]}
            value={view}
            onChange={setView}
          />
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="hidden text-[12px] text-fg sm:inline">TradingView</span>
            <button
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
              className="press hover-raise grid size-[21px] place-items-center rounded-[3px]"
            >
              <Glyph name="fullscreen" className="size-[14px]" />
            </button>
          </div>
        </div>

        {view === "price" && (
          <div className="flex h-7 shrink-0 items-center justify-between border-b-[0.5px] border-line/70 px-[7px]">
            <div className="flex items-center gap-2.5">
              <Timeframes value={resolution} onChange={setResolution} />
              {error && <span className="text-[12px] text-down">Couldn’t load candles</span>}
            </div>
            <button
              onClick={snapshot}
              aria-label="Save chart image"
              title="Save chart image"
              className="press hover-raise grid size-[21px] place-items-center rounded-[3px]"
            >
              <Glyph name="camera" className="size-[14px]" />
            </button>
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          <div ref={host} className={cn("absolute inset-0", view !== "price" && "invisible")} />
          {view === "price" && isLoading && (
            <div className="absolute inset-0 grid place-items-center text-[12px] text-muted">Loading chart…</div>
          )}
          {(view === "book" || view === "trades") && (
            <div className="absolute inset-0 bg-bg">
              <BookBody market={market} view={view} onPickPrice={onPickPrice ?? (() => {})} />
            </div>
          )}
          {view === "funding" && <FundingView market={market} />}
          {view === "details" && <DetailsView market={market} />}
        </div>
      </div>
    </Panel>
  );
}

function Timeframes({ value, onChange }: { value: Resolution; onChange: (r: Resolution) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const inMore = MORE.includes(value);
  return (
    <div className="flex items-center gap-2.5">
      {QUICK.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn("press text-[12px]", r === value ? "text-fg" : "text-muted hover-fg")}
        >
          {r}
        </button>
      ))}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn("press flex items-center gap-[2px] text-[12px]", inMore ? "text-fg" : "text-muted hover-fg")}
        >
          {inMore ? value : "More"}
          <Glyph name="chevron-7" className="size-[7px]" />
        </button>
        {open && (
          <ul
            role="listbox"
            className="pop-in absolute left-0 top-6 z-30 w-20 overflow-hidden rounded-md border border-line-strong bg-raised shadow-xl shadow-black/60"
          >
            {MORE.map((r) => (
              <li key={r}>
                <button
                  role="option"
                  aria-selected={r === value}
                  onClick={() => {
                    onChange(r);
                    setOpen(false);
                  }}
                  className={cn("press hover-raise w-full px-3 py-1.5 text-left text-[12px]", r === value && "text-fg")}
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InfoGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="fade-in absolute inset-0 grid content-start gap-x-8 overflow-y-auto bg-bg p-3 text-[12px] sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between border-b-[0.5px] border-line/70 py-1.5">
          <dt className="text-muted">{k}</dt>
          <dd className="font-mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function FundingView({ market }: { market: MarketMeta | undefined }) {
  const s = useMarketStats()[market?.marketId ?? -1];
  if (!market || !s) return <div className="absolute inset-0 grid place-items-center text-[12px] text-muted">Waiting for market data…</div>;
  const dec = market.priceDecimals;
  return (
    <InfoGrid
      rows={[
        ["Current funding rate (1h)", pct(Number(s.current_funding_rate), 4)],
        ["Last settled funding rate", pct(Number(s.funding_rate), 4)],
        ["Mark price", num(s.mark_price, dec)],
        ["Index price", num(s.index_price, dec)],
        ["Mark vs index", pct(((Number(s.mark_price) - Number(s.index_price)) / Number(s.index_price)) * 100, 3)],
      ]}
    />
  );
}

function DetailsView({ market }: { market: MarketMeta | undefined }) {
  const s = useMarketStats()[market?.marketId ?? -1];
  if (!market) return <div className="absolute inset-0 grid place-items-center text-[12px] text-muted">Waiting for market data…</div>;
  const dec = market.priceDecimals;
  return (
    <InfoGrid
      rows={[
        ["Market", `${market.symbol}-PERP`],
        ["Max leverage", `${Math.floor(10000 / market.minImf)}x`],
        ["Default leverage", `${Math.round(10000 / market.defaultImf)}x`],
        ["Min order size", `${market.minBase} ${market.symbol}`],
        ["Min order value", `$${num(market.minQuote, 0)}`],
        ["Size decimals", String(market.sizeDecimals)],
        ["Price decimals", String(market.priceDecimals)],
        ["24h high", s ? num(s.daily_price_high, dec) : "–"],
        ["24h low", s ? num(s.daily_price_low, dec) : "–"],
        ["24h volume (base)", s ? `${num(s.daily_base_token_volume, market.sizeDecimals)} ${market.symbol}` : "–"],
      ]}
    />
  );
}
