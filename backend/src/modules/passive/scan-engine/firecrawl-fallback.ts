// Firecrawl v1 fallback for map/scrape when autonomous crawler is insufficient.
// API key MUST be passed in — this module never reads Deno.env.

export async function firecrawlMap(
  url: string,
  limit: number,
  includeSubdomains: boolean,
  apiKey: string,
): Promise<string[] | null> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, limit, includeSubdomains }),
    });
    const data = (await response.json()) as any;
    return data.success && data.links ? data.links : null;
  } catch (error) {
    console.error('Firecrawl map error:', error);
    return null;
  }
}

export interface FirecrawlScrapeResult {
  html: string;
  markdown: string;
  links: string[];
  title: string | null;
  statusCode: number;
  headers: Record<string, string>;
}

export async function firecrawlScrape(url: string, apiKey: string): Promise<FirecrawlScrapeResult | null> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown', 'html', 'links'], onlyMainContent: false }),
    });
    const data = (await response.json()) as any;
    if (!data.success || !data.data) return null;
    return {
      html: data.data.html || '',
      markdown: data.data.markdown || '',
      links: data.data.links || [],
      title: data.data.metadata?.title || null,
      statusCode: data.data.metadata?.statusCode || 200,
      headers: data.data.metadata?.headers || {},
    };
  } catch (error) {
    console.error('Firecrawl scrape error:', error);
    return null;
  }
}
