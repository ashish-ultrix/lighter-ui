"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { fetchMarkets } from "@/lib/lighter/rest";
import { useMediaQuery } from "@/lib/use-media";
import { AccountSummary } from "./account-summary";
import { BookPanel } from "./book-panel";
import { BottomPanel } from "./bottom-panel";
import { Footer } from "./footer";
import { Header } from "./header";
import { MobileTerminal } from "./mobile-terminal";
import { OrderForm, type PriceHint } from "./order-form";
import { PriceChart } from "./price-chart";

export function Terminal() {
  const { data: markets = [], error } = useQuery({
    queryKey: ["markets"],
    queryFn: fetchMarkets,
    staleTime: 5 * 60_000,
  });
  const [symbol, setSymbol] = useState("BTC");
  const [hint, setHint] = useState<PriceHint>({ price: 0, n: 0 });

  const market = markets.find((m) => m.symbol === symbol) ?? markets[0];
  const wide = useMediaQuery("(min-width: 768px)");
  const pick = useCallback((price: number) => setHint((h) => ({ price, n: h.n + 1 })), []);

  // One layout is mounted at a time so charts and sockets aren't doubled.
  if (wide === null) return null;
  if (!wide) return <MobileTerminal markets={markets} market={market} onSelect={setSymbol} />;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <Header />
      {error && (
        <div className="mx-1 mb-1 rounded-md border border-line bg-down-soft px-4 py-2 text-[12px] text-down">
          Couldn’t load markets from Lighter testnet. Check your connection and refresh.
        </div>
      )}
      {/* Phones stack everything; tablets pair book/form and account/orders;
          desktops get the 3-column terminal with a full-width orders strip. */}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-1 px-1 pb-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_303px_304px] lg:grid-rows-[minmax(0,1fr)_minmax(232px,36%)]">
        <div className="h-[460px] min-w-0 md:col-span-2 lg:col-span-1 lg:h-auto">
          <PriceChart markets={markets} market={market} onSelect={setSymbol} />
        </div>
        <div className="h-[520px] min-w-0 lg:h-auto">
          <BookPanel market={market} onPickPrice={pick} />
        </div>
        <div className="min-w-0 md:h-[520px] lg:h-auto">
          <OrderForm market={market} hint={hint} />
        </div>
        <div className="h-[300px] min-w-0 md:h-[280px] lg:col-start-3 lg:h-auto">
          <AccountSummary markets={markets} />
        </div>
        <div className="h-[300px] min-w-0 md:col-span-1 md:h-[280px] lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:h-auto">
          <BottomPanel markets={markets} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
