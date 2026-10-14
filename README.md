# Lighter Testnet Terminal

A perps trading terminal for the **Lighter testnet**: live prices, order book, trades and candles stream straight
from Lighter's WebSocket; orders, leverage and account data go through the `exchange-aggregator` testnet server,
which signs transactions with Lighter's SDK.

Testnet only. The wallets are throwaway keys held by the backend; no real funds are involved.

## Run

```bash
# 1. backend (from ../exchange-aggregator)
JWT_SECRET=dev-secret PORT=8089 go run ./cmd/lighter-testnet

# 2. frontend
npm install
npm run dev          # http://localhost:3000
```

Pick any username, click **Connect**, then **Create account**. The backend generates a wallet, funds it from
Lighter's faucet (10,000 test USDC, ~20 s) and registers a trading key.

`NEXT_PUBLIC_API_URL` overrides the backend URL
(default `http://localhost:8089/exchange-aggregator/api/v1/lighter`).

## Layout

| Path | What lives there |
| --- | --- |
| `src/lib/lighter/socket.ts` | The one WebSocket: reconnect, keepalive, ref-counted channels. Interface is `subscribe(channel, handler)`. |
| `src/lib/lighter/book.ts` | Pure order-book reducer (snapshot + delta, nonce continuity check). |
| `src/lib/lighter/hooks.ts` | Shared channel stores (`useMarketStats`, `useOrderBook`, `useTrades`), one subscription per channel. |
| `src/lib/lighter/rest.ts` | Public Lighter REST: markets (decimals, minimums) and candles. |
| `src/lib/api.ts`, `session.tsx` | Typed client for the aggregator and the signed-out / needs-account / ready state machine. |
| `src/components/` | Header, chart, book, order form, leverage, positions and orders tables. |

## Notes

- Market IDs on testnet are in the thousands (ETH is 4095); nothing hardcodes them, everything resolves by symbol.
- Lighter acknowledges an unsubscribe with a payload-less frame on the same channel. The book reducer ignores
  anything that is not a snapshot or a delta.
- Not built yet: WebSocket order/fill confirmations (the tables poll every 3-5 s), withdrawals, isolated-margin
  top-ups, TP/SL. The narrow viewport layout has not been visually verified.

## Agent skills

`.agents/skills` holds `emil-design-eng` (UI polish: easing, press feedback, no animation on streaming data) and
`improve-codebase-architecture`, installed with `npx skills add`.
