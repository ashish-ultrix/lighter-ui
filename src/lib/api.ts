import { API_BASE } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public lighterCode?: number,
  ) {
    super(message);
  }
}

// ---- token storage: an external store so every component sees changes -------

const TOKEN_KEY = "lighter-ui.token";
const tokenListeners = new Set<() => void>();
let memoryToken: string | null = null;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken; // storage blocked (private mode): fall back to this tab only
  }
}

export const tokenStore = {
  get: readToken,
  set(token: string | null) {
    memoryToken = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {}
    tokenListeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    tokenListeners.add(l);
    return () => tokenListeners.delete(l);
  },
};

// ---- wire types (mirror internal/strategy/lighter in exchange-aggregator) ---

export interface Position {
  market_id: number;
  symbol: string;
  open_order_count: number;
  /** percent, "5.00" = 20x */
  initial_margin_fraction: string;
  /** 1 long, -1 short */
  sign: number;
  position: string;
  avg_entry_price: string;
  position_value: string;
  unrealized_pnl: string;
  realized_pnl: string;
  liquidation_price: string;
  /** 0 cross, 1 isolated */
  margin_mode: number;
  allocated_margin: string;
}

export interface Account {
  index: number;
  status: number;
  collateral: string;
  available_balance: string;
  total_order_count: number;
  pending_order_count: number;
  positions: Position[];
}

export interface AccountView {
  user_id: string;
  l1_address: string;
  account_index: number;
  account: Account;
}

export interface Order {
  order_index: number;
  client_order_index: number;
  market_index: number;
  initial_base_amount: string;
  remaining_base_amount: string;
  filled_base_amount: string;
  filled_quote_amount: string;
  price: string;
  is_ask: boolean;
  type: string;
  time_in_force: string;
  reduce_only: boolean;
  status: string;
  timestamp: number;
}

/** One order our server sent, as recorded in its database. Carries the tx hash Lighter's own order history lacks. */
export interface LedgerOrder {
  client_order_index: number;
  order_index?: number;
  symbol: string;
  tx_hash: string;
  tx_status: "executed" | "failed" | "pending";
  created_at: string;
}

/** A fill from our own store (synced from Lighter), from this account's point of view. */
export interface Fill {
  trade_id: number;
  market_id: number;
  symbol: string;
  side: "buy" | "sell";
  /** what it did to the position */
  action: "open_long" | "open_short" | "close_long" | "close_short";
  role: "taker" | "maker";
  /** "trade", or a liquidation / deleverage kind */
  type: string;
  price: string;
  size: string;
  usd_amount: string;
  /** only on fills that reduce a position */
  realized_pnl: string | null;
  /** our partner fee on this fill, when the order carried the tag */
  partner_fee: string | null;
  position_size_before: string;
  entry_quote_before: string;
  tx_hash: string;
  block_height: number;
  /** unix ms */
  timestamp: number;
}

/** One funding payment. `change` is USDC: negative means this account paid. */
export interface Funding {
  /** unix ms */
  timestamp: number;
  market_id: number;
  symbol: string;
  funding_id: number;
  change: string;
  rate: string;
  position_size: string;
  position_side: "long" | "short";
}

export interface OrderRequest {
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  size: string;
  price?: string;
  time_in_force?: "gtt" | "ioc" | "post_only";
  reduce_only?: boolean;
  slippage_bps?: number;
}

/** Our partner-attribution fee: Lighter credits it to us on each fill. */
export interface PartnerInfo {
  enabled: boolean;
  account_index?: number;
  taker_fee_bps: number;
  maker_fee_bps: number;
  approved: boolean;
  approved_until_ms?: number;
  /** order results only: was this order tagged with the partner fee */
  tagged?: boolean;
  note?: string;
}

export interface OrderResult {
  client_order_index: number;
  order_index?: number;
  tx_hash: string;
  tx_status: "executed" | "failed" | "pending";
  order?: Order;
  symbol: string;
  side: string;
  type: string;
  size: string;
  price: string;
  partner?: PartnerInfo;
}

export interface TxResult {
  tx_hash: string;
  tx_status: "executed" | "failed" | "pending";
}

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const token = tokenStore.get();
  if (auth && token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Can't reach the trading server. Is cmd/lighter-testnet running on :8089?", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.lighter_message ?? body.error ?? `request failed (${res.status})`, res.status, body.lighter_code);
  }
  return body as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  devLogin: (userId: string) =>
    call<{ token: string; user_id: string }>("/dev-login", post({ user_id: userId }), false),
  onboard: () => call<{ account_index: number; l1_address: string }>("/onboard", { method: "POST" }),
  account: () => call<AccountView>("/account"),
  openOrders: () => call<{ orders: Order[] }>("/orders").then((r) => r.orders),
  orderHistory: () => call<{ orders: Order[] }>("/orders/history?limit=50").then((r) => r.orders),
  ledger: () => call<{ orders: LedgerOrder[] | null }>("/orders/ledger").then((r) => r.orders ?? []),
  fills: () => call<{ fills: Fill[] }>("/fills?limit=100").then((r) => r.fills ?? []),
  funding: () => call<{ fundings: Funding[] }>("/funding?limit=100").then((r) => r.fundings ?? []),
  placeOrder: (req: OrderRequest) => call<OrderResult>("/orders", post(req)),
  cancelOrder: (orderIndex: number, symbol: string) =>
    call<TxResult>(`/orders/${orderIndex}?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" }),
  cancelAll: () => call<TxResult>("/orders/cancel-all", { method: "POST" }),
  setLeverage: (symbol: string, leverage: number, marginMode: "cross" | "isolated") =>
    call<TxResult & { leverage: number }>("/leverage", post({ symbol, leverage, margin_mode: marginMode })),
  partner: () => call<PartnerInfo>("/partner"),
  faucet: () => call<{ status: string }>("/faucet", { method: "POST" }),
};
