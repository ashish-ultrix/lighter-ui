"use client";

import { useCallback, useState } from "react";
import type { MarketMeta } from "@/lib/lighter/types";
import { AccountSummary } from "./account-summary";
import { BottomPanel } from "./bottom-panel";
import { Footer } from "./footer";
import { Header } from "./header";
import { MarketTicker } from "./market-bar";
import { OrderForm, type PriceHint, type Side } from "./order-form";
import { PriceChart } from "./price-chart";
import { Sheet } from "./ui";

interface MobileTerminalProps {
  markets: MarketMeta[];
  market: MarketMeta | undefined;
  onSelect: (symbol: string) => void;
}

const NO_HINT: PriceHint = { price: 0, n: 0 };

/** Phone layout: chart-first, with the order ticket in a bottom sheet behind Buy / Sell. */
export function MobileTerminal({ markets, market, onSelect }: MobileTerminalProps) {
  const [sheet, setSheet] = useState<{ open: boolean; side: Side; hint: PriceHint; key: number }>({
    open: false,
    side: "buy",
    hint: NO_HINT,
    key: 0,
  });

  const openSheet = useCallback(
    (side: Side, hint: PriceHint = NO_HINT) => setSheet((s) => ({ open: true, side, hint, key: s.key + 1 })),
    [],
  );
  const close = useCallback(() => setSheet((s) => ({ ...s, open: false })), []);
  // Tapping a book level jumps straight into a limit ticket at that price.
  const pick = useCallback((price: number) => openSheet("buy", { price, n: 1 }), [openSheet]);

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
      <Header />
      <main className="flex flex-col gap-1 px-1 pb-1">
        <div className="h-[520px]">
          <PriceChart mobile markets={markets} market={market} onSelect={onSelect} onPickPrice={pick} />
        </div>
        <div className="h-[320px]">
          <BottomPanel markets={markets} />
        </div>
        <div className="h-[260px]">
          <AccountSummary markets={markets} />
        </div>
      </main>
      <Footer />

      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2.5 border-t-[0.5px] border-line bg-bg/90 p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <button onClick={() => openSheet("buy")} className="press h-11 rounded-[3px] bg-up text-[15px] font-medium text-black">
          Buy / Long
        </button>
        <button onClick={() => openSheet("sell")} className="press h-11 rounded-[3px] bg-down text-[15px] font-medium text-black">
          Sell / Short
        </button>
      </div>

      <Sheet open={sheet.open} onClose={close} label="Order ticket">
        <div className="border-b-[0.5px] border-line">
          <MarketTicker markets={markets} market={market} onSelect={onSelect} />
        </div>
        <OrderForm key={sheet.key} bare market={market} hint={sheet.hint} initialSide={sheet.side} />
      </Sheet>
    </div>
  );
}
