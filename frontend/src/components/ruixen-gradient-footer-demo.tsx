"use client";

// Demo for RuixenGradientFooter. Adapted to this project's `x-*` Tailwind
// palette (the upstream demo used shadcn tokens this codebase doesn't define).

import { RuixenGradientFooter } from "@/components/ui/ruixen-gradient-footer";

const columns = [
  {
    title: "Product",
    links: ["Overview", "Features", "Integrations", "Pricing", "Changelog"],
  },
  {
    title: "Resources",
    links: ["Docs", "Guides", "API reference", "Support", "Status"],
  },
  { title: "Company", links: ["About", "Careers", "Blog", "Press", "Contact"] },
  { title: "Legal", links: ["Privacy", "Terms", "Security", "Cookies"] },
];

export default function DemoOne() {
  return (
    <div className="flex min-h-full flex-col bg-x-bg">
      {/* The reveal needs at least a band-height of scroll above the footer,
          otherwise the glow starts out already half-risen. */}
      <div className="flex h-[55vh] shrink-0 items-center justify-center px-6 text-center font-mono text-xs uppercase tracking-wider text-x-secondary">
        Scroll down to the footer ↓
      </div>

      <RuixenGradientFooter gradientHeight="40vh">
        <div className="mx-auto w-full max-w-5xl px-6 pt-12">
          <div className="grid gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 text-x-primary">
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                  <path d="M12 2 22 12 12 22 2 12Z" fill="currentColor" />
                  <path d="M12 8 16 12 12 16 8 12Z" className="fill-x-bg" />
                </svg>
                <span className="font-mono text-sm uppercase tracking-widest">
                  Lumen Studio
                </span>
              </div>
              <p className="mt-4 max-w-xs text-sm text-x-secondary">
                Design tooling for teams who ship on Fridays. Built for the
                browser, offline by default.
              </p>

              <div className="mt-6 flex max-w-xs gap-2">
                <input
                  type="email"
                  aria-label="Email address"
                  placeholder="you@company.com"
                  className="h-9 w-full rounded-md border border-x-border bg-transparent px-3 text-sm text-x-primary placeholder:text-x-secondary focus:border-x-primary/40 focus:outline-none"
                />
                <button
                  type="button"
                  className="h-9 shrink-0 rounded-md bg-x-primary px-3 font-mono text-xs uppercase tracking-wider text-x-bg transition-opacity hover:opacity-90"
                >
                  Join
                </button>
              </div>
            </div>

            <nav className="grid grid-cols-2 gap-10 font-mono text-xs uppercase tracking-wider sm:grid-cols-4 lg:col-span-4">
              {columns.map((col) => (
                <div key={col.title}>
                  <h3 className="text-x-primary">{col.title}</h3>
                  <ul className="mt-4 flex flex-col gap-3">
                    {col.links.map((link) => (
                      <li key={link}>
                        <a
                          href="#"
                          className="text-x-secondary transition-colors hover:text-x-primary"
                        >
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-x-border/60 pt-6 pb-2 font-mono text-xs uppercase tracking-wider text-x-secondary sm:flex-row">
            <span>© 2026 Lumen Studio</span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-x-repost" />
              All systems normal
            </span>
            <span>Amsterdam · Remote</span>
          </div>
        </div>
      </RuixenGradientFooter>
    </div>
  );
}
