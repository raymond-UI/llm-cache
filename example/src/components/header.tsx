"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { api } from "../../convex/_generated/api";
import { ModeToggle } from "./mode-toggle";

const NAV_LINKS = [
  { href: "/", label: "Prompt" },
  { href: "/explorer", label: "Explorer" },
  { href: "/admin", label: "Admin" },
  { href: "/normalize", label: "Normalize" },
] as const;

function StatsBadge() {
  const stats = useQuery(api.llm.getStats);
  if (!stats) return null;

  return (
    <span className="text-xs text-muted-foreground">
      {stats.totalEntries} entries
      <span className="ml-1.5 text-[10px]">
        ({stats.totalHits} hits)
      </span>
    </span>
  );
}

export default function Header() {
  return (
    <div>
      <div className="flex flex-row items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            LLM Cache Playground
          </Link>
          <nav className="flex gap-3">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <StatsBadge />
          <ModeToggle />
        </div>
      </div>
      <hr />
    </div>
  );
}
