"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, type Fill, type Funding, type LedgerOrder, type Order, type Position } from "@/lib/api";
import { cn } from "@/lib/cn";
import { EXPLORER } from "@/lib/config";
import { dateTime, num, pct, signedUsd, usd } from "@/lib/format";
import { useMarketStats } from "@/lib/lighter/hooks";
import { fetchAssets } from "@/lib/lighter/rest";
import type { AccountAsset, MarketMeta } from "@/lib/lighter/types";
import { useSession } from "@/lib/session";
import { currentLeverage } from "./leverage-control";
import { Panel, PillTabs, Tooltip } from "./ui";

type Tab = "positions" | "assets" | "orders" | "history" | "fills" | "funding";

export function BottomPanel({ markets }: { markets: MarketMeta[] }) {
  const { state, account } = useSession();
  const ready = state === "ready";
  const [tab, setTab] = useState<Tab>("positions");
  const qc = useQueryClient();
  const byId = new Map(markets.map((m) => [m.marketId, m]));

  const orders = useQuery({ queryKey: ["orders"], queryFn: api.openOrders, enabled: ready, refetchInterval: 3000 });
  const history = useQuery({ queryKey: ["history"], queryFn: api.orderHistory, enabled: ready && tab === "history", refetchInterval: 5000 });
  const ledger = useQuery({ queryKey: ["ledger"], queryFn: api.ledger, enabled: ready && tab === "history", refetchInterval: 5000 });
  const assets = useQuery({
    queryKey: ["assets", account?.account_index],
    queryFn: () => fetchAssets(account!.account_index),
    enabled: ready && !!account,
    refetchInterval: 5000,
  });
  const fills = useQuery({ queryKey: ["fills"], queryFn: api.fills, enabled: ready && tab === "fills", refetchInterval: 5000 });
  const funding = useQuery({ queryKey: ["funding"], queryFn: api.funding, enabled: ready && tab === "funding", refetchInterval: 30_000 });

  const positions = (account?.account.positions ?? []).filter((p) => Number(p.position) !== 0);

  const cancelAll = useMutation({
    mutationFn: api.cancelAll,
    onSuccess: () => {
      toast.success("All orders cancelled");
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (e: Error) => toast.error("Cancel failed", { description: e.message }),
  });

  return (
    <Panel className="h-full">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b-[0.5px] border-line p-[5px]">
        <PillTabs
          className="no-scrollbar min-w-0 overflow-x-auto"
          tabs={[
            { id: "positions", label: "Positions", badge: positions.length },
            { id: "assets", label: "Assets", badge: assets.data?.length },
            { id: "orders", label: "Open Orders", badge: orders.data?.length },
            { id: "history", label: "Order History" },
            { id: "fills", label: "Trade History" },
            { id: "funding", label: "Funding History" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "orders" && (orders.data?.length ?? 0) > 0 && (
          <button
            onClick={() => cancelAll.mutate()}
            disabled={cancelAll.isPending}
            className="press hover-raise h-[21px] shrink-0 rounded-[3px] border-[0.5px] border-line px-2 text-[12px] text-muted"
          >
            {cancelAll.isPending ? "Cancelling…" : "Cancel all"}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!ready ? (
          <Empty title="No account yet">Connect from the trade panel and your open positions appear here.</Empty>
        ) : tab === "positions" ? (
          <Positions positions={positions} byId={byId} />
        ) : tab === "assets" ? (
          <Assets assets={assets.data} />
        ) : tab === "orders" ? (
          <OpenOrders orders={orders.data} byId={byId} />
        ) : tab === "history" ? (
          <History orders={history.data} byId={byId} ledger={ledger.data} />
        ) : tab === "funding" ? (
          <FundingHistory rows={funding.data} byId={byId} />
        ) : (
          <Fills fills={fills.data} byId={byId} positions={account?.account.positions ?? []} />
        )}
      </div>
    </Panel>
  );
}

type MarketMap = Map<number, MarketMeta>;

function Empty({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="grid h-full min-h-24 place-items-center p-4 text-center text-[12px] text-muted">
      <div className="flex max-w-xs flex-col items-center gap-2">
        {title && <span className="font-mono text-[13px] uppercase tracking-[0.5px] text-fg">{title}</span>}
        <span>{children}</span>
      </div>
    </div>
  );
}

function Table({ head, children, minWidth = 640 }: { head: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <table className="w-full text-[12px]" style={{ minWidth }}>
      <thead className="sticky top-0 z-10 bg-panel text-[11px] uppercase tracking-[0.44px] text-muted">
        <tr>
          {head.map((h, i) => (
            <th key={i} className={cn("px-3 py-1.5 font-normal", i === 0 ? "text-left" : "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("px-3 py-1.5 text-right", className)}>{children}</td>
);
const Th1 = ({ children, stripe }: { children: ReactNode; stripe?: "up" | "down" }) => (
  <td className={cn("border-l-2 px-3 py-1.5 text-left font-medium", stripe === "up" ? "border-up" : stripe === "down" ? "border-down" : "border-transparent")}>
    {children}
  </td>
);

const closeRequest = (p: Position) => ({
  symbol: p.symbol,
  side: (p.sign > 0 ? "sell" : "buy") as "sell" | "buy",
  type: "market" as const,
  size: String(Math.abs(Number(p.position))),
  reduce_only: true,
  slippage_bps: 150,
});

const UPNL_TIP =
  "Unrealized profit and loss is the potential profit or loss on open positions. It is calculated by the difference between the current market price and the average entry price of the position.";

function Positions({ positions, byId }: { positions: Position[]; byId: MarketMap }) {
  const stats = useMarketStats();
  const qc = useQueryClient();
  const refresh = () => Promise.all(["account", "orders", "fills"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const close = useMutation({
    mutationFn: (p: Position) => api.placeOrder(closeRequest(p)),
    onSuccess: (r) => {
      toast.success(`Closed ${r.symbol} position`);
      void refresh();
    },
    onError: (e: Error) => toast.error("Couldn’t close position", { description: e.message }),
  });

  // One at a time: Lighter orders a key's transactions by nonce, so parallel sends can collide.
  const closeAll = useMutation({
    mutationFn: async () => {
      for (const p of positions) await api.placeOrder(closeRequest(p));
    },
    onSuccess: () => {
      toast.success("Closed all positions");
      void refresh();
    },
    onError: (e: Error) => {
      toast.error("Couldn’t close every position", { description: e.message });
      void refresh();
    },
  });
  const [confirming, setConfirming] = useState(false);
  const busy = close.isPending || closeAll.isPending;

  if (positions.length === 0) return <Empty>No open positions.</Empty>;
  return (
    <Table
      minWidth={860}
      head={[
        "Market",
        "Size",
        "Value",
        "Entry Price",
        "Mark Price",
        "Liq. Price",
        <Tooltip key="pnl" text={UPNL_TIP}>
          Unrealized PnL
        </Tooltip>,
        "Margin",
        <button
          key="all"
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              setTimeout(() => setConfirming(false), 3000);
              return;
            }
            setConfirming(false);
            closeAll.mutate();
          }}
          disabled={busy}
          className={cn("press uppercase tracking-[0.44px] disabled:opacity-50", confirming ? "text-down" : "text-down/80 hover:text-down")}
        >
          {closeAll.isPending ? "Closing…" : confirming ? "Confirm close all" : "Close all"}
        </button>,
      ]}
    >
      {positions.map((p) => {
        const m = byId.get(p.market_id);
        const pd = m?.priceDecimals ?? 2;
        const size = Math.abs(Number(p.position));
        const mark = Number(stats[p.market_id]?.mark_price);
        const entry = Number(p.avg_entry_price);
        const live = Number.isFinite(mark);
        const pnl = live ? p.sign * (mark - entry) * size : Number(p.unrealized_pnl);
        const imf = Number(p.initial_margin_fraction);
        const lev = imf > 0 ? Math.round(100 / imf) : 1;
        const value = live ? mark * size : Number(p.position_value);
        const margin = Number(p.allocated_margin) > 0 ? Number(p.allocated_margin) : value / lev;
        // Return on the margin the entry tied up, which is what Lighter's own % shows.
        const entryMargin = (entry * size) / lev;
        const pnlPct = entryMargin > 0 ? (pnl / entryMargin) * 100 : 0;
        const tone = pnl > 0 ? "text-up" : pnl < 0 ? "text-down" : undefined;
        return (
          <tr key={p.market_id} className="border-t border-line/60">
            <Th1 stripe={p.sign > 0 ? "up" : "down"}>
              {p.symbol} <span className="font-normal text-muted">{lev}x</span>
            </Th1>
            <Td>{num(size, m?.sizeDecimals ?? 4)}</Td>
            <Td>{usd(value)}</Td>
            <Td>{num(entry, pd)}</Td>
            <Td>{live ? num(mark, pd) : "–"}</Td>
            <Td>{Number(p.liquidation_price) > 0 ? num(p.liquidation_price, pd) : "N/A"}</Td>
            <Td className={tone}>
              {signedUsd(pnl)} ({pct(pnlPct)})
            </Td>
            <Td>{usd(margin)}</Td>
            <Td>
              <button
                onClick={() => close.mutate(p)}
                disabled={busy}
                aria-label={`Close ${p.symbol} position`}
                title="Close position at market"
                className="press hover-raise inline-grid size-6 place-items-center rounded border border-down/40 text-down"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <path d="M1.5 1.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

function Assets({ assets }: { assets: AccountAsset[] | undefined }) {
  if (!assets) return <Empty>Loading…</Empty>;
  if (assets.length === 0) return <Empty>No assets yet.</Empty>;
  return (
    <Table minWidth={520} head={["Asset", "Balance", "Locked", "Margin Balance"]}>
      {assets.map((x) => {
        const decimals = x.symbol === "USDC" ? 2 : 4;
        return (
          <tr key={x.symbol} className="border-t border-line/60">
            <Th1>{x.symbol}</Th1>
            <Td>{num(x.balance, decimals)}</Td>
            <Td className={Number(x.locked_balance) > 0 ? undefined : "text-muted"}>{num(x.locked_balance, decimals)}</Td>
            <Td className={Number(x.margin_balance) > 0 ? undefined : "text-muted"}>{num(x.margin_balance, decimals)}</Td>
          </tr>
        );
      })}
    </Table>
  );
}

function OpenOrders({ orders, byId }: { orders: Order[] | undefined; byId: MarketMap }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: (o: { id: number; symbol: string }) => api.cancelOrder(o.id, o.symbol),
    onSuccess: () => {
      toast.success("Order cancelled");
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (e: Error) => toast.error("Cancel failed", { description: e.message }),
  });

  if (!orders) return <Empty>Loading…</Empty>;
  if (orders.length === 0) return <Empty>No open orders.</Empty>;
  return (
    <Table head={["Market", "Side", "Type", "Price", "Remaining", "Filled", "Time in force", ""]}>
      {orders.map((o) => {
        const m = byId.get(o.market_index);
        return (
          <tr key={o.order_index} className="border-t border-line/60">
            <Th1>{m?.symbol ?? o.market_index}-PERP</Th1>
            <Td className={o.is_ask ? "text-down" : "text-up"}>{o.is_ask ? "Sell" : "Buy"}</Td>
            <Td className="capitalize">{o.type}</Td>
            <Td>{num(o.price, m?.priceDecimals ?? 2)}</Td>
            <Td>{num(o.remaining_base_amount, m?.sizeDecimals ?? 4)}</Td>
            <Td>{num(o.filled_base_amount, m?.sizeDecimals ?? 4)}</Td>
            <Td className="text-muted">{o.time_in_force.replaceAll("-", " ")}</Td>
            <Td>
              <button
                onClick={() => cancel.mutate({ id: o.order_index, symbol: m?.symbol ?? "" })}
                disabled={cancel.isPending}
                className="press hover-raise h-6 rounded border border-line px-2 text-[11px]"
              >
                Cancel
              </button>
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

function History({ orders, byId, ledger }: { orders: Order[] | undefined; byId: MarketMap; ledger: LedgerOrder[] | undefined }) {
  if (!orders) return <Empty>Loading…</Empty>;
  if (orders.length === 0) return <Empty>No order history yet.</Empty>;
  // Lighter's order history has no transaction hash; our own ledger does.
  const txByClient = new Map((ledger ?? []).map((l) => [l.client_order_index, l.tx_hash]));
  return (
    <Table minWidth={760} head={["Time", "Market", "Side", "Type", "Price", "Size", "Filled", "Status", "Explorer"]}>
      {orders.map((o) => {
        const m = byId.get(o.market_index);
        const tx = txByClient.get(o.client_order_index);
        return (
          <tr key={o.order_index} className="border-t border-line/60">
            <Th1 stripe={o.is_ask ? "down" : "up"}>{dateTime(o.timestamp * 1000)}</Th1>
            <Td>{m?.symbol ?? o.market_index}</Td>
            <Td className={o.is_ask ? "text-down" : "text-up"}>{o.is_ask ? "Sell" : "Buy"}</Td>
            <Td className="capitalize">{o.type}</Td>
            <Td>{num(o.price, m?.priceDecimals ?? 2)}</Td>
            <Td>{num(o.initial_base_amount, m?.sizeDecimals ?? 4)}</Td>
            <Td>{num(o.filled_base_amount, m?.sizeDecimals ?? 4)}</Td>
            <Td className={cn("capitalize", o.status === "filled" ? "text-up" : "text-muted")}>{o.status}</Td>
            <Td>{tx ? <ExplorerLink tx={tx} title="View transaction in the Lighter explorer" /> : <span className="text-muted">–</span>}</Td>
          </tr>
        );
      })}
    </Table>
  );
}

function ExplorerLink({ tx, title }: { tx: string; title: string }) {
  return (
    <a
      href={`${EXPLORER}/logs/${tx}`}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="hover-fg inline-flex items-center gap-1 underline underline-offset-2"
    >
      Explorer
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M6 1l4.5 2.5v5L6 11 1.5 8.5v-5L6 1zm0 4.5L1.5 3.5M6 5.5l4.5-2M6 5.5V11" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

const ACTION_LABEL: Record<Fill["action"], string> = {
  open_long: "Open Long",
  open_short: "Open Short",
  close_long: "Close Long",
  close_short: "Close Short",
};

function Fills({ fills, byId, positions }: { fills: Fill[] | undefined; byId: MarketMap; positions: Position[] }) {
  if (!fills) return <Empty>Loading…</Empty>;
  if (fills.length === 0) return <Empty>No trades yet.</Empty>;
  return (
    <Table minWidth={900} head={["Market", "Side", "Date", "Trade Value", "Size", "Price", "Closed PnL", "Fee", "Role", "Type", "Explorer"]}>
      {fills.map((f) => {
        const m = byId.get(f.market_id);
        const buy = f.side === "buy";
        const pnl = f.realized_pnl === null ? null : Number(f.realized_pnl);
        // Return on the margin the closed part of the position tied up (current leverage).
        const before = Number(f.position_size_before);
        const closed = Math.min(Number(f.size), before);
        const lev = m ? currentLeverage(positions, m) : 1;
        const base = before > 0 ? (Number(f.entry_quote_before) * (closed / before)) / lev : 0;
        return (
          <tr key={f.trade_id} className="border-t border-line/60">
            <Th1 stripe={buy ? "up" : "down"}>{m?.symbol ?? f.symbol}</Th1>
            <Td className={cn("text-left", buy ? "text-up" : "text-down")}>{ACTION_LABEL[f.action]}</Td>
            <Td className="text-left text-muted">{dateTime(f.timestamp)}</Td>
            <Td>{usd(f.usd_amount)}</Td>
            <Td>{num(f.size, m?.sizeDecimals ?? 4)}</Td>
            <Td>{num(f.price, m?.priceDecimals ?? 2)}</Td>
            <Td className={pnl === null ? "text-muted" : pnl > 0 ? "text-up" : pnl < 0 ? "text-down" : undefined}>
              {pnl === null ? "–" : `${signedUsd(pnl)}${base > 0 ? ` (${pct((pnl / base) * 100)})` : ""}`}
            </Td>
            <Td className={f.partner_fee === null ? "text-muted" : undefined}>{f.partner_fee === null ? "–" : usd(f.partner_fee, 4)}</Td>
            <Td className="capitalize">{f.role}</Td>
            <Td className="capitalize">{f.type || "trade"}</Td>
            <Td>
              {f.tx_hash ? (
                <ExplorerLink tx={f.tx_hash} title={`View transaction in block ${f.block_height.toLocaleString("en-US")}`} />
              ) : (
                <span className="text-muted">–</span>
              )}
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}

function FundingHistory({ rows, byId }: { rows: Funding[] | undefined; byId: MarketMap }) {
  if (!rows) return <Empty>Loading…</Empty>;
  if (rows.length === 0) return <Empty>No funding payments yet. They settle hourly while a position is open.</Empty>;
  return (
    <Table minWidth={640} head={["Market", "Date", "Payment", "Rate", "Position"]}>
      {rows.map((r) => {
        const m = byId.get(r.market_id);
        const change = Number(r.change);
        return (
          <tr key={r.funding_id + "-" + r.market_id} className="border-t border-line/60">
            <Th1 stripe={r.position_side === "long" ? "up" : "down"}>{m?.symbol ?? r.symbol}</Th1>
            <Td className="text-left text-muted">{dateTime(r.timestamp)}</Td>
            <Td className={change > 0 ? "text-up" : change < 0 ? "text-down" : undefined}>{signedUsd(change, 6)}</Td>
            <Td>{pct(Number(r.rate) * 100, 4)}</Td>
            <Td className={r.position_side === "long" ? "text-up" : "text-down"}>
              {num(r.position_size, m?.sizeDecimals ?? 4)} {r.position_side === "long" ? "Long" : "Short"}
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}
