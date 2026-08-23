import { describe, it, expect } from "vitest";
import { parseFeedTitles } from "../services/newsGrounding";

describe("parseFeedTitles", () => {
  it("extracts RSS <item> titles and ignores the channel title", () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <title>Company Blog</title>
        <item><title>Instant payouts hit a new record</title></item>
        <item><title>Developer API v3 is live</title></item>
      </channel></rss>`;
    expect(parseFeedTitles(xml)).toEqual([
      "Instant payouts hit a new record",
      "Developer API v3 is live",
    ]);
  });

  it("extracts Atom <entry> titles", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Newsroom</title>
      <entry><title>UPI volume milestone</title></entry>
      <entry><title>Regional language soundbox</title></entry>
    </feed>`;
    expect(parseFeedTitles(xml)).toEqual([
      "UPI volume milestone",
      "Regional language soundbox",
    ]);
  });

  it("unwraps CDATA and decodes entities", () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[Founders & builders meetup]]></title></item>
      <item><title>Series A &amp; beyond: what&#39;s next</title></item>
    </channel></rss>`;
    expect(parseFeedTitles(xml)).toEqual([
      "Founders & builders meetup",
      "Series A & beyond: what's next",
    ]);
  });

  it("returns an empty array for empty or non-feed input", () => {
    expect(parseFeedTitles("")).toEqual([]);
    expect(parseFeedTitles("<html><body>not a feed</body></html>")).toEqual([]);
  });
});
