"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { EXPLORER } from "@/lib/config";
import { num, shortAddr } from "@/lib/format";
import { fetchBlockCount } from "@/lib/lighter/rest";
import { useSession } from "@/lib/session";
import { Glyph, useDismiss } from "./ui";

const NAV = ["Trade", "Portfolio", "Public Pools", "Staking", "Referrals", "Leaderboard"] as const;

export function Header() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-2.5">
      <div className="flex min-w-0 items-center gap-[7px]">
        <Link href="/" className="press flex shrink-0 items-end gap-[5px]" aria-label="Lighter Testnet">
          <Glyph name="logo" className="h-5 w-[66px]" />
          <span className="hidden text-[11px] leading-[11px] text-fg/50 sm:block">Testnet</span>
        </Link>
        <span aria-hidden className="mx-1 hidden h-[17px] w-px bg-line md:block" />
        <nav className="no-scrollbar hidden min-w-0 items-center gap-[3.5px] overflow-x-auto md:flex">
          {NAV.map((label) => (
            <span
              key={label}
              aria-current={label === "Trade" ? "page" : undefined}
              className={cn(
                "flex h-7 shrink-0 items-center rounded px-[9px] text-[14px] leading-[14px]",
                label === "Trade"
                  ? "bg-white/[0.05] text-fg shadow-[0_0_0_0.5px_black,inset_0_0.4px_0_rgb(255_255_255/0.08)]"
                  : "text-fg/80",
              )}
            >
              {label}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-[5px]">
        <BlockPill />
        <AccountMenu />
        <MobileNav />
      </div>
    </header>
  );
}

function BlockPill() {
  const { data } = useQuery({
    queryKey: ["blocks"],
    queryFn: fetchBlockCount,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const cls =
    "relative flex h-7 items-center gap-[3.5px] overflow-hidden rounded-[3px] bg-white/[0.05] px-[7px] font-mono text-[11px] font-medium uppercase leading-3 tracking-[0.4px] shadow-[0_0_0_0.5px_black,inset_0_0.4px_0_rgb(255_255_255/0.08)]";
  const inner = (
    <>
      <span aria-hidden className="h-3.5 w-[3.5px] rounded-[1px] bg-accent" />
      <span className="hidden text-fg/80 sm:inline">Block</span>
      <span className="text-accent">{data ? num(data, 0) : "–"}</span>
    </>
  );
  // Until the height loads there is nothing to link to.
  if (!data) return <div className={cls}>{inner}</div>;
  return (
    <a
      href={`${EXPLORER}/blocks/${data}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open this block in the Lighter testnet explorer"
      className={cn(cls, "press hover-raise")}
    >
      {inner}
    </a>
  );
}

function AccountMenu() {
  const { state, account, logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const addr = account?.l1_address;
  const connected = state === "ready" || state === "needs_onboarding";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="press hover-raise flex h-7 items-center gap-2 rounded-[3px] border-[0.5px] border-line bg-white/[0.05] px-[7px] text-[12px]"
      >
        <Glyph name="window" className="h-[11px] w-[13px]" />
        <span className={cn("hidden sm:inline", !connected && "text-muted")}>
          {state === "loading" ? "Loading…" : addr ? shortAddr(addr) : connected ? "Account" : "Not connected"}
        </span>
        {connected && <span aria-hidden className="size-1.5 rounded-full bg-up" />}
      </button>
      {open && (
        <div
          role="menu"
          className="pop-in absolute right-0 top-9 z-30 w-60 rounded-lg border border-line-strong bg-raised p-3 shadow-2xl shadow-black/60"
          style={{ ["--origin" as string]: "top right" }}
        >
          {connected ? (
            <>
              <div className="text-[11px] text-muted">Testnet wallet (throwaway)</div>
              <div className="mt-0.5 break-all text-[12px]">{addr ?? "Not onboarded yet"}</div>
              {account && <div className="mt-2 text-[11px] text-muted">Account index {account.account_index}</div>}
              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="press hover-raise mt-3 h-8 w-full rounded-md border border-line text-[12px]"
              >
                Sign out
              </button>
            </>
          ) : (
            <div className="text-[12px] text-muted">Connect from the trade panel to start trading.</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Phones hide the inline nav; this opens the same links as a dropdown. */
function MobileNav() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative md:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className="press hover-raise grid size-7 place-items-center rounded-[3px] border-[0.5px] border-line bg-white/[0.05]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <nav
          className="pop-in absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-lg border border-line-strong bg-raised py-1 shadow-2xl shadow-black/60"
          style={{ ["--origin" as string]: "top right" }}
        >
          {NAV.map((label) => (
            <span
              key={label}
              aria-current={label === "Trade" ? "page" : undefined}
              className={cn("block px-3 py-2 text-[14px]", label === "Trade" ? "text-fg" : "text-fg/70")}
            >
              {label}
            </span>
          ))}
        </nav>
      )}
    </div>
  );
}
