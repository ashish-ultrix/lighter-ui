// Testnet only. The chain ID the backend signs with (300) must match this
// environment; it lives server-side, so only the URLs are configured here.
export const LIGHTER_REST = "https://testnet.zklighter.elliot.ai/api/v1";
export const LIGHTER_WS = "wss://testnet.zklighter.elliot.ai/stream";

// Lighter's own block explorer for testnet: /blocks/<height> and /logs/<tx_hash>.
export const EXPLORER = "https://testnet.app.lighter.xyz/explorer";

// The exchange-aggregator's lighter-testnet server (cmd/lighter-testnet).
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8089/exchange-aggregator/api/v1/lighter";
