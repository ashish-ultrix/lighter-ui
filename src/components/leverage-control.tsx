"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type Position } from "@/lib/api";
import type { MarketMeta } from "@/lib/lighter/types";

/**
 * Leverage is an account setting per market on Lighter, not part of an order.
 * The account reports it as initial margin fraction in percent ("5.00" = 20x);
 * with no position yet, the market default applies.
 */
export function currentLeverage(positions: Position[] | undefined, market: MarketMeta): number {
  const p = positions?.find((x) => x.market_id === market.marketId);
  const imfPct = p ? Number(p.initial_margin_fraction) : market.defaultImf / 100;
  return imfPct > 0 ? Math.round(100 / imfPct) : 1;
}

export function LeverageControl({ market, leverage }: { market: MarketMeta; leverage: number }) {
  const max = Math.floor(10000 / market.minImf);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(leverage);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = useMutation({
    mutationFn: () => api.setLeverage(market.symbol, draft, "cross"),
    onSuccess: (r) => {
      toast.success(`${market.symbol} leverage set to ${r.leverage}x`);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (e: Error) => toast.error("Couldn’t change leverage", { description: e.message }),
  });

  return (
    // No `relative` here: the popover anchors to the form row (see order-form), so
    // its 16rem width can't spill past the narrow panel and get clipped.
    <div ref={ref}>
      <button
        onClick={() => {
          setDraft(leverage);
          setOpen((o) => !o);
        }}
        className="press hover-raise h-[21px] rounded-[3px] border-[0.5px] border-line px-2 text-[12px]"
      >
        {leverage}x
      </button>
      {open && (
        <div
          className="pop-in absolute right-[7px] top-full z-30 mt-1 w-64 max-w-[calc(100%-14px)] rounded-lg border border-line-strong bg-raised p-4 shadow-2xl shadow-black/60"
          style={{ ["--origin" as string]: "top right" }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-muted">{market.symbol} leverage</span>
            <span className="text-[18px] font-semibold">{draft}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={max}
            value={draft}
            onChange={(e) => setDraft(Number(e.target.value))}
            className="mt-3 w-full"
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>1x</span>
            <span>{max}x</span>
          </div>
          <button
            onClick={() => apply.mutate()}
            disabled={apply.isPending || draft === leverage}
            className="press mt-3 h-9 w-full rounded-md bg-fg text-[13px] font-semibold text-bg"
          >
            {apply.isPending ? "Applying…" : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}
