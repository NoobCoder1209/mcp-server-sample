const FIREBASE_BASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA_SEARCH = "https://hn.algolia.com/api/v1/search";
const REQUEST_TIMEOUT_MS = 8_000;
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
      results[idx] = await fn(items[idx] as T);
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
  // Fetch a few extra to absorb job posts / deleted items, then filter.
  const slice = ids.slice(0, limit + 5);
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
  return res.hits.map((h) => ({
    id: Number.parseInt(h.objectID, 10),
    title: h.title ?? "(untitled)",
    url: h.url,
    author: h.author,
    points: h.points ?? 0,
    num_comments: h.num_comments ?? 0,
    created_at: h.created_at,
  }));
}

export function permalink(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

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
