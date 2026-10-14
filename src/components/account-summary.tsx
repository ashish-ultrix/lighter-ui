"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { num, signed, usd } from "@/lib/format";
import { useMarketStats } from "@/lib/lighter/hooks";
import type { MarketMeta } from "@/lib/lighter/types";
import { useSession } from "@/lib/session";
import { Panel, Tooltip } from "./ui";

/** Live unrealised PnL from the streamed mark price, not the 4s-old REST value. */
export function useLivePnl(): number {
  const { account } = useSession();
  const stats = useMarketStats();
  let total = 0;
  for (const p of account?.account.positions ?? []) {
    const size = Number(p.position);
    if (!size) continue;
    const mark = Number(stats[p.market_id]?.mark_price);
    const entry = Number(p.avg_entry_price);
    total += Number.isFinite(mark) ? p.sign * (mark - entry) * size : Number(p.unrealized_pnl);
  }
  return total;
}

// Wording copied from Lighter's own app so the explanations match the real thing.
const TIPS = {
  equity:
    "The total value of all your assets, including positions, and excluding Public Pool deposits. Calculated in real-time based on current prices.",
  pnl: "Unrealized profit and loss is the potential profit or loss on open positions. It is calculated by the difference between the current market price and the average entry price of the position.",
  leverage:
    "The total leverage used across all open positions in your account. High cross-leverage can increase the risk of liquidation.",
  maintenance:
    "The maintenance margin requirement is the amount of collateral that must be maintained in an account to support open positions. If the account value falls below the maintenance margin requirement, the account will be partially liquidated.",
  usage:
    "Margin usage refers to the portion of the position's equity used to maintain open positions. You won’t be able to open new positions if the margin usage reaches 100%.",
  ratio:
    "The cross margin ratio is the ratio of the maintenance margin requirement to the total value. The positions will be liquidated if the ratio reaches 100%.",
};

type Tone = "up" | "down";
interface Line {
  label: string;
  value: string;
  tip?: string;
  tone?: Tone;
  /** 0-100: draws a bar under the row */
  bar?: number;
}

export function AccountSummary({ markets }: { markets: MarketMeta[] }) {
  const { state, account } = useSession();
  const qc = useQueryClient();
  const pnl = useLivePnl();
  const stats = useMarketStats();

  const faucet = useMutation({
    mutationFn: api.faucet,
    onSuccess: () => {
      toast.success("Faucet requested", { description: "Test funds land in about 20 seconds." });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["account"] }), 20_000);
    },
    onError: (e: Error) => toast.error("Faucet declined", { description: e.message }),
  });

  const a = account?.account;
  const ready = state === "ready" && !!a;

  // Everything below derives from the account snapshot plus streamed marks.
  const collateral = Number(a?.collateral ?? 0);
  const equity = collateral + pnl;
  let exposure = 0;
  let initialMargin = 0;
  let maintenanceMargin = 0;
  for (const p of a?.positions ?? []) {
    const size = Math.abs(Number(p.position));
    if (!size) continue;
    const mark = Number(stats[p.market_id]?.mark_price);
    const value = Number.isFinite(mark) ? mark * size : Number(p.position_value);
    exposure += value;
    const imf = Number(p.initial_margin_fraction);
    if (imf > 0) initialMargin += (value * imf) / 100;
    const mmf = markets.find((m) => m.marketId === p.market_id)?.maintenanceImf;
    if (mmf) maintenanceMargin += (value * mmf) / 10_000;
  }
  const usage = equity > 0 ? (initialMargin / equity) * 100 : 0;
  const ratio = equity > 0 ? (maintenanceMargin / equity) * 100 : 0;

  const dash = "–";
  const rows: Line[] = [
    { label: "Trading Equity", value: ready ? usd(equity) : dash, tip: TIPS.equity },
    { label: "Available to Trade", value: ready ? usd(a.available_balance) : dash },
  ];
  const risk: Line[] = [
    { label: "Portfolio Margin", value: ready ? usd(initialMargin) : dash },
    {
      label: "Unrealized PnL",
      value: ready ? `${signed(pnl)} USDC` : dash,
      tip: TIPS.pnl,
      tone: ready ? (pnl > 0 ? "up" : pnl < 0 ? "down" : undefined) : undefined,
    },
    { label: "Cross Leverage", value: ready ? `${equity > 0 ? num(exposure / equity, 2) : "0.00"}x` : dash, tip: TIPS.leverage },
    { label: "Maintenance Margin", value: ready ? usd(maintenanceMargin) : dash, tip: TIPS.maintenance },
    { label: "Cross Margin Usage", value: ready ? `${num(usage, 2)}%` : dash, tip: TIPS.usage, bar: ready ? usage : undefined },
    { label: "Cross Margin Ratio", value: ready ? `${num(ratio, 2)}%` : dash, tip: TIPS.ratio, bar: ready ? ratio : undefined },
  ];

  return (
    <Panel className="h-full">
      <div className="min-h-0 flex-1 overflow-y-auto p-[7px] text-[12px]">
        <Group rows={rows} />
        <div className="my-2 border-t-[0.5px] border-line" />
        <Group rows={risk} />
        {ready && (
          <button
            onClick={() => faucet.mutate()}
            disabled={faucet.isPending}
            className="press hover-fg mt-3 text-[12px] text-muted underline decoration-line-strong underline-offset-4"
          >
            {faucet.isPending ? "Requesting…" : "Get test funds"}
          </button>
        )}
      </div>
    </Panel>
  );
}

function Group({ rows }: { rows: Line[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ label, value, tip, tone, bar }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            {tip ? <Tooltip text={tip} className="text-fg/80">{label}</Tooltip> : <span className="text-fg/80">{label}</span>}
            <span className={cn(tone === "up" && "text-up", tone === "down" && "text-down", value === "–" && "text-muted")}>
              {value}
            </span>
          </div>
          {bar !== undefined && (
            <div role="progressbar" aria-label={label} aria-valuenow={Math.min(100, Math.round(bar))} aria-valuemin={0} aria-valuemax={100} className="h-[3px] overflow-hidden rounded-full bg-white/10">
              <div
                className={cn("h-full rounded-full", bar >= 80 ? "bg-down" : "bg-fg/70")}
                style={{ width: `${Math.min(100, Math.max(0, bar))}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
