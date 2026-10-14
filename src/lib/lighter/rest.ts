import { LIGHTER_REST } from "../config";
import type { AccountAsset, Candle, MarketMeta, Resolution } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${LIGHTER_REST}/${path}`);
  const body = await res.json();
  if (body.code !== 200) throw new Error(body.message ?? `lighter error ${body.code}`);
  return body;
}

/** Active perps only. Market ids are in the thousands on testnet: never hardcode. */
export async function fetchMarkets(): Promise<MarketMeta[]> {
  const body = await getJson("orderBookDetails");
  return (body.order_book_details as any[])
    .filter((m) => m.market_type === "perp" && m.status === "active")
    .map((m) => ({
      symbol: m.symbol,
      marketId: m.market_id,
      sizeDecimals: m.size_decimals,
      priceDecimals: m.price_decimals,
      minBase: Number(m.min_base_amount),
      minQuote: Number(m.min_quote_amount),
      defaultImf: m.default_initial_margin_fraction,
      minImf: m.min_initial_margin_fraction,
      maintenanceImf: m.maintenance_margin_fraction,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

const RES_MS: Record<Resolution, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export const resolutionSeconds = (r: Resolution) => RES_MS[r] / 1000;

export async function fetchCandles(marketId: number, resolution: Resolution, count = 300): Promise<Candle[]> {
  const end = Date.now();
  const start = end - RES_MS[resolution] * count;
  const body = await getJson(
    `candles?market_id=${marketId}&resolution=${resolution}&start_timestamp=${start}&end_timestamp=${end}&count_back=${count}`,
  );
  return (body.c as any[])
    .map((c) => ({ time: Math.floor(c.t / 1000), open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v }))
    .sort((a, b) => a.time - b.time)
    .slice(-count);
}

/** Chain height. `blocks` reports the running block count as `total`. */
export async function fetchBlockCount(): Promise<number> {
  const body = await getJson("blocks?limit=1");
  return Number(body.total);
}

/**
 * Token balances of an account. Lighter serves these publicly by account
 * index; the trading server's account view leaves them out.
 */
export async function fetchAssets(accountIndex: number): Promise<AccountAsset[]> {
  const body = await getJson(`account?by=index&value=${accountIndex}`);
  return (body.accounts?.[0]?.assets ?? []) as AccountAsset[];
}
