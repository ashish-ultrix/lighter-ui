"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { compact, num, pct } from "@/lib/format";
import { useMarketStats } from "@/lib/lighter/hooks";
import type { MarketMeta } from "@/lib/lighter/types";
import { Glyph, Tooltip, useDismiss } from "./ui";

interface MarketBarProps {
  markets: MarketMeta[];
  market: MarketMeta | undefined;
  onSelect: (symbol: string) => void;
}

/** Symbol picker plus the live 24h stat strip that heads the chart panel. */
export function MarketBar({ markets, market, onSelect, compact }: MarketBarProps & { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  if (compact) {
    return (
      <div className="shrink-0 border-b-[0.5px] border-line">
        <MarketTicker markets={markets} market={market} onSelect={onSelect} open={open} onToggle={() => setOpen((o) => !o)} />
        {open && <StatList market={market} className="fade-in grid grid-cols-3 gap-x-3 gap-y-3 px-3 pb-3 pt-1" />}
      </div>
    );
  }
  return (
    <div className="flex min-h-10 shrink-0 items-center gap-2.5 border-b-[0.5px] border-line px-[5px]">
      <MarketSelector markets={markets} market={market} onSelect={onSelect} />
      <StatList market={market} className="no-scrollbar flex min-w-0 flex-1 items-center gap-[21px] overflow-x-auto py-1" />
    </div>
  );
}

/** Symbol picker with the last price and 24h change. Pass `onToggle` to make it expand the stats. */
export function MarketTicker({
  markets,
  market,
  onSelect,
  open,
  onToggle,
}: MarketBarProps & { open?: boolean; onToggle?: () => void }) {
  const s = useMarketStats()[market?.marketId ?? -1];
  const change = s?.daily_price_change;
  const tone = change === undefined ? undefined : change >= 0 ? "text-up" : "text-down";
  const Tag = onToggle ? "button" : "div";
  return (
    <div className="flex items-center justify-between gap-2 px-[7px] py-2">
      <MarketSelector markets={markets} market={market} onSelect={onSelect} />
      <Tag
        {...(onToggle ? { onClick: onToggle, "aria-expanded": open, "aria-label": "Market stats" } : {})}
        className="press flex items-center gap-2 text-[14px]"
      >
        <span>{s ? num(s.last_trade_price || s.mark_price, market?.priceDecimals ?? 2) : "–"}</span>
        <span className={tone}>{pct(change)}</span>
        {onToggle && <Glyph name="chevron-12" className={cn("size-3 transition-transform duration-150 ease-out", open && "rotate-180")} />}
      </Tag>
    </div>
  );
}

// Wording copied from Lighter's own app.
const STAT_TIPS = {
  mark: "Mark price is the fair price of a perpetual contract, based on the order book state and index price. It is used for calculating margin requirements, unrealized PnL, and liquidations.",
  index: "Index price represents the real-time market price of the underlying asset in spot markets.",
  oi: "Two-sided open interest: Sum of all outstanding long and short positions in this contract.",
  funding:
    "Funding payments occur hourly based on the contract and index price difference. Longs pay shorts if the rate is positive, and shorts pay longs if negative. Funding is peer-to-peer, with no fees taken by the exchange.",
  next: "Remaining time until the next funding payment, which occurs hourly.",
};

/** mm:ss to the top of the next hour, when funding settles. Empty until mounted so server and client agree. */
function useNextFunding(): string {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return "–";
  const left = 3600 - Math.floor(now / 1000) % 3600;
  return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
}

function StatList({ market, className }: { market: MarketMeta | undefined; className: string }) {
  const s = useMarketStats()[market?.marketId ?? -1];
  const next = useNextFunding();
  const dec = market?.priceDecimals ?? 2;
  const change = s?.daily_price_change;
  return (
    <div className={className}>
      <Stat label="Mark Price" tip={STAT_TIPS.mark} value={s ? num(s.mark_price, dec) : "–"} />
      <Stat label="Index Price" tip={STAT_TIPS.index} value={s ? num(s.index_price, dec) : "–"} />
      <Stat label="24h Change" value={pct(change)} tone={change === undefined ? undefined : change >= 0 ? "up" : "down"} />
      <Stat label="24h Volume" value={s ? `$${compact(s.daily_quote_token_volume)}` : "–"} />
      <Stat label="Open Interest" tip={STAT_TIPS.oi} value={s ? `$${compact(s.open_interest)}` : "–"} />
      <Stat label="1hr Funding" tip={STAT_TIPS.funding} value={s ? pct(Number(s.current_funding_rate), 4) : "–"} />
      <Stat label="Next Funding" tip={STAT_TIPS.next} value={next} />
    </div>
  );
}

function Stat({ label, value, tone, tip }: { label: string; value: string; tone?: "up" | "down"; tip?: string }) {
  const cls = "text-[11px] uppercase leading-3 tracking-[0.44px] text-muted";
  return (
    <div className="flex min-w-[60px] shrink-0 flex-col gap-[3.5px]">
      {tip ? (
        <Tooltip text={tip} className={cls}>
          {label}
        </Tooltip>
      ) : (
        <span className={cls}>{label}</span>
      )}
      <span className={cn("text-[12px] leading-[14px]", tone === "up" && "text-up", tone === "down" && "text-down")}>
        {value}
      </span>
    </div>
  );
}

function MarketSelector({ markets, market, onSelect }: MarketBarProps) {
  const stats = useMarketStats();
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const maxLev = market ? Math.floor(10000 / market.minImf) : undefined;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="press hover-raise flex items-center gap-[3.5px] overflow-hidden rounded-[3px] bg-white/[0.05] p-[5px] shadow-[0_0_0_0.5px_black,inset_0_0.4px_0_rgb(255_255_255/0.08)]"
      >
        <SymbolMark symbol={market?.symbol} />
        <span className="text-[14px] leading-[14px] tracking-[-0.28px]">{market?.symbol ?? "Select"}</span>
        {maxLev && <span className="text-[14px] leading-[14px] tracking-[-0.28px] text-fg/50">{maxLev}x</span>}
        <Glyph name="chevron-12" className="size-3" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="pop-in absolute left-0 top-10 z-30 max-h-80 w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-line-strong bg-raised shadow-2xl shadow-black/60"
        >
          {markets.map((m) => {
            const st = stats[m.marketId];
            const ch = st?.daily_price_change;
            return (
              <li key={m.marketId}>
                <button
                  role="option"
                  aria-selected={m.marketId === market?.marketId}
                  onClick={() => {
                    onSelect(m.symbol);
                    setOpen(false);
                  }}
                  className={cn(
                    "press hover-raise flex w-full items-center justify-between px-3 py-2.5 text-left",
                    m.marketId === market?.marketId && "bg-white/[0.05]",
                  )}
                >
                  <span className="font-medium">{m.symbol}-PERP</span>
                  <span className="flex items-baseline gap-3">
                    <span>{st ? num(st.last_trade_price || st.mark_price, m.priceDecimals) : "–"}</span>
                    <span
                      className={cn("w-16 text-right text-[12px]", ch === undefined ? "text-muted" : ch >= 0 ? "text-up" : "text-down")}
                    >
                      {pct(ch)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The Figma ships an ETH mark only; other symbols get their first letter. */
function SymbolMark({ symbol }: { symbol: string | undefined }) {
  if (symbol === "ETH") return <Glyph name="eth" className="size-[14px]" />;
  return (
    <span aria-hidden className="grid size-[14px] place-items-center rounded-full bg-white/10 text-[8px] font-medium">
      {symbol?.[0] ?? ""}
    </span>
  );
}
