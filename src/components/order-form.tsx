"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, type OrderRequest, type OrderResult, type PartnerInfo } from "@/lib/api";
import { cn } from "@/lib/cn";
import { num, usd } from "@/lib/format";
import { useMarketStats } from "@/lib/lighter/hooks";
import type { MarketMeta } from "@/lib/lighter/types";
import { useSession } from "@/lib/session";
import { ConnectCard } from "./connect-card";
import { Glyph, Panel, PillTabs } from "./ui";
import { LeverageControl, currentLeverage } from "./leverage-control";

export interface PriceHint {
  price: number;
  n: number;
}

export type Side = "buy" | "sell";
type Kind = "market" | "limit";
type Tif = "gtt" | "ioc" | "post_only";

const decimalsOf = (s: string) => (s.includes(".") ? s.split(".")[1].length : 0);

export function OrderForm({ market, hint, initialSide = "buy", bare }: { market: MarketMeta | undefined; hint: PriceHint; initialSide?: Side; bare?: boolean }) {
  const body = market ? (
    <Ticket market={market} hint={hint} initialSide={initialSide} />
  ) : (
    <div className="grid h-40 place-items-center text-[12px] text-muted">Loading market…</div>
  );
  if (bare) return body;
  return (
    <Panel className="h-full">
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </Panel>
  );
}

function Ticket({ market, hint, initialSide }: { market: MarketMeta; hint: PriceHint; initialSide: Side }) {
  const { state, account } = useSession();
  const ready = state === "ready";
  const stats = useMarketStats()[market.marketId];
  const qc = useQueryClient();

  const [side, setSide] = useState<Side>(initialSide);
  // A price picked from the book before the ticket mounted (mobile sheet) seeds a limit order.
  const [kind, setKind] = useState<Kind>(hint.n > 0 ? "limit" : "market");
  const [tif, setTif] = useState<Tif>("gtt");
  const [advanced, setAdvanced] = useState(false);
  const partner = useQuery({ queryKey: ["partner"], queryFn: api.partner, staleTime: 60_000, enabled: ready }).data;
  const [size, setSize] = useState("");
  const [price, setPrice] = useState(hint.n > 0 ? hint.price.toFixed(market.priceDecimals) : "");
  const [reduceOnly, setReduceOnly] = useState(false);

  // Clicking a book row seeds the price and switches to limit. Adjusting state
  // during render (not in an effect) avoids a stale frame.
  const [seenHint, setSeenHint] = useState(hint.n);
  if (hint.n !== seenHint) {
    setSeenHint(hint.n);
    setPrice(hint.price.toFixed(market.priceDecimals));
    setKind("limit");
  }

  const a = account?.account;
  const available = Number(a?.available_balance ?? 0);
  const leverage = currentLeverage(a?.positions, market);
  const held = a?.positions.find((p) => p.market_id === market.marketId);
  const heldSize = held ? held.sign * Number(held.position) : 0;

  const touch = side === "buy" ? Number(stats?.best_ask_price) : Number(stats?.best_bid_price);
  // last_trade_price is 0 until the first trade after Lighter's daily stats reset.
  const fallback = Number(stats?.last_trade_price) || Number(stats?.mark_price);
  const refPrice = kind === "limit" ? Number(price) : Number.isFinite(touch) && touch > 0 ? touch : fallback;

  const sizeNum = Number(size);
  const notional = sizeNum * refPrice;
  const hasSize = Number.isFinite(notional) && notional > 0;

  let problem: string | null = null;
  if (!size) problem = "Enter a size";
  else if (!(sizeNum > 0)) problem = "Size must be positive";
  else if (decimalsOf(size) > market.sizeDecimals) problem = `Max ${market.sizeDecimals} decimals for size`;
  else if (sizeNum < market.minBase) problem = `Minimum size is ${market.minBase} ${market.symbol}`;
  else if (kind === "limit" && !(Number(price) > 0)) problem = "Enter a limit price";
  else if (kind === "limit" && decimalsOf(price) > market.priceDecimals) problem = `Max ${market.priceDecimals} decimals for price`;
  else if (Number.isFinite(notional) && notional < market.minQuote) problem = `Minimum order value is ${usd(market.minQuote, 0)}`;

  const marginNeeded = hasSize ? notional / leverage : 0;

  // The slider is derived from the size, so typing and dragging never disagree.
  const buyingPower = available * leverage * 0.98;
  const pct = hasSize && buyingPower > 0 ? Math.min(100, Math.round((notional / buyingPower) * 100)) : 0;

  function setPct(p: number) {
    if (!(refPrice > 0)) return;
    const raw = (buyingPower * p) / 100 / refPrice;
    const f = 10 ** market.sizeDecimals;
    const v = Math.floor(raw * f) / f;
    setSize(v > 0 ? v.toFixed(market.sizeDecimals) : "");
  }

  const place = useMutation({
    mutationFn: (req: OrderRequest) => api.placeOrder(req),
    onSuccess: (r) => {
      announce(r, market);
      setSize("");
      void Promise.all(["account", "orders", "history", "fills"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
    onError: (e: Error) => toast.error("Order rejected", { description: e.message }),
  });

  function submit() {
    if (!ready || problem || place.isPending) return;
    place.mutate({
      symbol: market.symbol,
      side,
      type: kind,
      size,
      reduce_only: reduceOnly || undefined,
      ...(kind === "limit" ? { price, time_in_force: tif } : { slippage_bps: 100 }),
    });
  }

  const dash = "–";
  return (
    <div className="flex flex-col">
      <div role="tablist" className="grid grid-cols-2">
        {([
          { id: "buy", label: "Buy / Long" },
          { id: "sell", label: "Sell / Short" },
        ] as const).map((o) => (
          <button
            key={o.id}
            role="tab"
            aria-selected={side === o.id}
            onClick={() => setSide(o.id)}
            className={cn(
              "press h-[30px] text-[13px] font-medium",
              side === o.id
                ? o.id === "buy"
                  ? "bg-up text-black"
                  : "bg-down text-black"
                : "bg-white/[0.05] text-fg/80 hover-raise",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="relative flex items-center justify-between px-[7px] pt-[7px]">
        <PillTabs
          tabs={[
            { id: "market", label: "Market" },
            { id: "limit", label: "Limit" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <div className="flex items-center gap-2">
          {ready && <LeverageControl market={market} leverage={leverage} />}
          {kind === "limit" && (
            <button
              onClick={() => setAdvanced((v) => !v)}
              aria-expanded={advanced}
              className="press hover-fg flex items-center gap-1 text-[12px] text-fg/70"
            >
              Advanced
              <Glyph name="chevron-10" className={cn("size-[10px] transition-transform duration-150 ease-out", advanced && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-[7px] pb-[7px] pt-2">
        <Row label="Available to Trade" value={ready ? usd(available) : dash} />
        <Row
          label="Position"
          value={ready ? `${heldSize === 0 ? "0" : num(heldSize, market.sizeDecimals)} ${market.symbol}` : dash}
          tone={heldSize > 0 ? "up" : heldSize < 0 ? "down" : undefined}
        />

        {kind === "limit" && (
          <Field label="Price" suffix="USD">
            <input
              inputMode="decimal"
              disabled={!ready}
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder={num(refPrice || undefined, market.priceDecimals)}
              className="w-full bg-transparent text-right font-mono outline-none disabled:cursor-not-allowed"
            />
          </Field>
        )}

        <Field label="Amount" suffix={market.symbol}>
          <input
            inputMode="decimal"
            disabled={!ready}
            value={size}
            onChange={(e) => setSize(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={(0).toFixed(market.sizeDecimals)}
            className="w-full bg-transparent text-right font-mono outline-none disabled:cursor-not-allowed"
          />
        </Field>

        <div className="flex items-center gap-3 py-1">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            disabled={!ready || !(refPrice > 0)}
            onChange={(e) => setPct(Number(e.target.value))}
            aria-label="Share of buying power"
            className="h-1 min-w-0 flex-1 disabled:cursor-not-allowed"
          />
          <span className="flex h-[25px] w-[52px] shrink-0 items-center justify-end gap-1 rounded-[3px] border-[0.5px] border-line bg-white/[0.05] px-2 font-mono text-[12px]">
            {pct}
            <span className="text-muted">%</span>
          </span>
        </div>

        {kind === "limit" && advanced && (
          <label className="fade-in flex items-center justify-between text-[12px] text-muted">
            Time in force
            <select
              value={tif}
              onChange={(e) => setTif(e.target.value as Tif)}
              className="rounded border border-line bg-bg px-2 py-1 text-fg outline-none"
            >
              <option value="gtt">Good till time</option>
              <option value="ioc">Immediate or cancel</option>
              <option value="post_only">Post only</option>
            </select>
          </label>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-fg/80">
          <input
            type="checkbox"
            checked={reduceOnly}
            disabled={!ready}
            onChange={(e) => setReduceOnly(e.target.checked)}
            className="size-3.5 accent-white"
          />
          Reduce Only
        </label>

        {ready ? (
          <button
            onClick={submit}
            disabled={!!problem || place.isPending}
            className={cn(
              "press h-[30px] rounded-[3px] text-[13px] font-medium",
              side === "buy" ? "bg-up text-black" : "bg-down text-black",
            )}
          >
            {place.isPending ? "Placing…" : `${side === "buy" ? "Buy / Long" : "Sell / Short"} ${market.symbol}`}
          </button>
        ) : (
          <ConnectCard />
        )}
        {ready && (
          <p className={cn("min-h-4 text-[12px]", problem && size ? "text-down" : "text-muted")}>
            {problem && size ? problem : kind === "market" ? "Market orders fill at up to 1% slippage." : ""}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Row label="Order Size" value={sizeNum > 0 ? `${num(sizeNum, market.sizeDecimals)} ${market.symbol}` : dash} />
          <Row label="Order Value" value={hasSize ? usd(notional) : dash} />
          <Row label="Position Margin" value={usd(marginNeeded)} />
          <Row label="Est. Price" value={refPrice > 0 ? num(refPrice, market.priceDecimals) : dash} />
          <Row label="Slippage" value={kind === "market" ? "Max: 1%" : dash} accent />
          <Row label="Fees" value={fees(partner)} />
        </div>
      </div>
    </div>
  );
}

function fees(p: PartnerInfo | undefined): string {
  if (!p?.enabled || (p.taker_fee_bps === 0 && p.maker_fee_bps === 0)) return "None";
  return `Taker: ${p.taker_fee_bps / 100}% | Maker: ${p.maker_fee_bps / 100}%`;
}

function announce(r: OrderResult, market: MarketMeta) {
  const verb = r.side === "buy" ? "Bought" : "Sold";
  if (r.tx_status === "failed") {
    toast.error("Order failed on Lighter", { description: `tx ${r.tx_hash.slice(0, 12)}…` });
    return;
  }
  if (r.tx_status === "pending") {
    toast("Submitted", { description: "Waiting for Lighter to confirm." });
    return;
  }
  const o = r.order;
  if (o?.status === "filled") {
    const filled = Number(o.filled_base_amount);
    const avg = filled ? Number(o.filled_quote_amount) / filled : 0;
    toast.success(`${verb} ${num(filled, market.sizeDecimals)} ${r.symbol}`, {
      description: avg ? `Average price ${usd(avg, market.priceDecimals)}` : undefined,
    });
  } else if (o?.status === "canceled" && r.type === "market") {
    toast.warning("Not filled", { description: "No liquidity within the slippage limit." });
  } else if (r.type === "market") {
    // Lighter confirmed the tx but its order index hasn't caught up, so the
    // fill details aren't known yet. The positions table is the source of truth.
    toast(`${verb === "Bought" ? "Buy" : "Sell"} sent to Lighter`, {
      description: "Fill details haven't appeared yet. Check Order history and Positions.",
    });
  } else {
    toast.success(`${r.side === "buy" ? "Buy" : "Sell"} limit placed`, {
      description: `${r.size} ${r.symbol} @ ${usd(r.price, market.priceDecimals)}`,
    });
  }
}

function Field({ label, suffix, children }: { label: string; suffix: string; children: React.ReactNode }) {
  return (
    <label className="flex h-[30px] items-center gap-2 rounded-[3px] border-[0.5px] border-line bg-white/[0.04] px-2.5 text-[12px] focus-within:border-fg/60">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
      <span className="text-fg/80">{suffix}</span>
    </label>
  );
}

function Row({ label, value, tone, accent }: { label: string; value: string; tone?: "up" | "down"; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted">{label}</span>
      <span className={cn(tone === "up" && "text-up", tone === "down" && "text-down", accent && "text-accent")}>{value}</span>
    </div>
  );
}
