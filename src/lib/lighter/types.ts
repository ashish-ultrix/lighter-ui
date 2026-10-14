export interface MarketMeta {
  symbol: string;
  marketId: number;
  sizeDecimals: number;
  priceDecimals: number;
  minBase: number;
  minQuote: number;
  /** bps; 500 = 5% = 20x */
  defaultImf: number;
  /** bps; caps leverage at 10000 / minImf */
  minImf: number;
  /** bps; maintenance margin as a share of position value */
  maintenanceImf: number;
}

export interface MarketStats {
  symbol: string;
  market_id: number;
  index_price: string;
  mark_price: string;
  mid_price: string;
  best_ask_price: string;
  best_bid_price: string;
  last_trade_price: string;
  open_interest: string;
  current_funding_rate: string;
  funding_rate: string;
  daily_base_token_volume: number;
  daily_quote_token_volume: number;
  daily_price_low: number;
  daily_price_high: number;
  daily_price_change: number;
}

export interface Level {
  price: number;
  size: number;
}

export interface Trade {
  id: number;
  price: number;
  size: number;
  /** taker side: a maker on the ask means the taker bought */
  side: "buy" | "sell";
  ts: number;
}

export interface Candle {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const RESOLUTIONS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export type SocketStatus = "connecting" | "open" | "closed";

export interface AccountAsset {
  symbol: string;
  balance: string;
  locked_balance: string;
  /** "enabled" when the asset backs perp margin */
  margin_mode: string;
  margin_balance: string;
}
