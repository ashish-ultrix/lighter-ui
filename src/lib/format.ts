const cache = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number, compact = false) {
  const key = `${min}/${max}/${compact}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      ...(compact ? { notation: "compact" as const } : {}),
    });
    cache.set(key, f);
  }
  return f;
}

const finite = (v: number | string | undefined | null) => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) ? null : n;
};

export const num = (v: number | string | undefined | null, decimals = 2) => {
  const n = finite(v);
  return n === null ? "–" : nf(decimals, decimals).format(n);
};

export const compact = (v: number | string | undefined | null) => {
  const n = finite(v);
  return n === null ? "–" : nf(0, 2, true).format(n);
};

export const usd = (v: number | string | undefined | null, decimals = 2) => {
  const n = finite(v);
  return n === null ? "–" : `$${nf(decimals, decimals).format(n)}`;
};

export const signed = (v: number | string | undefined | null, decimals = 2) => {
  const n = finite(v);
  return n === null ? "–" : `${n > 0 ? "+" : ""}${nf(decimals, decimals).format(n)}`;
};

export const pct = (v: number | string | undefined | null, decimals = 2) => {
  const n = finite(v);
  return n === null ? "–" : `${n > 0 ? "+" : ""}${nf(decimals, decimals).format(n)}%`;
};

export const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour12: false });

export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** "-$0.52": sign first, then the dollar sign. */
export const signedUsd = (v: number | string | undefined | null, decimals = 2) => {
  const n = finite(v);
  if (n === null) return "–";
  const body = `$${nf(decimals, decimals).format(Math.abs(n))}`;
  return n < 0 && Number(Math.abs(n).toFixed(decimals)) !== 0 ? `-${body}` : body;
};

const two = (n: number) => String(n).padStart(2, "0");

/** "10/14/2026 09:05:59" in local time. */
export const dateTime = (ms: number) => {
  const d = new Date(ms);
  return `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};
