import type { ResearchService } from "./types.js";

/** Strip a web page down to readable text. */
export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Browse + search. URL fetching always works; web search needs a Tavily key. */
export function makeResearchService(searchApiKey?: string): ResearchService {
  /** Fetch a URL and return its readable text (truncated). */
  async function fetchUrl(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HermesBot/1.0)" },
    });
    if (!res.ok) return `Couldn't load ${url} (HTTP ${res.status}).`;
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? extractText(titleMatch[1]) : "";
    const body = extractText(html).slice(0, 8000);
    return `Title: ${title}\n\n${body}`;
  }

  /** Search the web (Tavily). Returns a clear note if no key is configured. */
  async function search(query: string): Promise<string> {
    if (!searchApiKey) {
      return "Web search isn't set up yet (no search API key). I can still read specific URLs you give me.";
    }
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: searchApiKey, query, max_results: 5 }),
    });
    const data = (await res.json()) as { results?: Array<{ title: string; url: string; content: string }> };
    const results = data.results ?? [];
    if (!results.length) return `No results for "${query}".`;
    return results.map((r) => `${r.title} — ${r.url}\n${r.content}`).join("\n\n");
  }

  return { fetchUrl, search };
}
