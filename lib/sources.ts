import { q } from "./db";

export type Source = {
  id: number;
  name: string;
  url: string;
  active: boolean;
  last_fetched_at: string | Date | null;
  last_item_count: number | null;
  last_error: string | null;
};

const GN = "&hl=en-IN&gl=IN&ceid=IN:en";

// Starter feeds, tested live on 12 Oct 2026. They are copied into the `sources`
// table the first time the app runs; after that the table is the source of truth,
// so you can add or switch off feeds in the database without a deploy.
// Dropped: VCCircle (404 on every address) and the ET "funding" feed (0 items).
const DEFAULT_SOURCES: { name: string; url: string }[] = [
  { name: "Inc42", url: "https://inc42.com/feed/" },
  { name: "Entrackr", url: "https://entrackr.com/rss" },
  { name: "YourStory", url: "https://yourstory.com/feed" },
  { name: "ET Startups", url: "https://economictimes.indiatimes.com/small-biz/startups/rssfeeds/11993034.cms" },
  { name: "ET Tech", url: "https://economictimes.indiatimes.com/tech/startups/rssfeeds/78570561.cms" },
  { name: "Google News: raises funding", url: `https://news.google.com/rss/search?q=startup+raises+funding+India+when:7d${GN}` },
  { name: "Google News: seed round", url: `https://news.google.com/rss/search?q=seed+round+India+when:7d${GN}` },
  { name: "Google News: Series A", url: `https://news.google.com/rss/search?q=Series+A+India+startup+when:7d${GN}` },
];

export async function ensureSources(): Promise<void> {
  const [{ n }] = await q<{ n: string }>("select count(*) as n from sources");
  if (Number(n) > 0) return;
  for (const s of DEFAULT_SOURCES) {
    await q("insert into sources (name, url) values ($1, $2) on conflict (url) do nothing", [s.name, s.url]);
  }
}
