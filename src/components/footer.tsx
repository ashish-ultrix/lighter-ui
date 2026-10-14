"use client";

import { cn } from "@/lib/cn";
import { useSocketStatus } from "@/lib/lighter/hooks";
import { useSession } from "@/lib/session";
import { Glyph } from "./ui";

const label = "font-mono text-[11px] font-medium uppercase leading-3 tracking-[0.4px]";

/** Status strip. Both indicators reflect live state: the price socket and the session. */
export function Footer() {
  const status = useSocketStatus();
  const { state } = useSession();
  const online = status === "open";
  const connected = state === "ready" || state === "needs_onboarding";

  return (
    <footer className="flex h-[25px] shrink-0 items-center gap-2.5 border-t-[0.5px] border-line bg-white/[0.05] px-2.5 backdrop-blur-md">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Status on={online} text={online ? "Online / Testnet" : status === "connecting" ? "Connecting / Testnet" : "Reconnecting / Testnet"} />
        <Status on={connected} text={connected ? "Wallet connected" : "Wallet not connected"} className="hidden sm:flex" />
      </div>
    </footer>
  );
}

function Status({ on, text, className }: { on: boolean; text: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-[3.5px] whitespace-nowrap", on ? "text-[#1bd289]" : "text-down", className)}>
      {on ? <Glyph name="dot" className="h-[7px] w-[2px]" /> : <span aria-hidden className="h-[7px] w-[2px] rounded-[1px] bg-current pulse-dot" />}
      <span className={label}>{text}</span>
    </span>
  );
}
