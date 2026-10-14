"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "@/lib/session";

/** Everything the trading panel shows until the user is signed in and funded. */
export function ConnectCard() {
  const { state, login, onboard, onboarding, error } = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await login(name.trim());
    } catch {
      // surfaced through session.error
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <div className="grid h-[30px] place-items-center text-[12px] text-muted">Loading account…</div>;
  }

  if (state === "needs_onboarding") {
    return (
      <div className="fade-in flex flex-col gap-2">
        <div>
          <h2 className="text-[13px] font-medium">Create your testnet account</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            We generate a throwaway wallet, fund it from Lighter’s faucet with 10,000 test USDC and register a
            trading key. This takes about 20 seconds.
          </p>
        </div>
        <button
          onClick={() => void onboard().catch(() => {})}
          disabled={onboarding}
          className="press h-[30px] rounded-[3px] bg-fg text-[13px] font-medium text-bg"
        >
          {onboarding ? "Creating account…" : "Create account"}
        </button>
        {onboarding && <p className="text-[12px] text-muted">Waiting for the faucet credit. Don’t close this tab.</p>}
        {error && <p className="text-[12px] text-down">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="fade-in flex flex-col gap-2">
      <div>
        <h2 className="text-[13px] font-medium">Trade on Lighter testnet</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Pick any username. It maps to one funded testnet account on this machine; no real funds are involved.
        </p>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32))}
        placeholder="username"
        autoComplete="off"
        spellCheck={false}
        className="h-[30px] rounded-[3px] border-[0.5px] border-line bg-white/[0.04] px-2.5 text-[12px] outline-none focus:border-fg/60"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="press h-[30px] rounded-[3px] bg-fg text-[13px] font-medium text-bg"
      >
        {busy ? "Connecting…" : "Connect"}
      </button>
      {error && <p className="text-[12px] text-down">{error}</p>}
    </form>
  );
}
