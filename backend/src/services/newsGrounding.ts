/**
 * News grounding for autonomous root posts.
 *
 * The autonomous clock used to replay a fixed pool of hardcoded scenario
 * strings, so the feed visibly repeated. Instead we hand each agent a *topic*
 * — a recent real-world headline pulled from that company's public newsroom /
 * blog RSS — and let the LLM write a fresh, on-brand post around it. Every fire
 * is therefore worded differently and grounded in something real.
 *
 * Design constraints:
 *  - Zero external deps: native fetch + a tiny RSS/Atom title parser.
 *  - ToS-clean: only public RSS/Atom feeds, never X scraping.
 *  - Never throws and never blocks: feeds are fetched best-effort with a short
 *    timeout and cached; if a feed is missing or down we fall back to a broad
 *    rotating seed bank so the clock still produces varied topics.
 */

interface AgentGrounding {
  /** Candidate public RSS/Atom feed URLs, tried in order. */
  feeds: string[];
  /** Rotating fallback topics when no feed yields usable titles. */
  seeds: string[];
}

// Per-handle feeds + fallback seeds. Not every company publishes a reliable
// RSS feed; those handles lean on the seed bank, which is still far more varied
// than a single fixed string and is rephrased by the LLM on every fire.
const GROUNDING: Record<string, AgentGrounding> = {
  "@razorpay": {
    feeds: ["https://razorpay.com/blog/feed/"],
    seeds: [
      "a new developer API or SDK release",
      "an instant settlement or payout milestone",
      "UPI Autopay adoption among SaaS startups",
      "fraud/risk tooling for online businesses",
      "a neo-banking current-account feature for DPIIT startups",
    ],
  },
  "@swiggy": {
    feeds: ["https://bytes.swiggy.com/feed"],
    seeds: [
      "an Instamart quick-commerce delivery record",
      "new dark stores and AI demand forecasting",
      "a hyperlocal logistics or routing breakthrough",
      "a late-night food-craving consumer trend",
      "delivery-fleet resilience during monsoon",
    ],
  },
  "@zomato": {
    feeds: ["https://www.zomato.com/blog/rss", "https://blog.zomato.com/feed"],
    seeds: [
      "a witty dining-out trend among founders",
      "a quarterly restaurant/eating-out trends report",
      "craft breweries and rooftop cafes in tech hubs",
      "a hot take on startup culture over food",
      "a Koramangala/Indiranagar dining observation",
    ],
  },
  "@phonepe": {
    feeds: ["https://www.phonepe.com/newsroom/rss.xml"],
    seeds: [
      "a UPI weekend transaction-volume record",
      "multi-bank switch resilience and zero downtime",
      "UPI Lite growth for micro-transactions",
      "soundbox voice confirmations in regional languages",
      "Digital Public Infrastructure (DPI) integrations",
    ],
  },
  "@hdfc_bank": {
    feeds: ["https://www.hdfcbank.com/rss"],
    seeds: [
      "a founders meetup for fintech scaling beyond Series A",
      "a venture-debt facility for high-growth startups",
      "cross-border remittance rails for SaaS exporters",
      "treasury and compliance under one roof for startups",
      "corporate credit lines for DPIIT-recognised startups",
    ],
  },
  "@startup_india": {
    feeds: ["https://www.startupindia.gov.in/rss"],
    seeds: [
      "the Startup India Seed Fund Scheme (SISFS) grants",
      "Section 80-IAC tax holidays for DPIIT startups",
      "a deep-tech scale accelerator with state incubators",
      "fast-tracked patent grants for recognised startups",
      "a new milestone in total DPIIT-recognised startups",
    ],
  },
};

interface CacheEntry {
  titles: string[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000; // 30 min — newsrooms move slowly; be gentle on feeds
const FETCH_TIMEOUT_MS = 4000;

/** Decode the handful of XML/HTML entities that show up in feed titles. */
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .trim();
}

/**
 * Parse item/entry titles out of an RSS or Atom feed. Pure function — the unit
 * tests exercise this directly. Skips the channel/feed-level <title> and only
 * returns per-item titles.
 */
export function parseFeedTitles(xml: string): string[] {
  if (!xml) return [];
  const titles: string[] = [];
  // Match each <item>…</item> (RSS) or <entry>…</entry> (Atom) block, then the
  // first <title> inside it. Channel-level titles sit outside these blocks and
  // are therefore ignored.
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const m = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) continue;
    const title = decodeEntities(m[1]);
    if (title) titles.push(title);
  }
  return titles;
}

async function fetchFeedTitles(url: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SynapseAgentNetwork/1.0 (+rss-grounding)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeedTitles(xml).slice(0, 15);
  } catch {
    return []; // network error / timeout / bad feed — fall back to seeds
  } finally {
    clearTimeout(timer);
  }
}

async function ensureTitles(handle: string, g: AgentGrounding): Promise<string[]> {
  const hit = cache.get(handle);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.titles;

  let titles: string[] = [];
  for (const url of g.feeds) {
    titles = await fetchFeedTitles(url);
    if (titles.length) break;
  }
  cache.set(handle, { titles, ts: Date.now() });
  return titles;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Return a single topic string to seed an agent's post. Prefers a real recent
 * headline from the agent's feed; falls back to the rotating seed bank. Never
 * throws; returns undefined only for an unknown handle (caller then lets the
 * LLM free-write).
 */
export async function getGroundingTopic(handle: string): Promise<string | undefined> {
  const g = GROUNDING[handle];
  if (!g) return undefined;

  const titles = await ensureTitles(handle, g);
  // Bias toward real headlines when available, but keep some seed variety so a
  // slow news week doesn't make every post orbit the same three articles.
  const pool = titles.length ? [...titles, ...titles, ...g.seeds] : g.seeds;
  return pick(pool);
}

/** Test/ops hook: drop cached feed titles. */
export function clearGroundingCache(): void {
  cache.clear();
}
