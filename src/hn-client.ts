const FIREBASE_BASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA_SEARCH = "https://hn.algolia.com/api/v1/search";

// HN Firebase typical p99 ~2s; 8s leaves comfortable slack for slow links
// and still fails fast enough that an MCP client doesn't appear hung.
const REQUEST_TIMEOUT_MS = 8_000;

// HN Firebase has no documented rate limit and Algolia is generous
// (~10k req/hour per IP, undocumented). 10 in flight is polite and
// keeps the top-stories N+1 fetch under ~1s in practice.
const FAN_OUT_CONCURRENCY = 10;

export interface HnStory {
  id: number;
  type: string;
  by?: string;
  time?: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;
  deleted?: boolean;
  dead?: boolean;
}

export interface HnSearchHit {
  id: number;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function concurrentMap<T, U>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array<U>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const item = items[idx];
      if (item === undefined) return; // unreachable given the bounds check above
      results[idx] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function topStoryIds(): Promise<number[]> {
  return fetchJson<number[]>(`${FIREBASE_BASE}/topstories.json`);
}

export async function getItem(id: number): Promise<HnStory | null> {
  return fetchJson<HnStory | null>(`${FIREBASE_BASE}/item/${id}.json`);
}

export async function topStories(limit: number): Promise<HnStory[]> {
  const ids = await topStoryIds();
  // Over-fetch to absorb job posts and deleted/dead items. HN front
  // page often has 3-6 jobs at any time, so a small `limit + 5` buffer
  // can come up short for low limits.
  const slice = ids.slice(0, Math.min(limit * 2 + 10, 50));
  const items = await concurrentMap(slice, FAN_OUT_CONCURRENCY, getItem);
  const stories = items.filter(
    (it): it is HnStory => it !== null && it.type === "story" && !it.deleted && !it.dead,
  );
  return stories.slice(0, limit);
}

export async function search(query: string, limit: number): Promise<HnSearchHit[]> {
  const url = new URL(ALGOLIA_SEARCH);
  url.searchParams.set("query", query);
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", String(limit));

  interface AlgoliaHit {
    objectID: string;
    title: string | null;
    url: string | null;
    author: string;
    points: number | null;
    num_comments: number | null;
    created_at: string;
  }
  interface AlgoliaResponse {
    hits: AlgoliaHit[];
  }

  const res = await fetchJson<AlgoliaResponse>(url.toString());
  return res.hits.flatMap((h) => {
    const id = Number.parseInt(h.objectID, 10);
    if (!Number.isFinite(id)) return []; // Algolia contract is int-shaped; skip if malformed.
    return [
      {
        id,
        title: h.title ?? "(untitled)",
        url: h.url,
        author: h.author,
        points: h.points ?? 0,
        num_comments: h.num_comments ?? 0,
        created_at: h.created_at,
      },
    ];
  });
}

export function permalink(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

// Naive on purpose: HN posts use a small, stable subset of HTML
// (<p>, <i>, <a>, <pre>, <code>) and a handful of named entities.
// A full HTML parser would be overkill for a portfolio demo wrapper.
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .trim();
}
