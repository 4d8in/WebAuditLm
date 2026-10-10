// Sitemap.xml discovery and parsing. Pure module.

export function parseSitemapXml(xml: string, baseUrl: string): string[] {
  const urls: string[] = [];

  // Sitemap index: return contained sitemap URLs (caller may recurse)
  if (/<sitemapindex[^>]*>/i.test(xml)) {
    for (const match of xml.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi)) {
      urls.push(match[1].trim());
    }
    return urls;
  }

  // Regular urlset
  for (const urlMatch of xml.matchAll(/<url[^>]*>([\s\S]*?)<\/url>/gi)) {
    const locMatch = urlMatch[1].match(/<loc[^>]*>([^<]+)<\/loc>/i);
    if (!locMatch) continue;
    try {
      urls.push(new URL(locMatch[1].trim(), baseUrl).href);
    } catch {
      /* skip malformed */
    }
  }
  return urls;
}

export async function fetchSitemap(baseUrl: string): Promise<string[]> {
  const paths = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'];
  for (const path of paths) {
    try {
      const response = await fetch(new URL(path, baseUrl).href, {
        headers: { 'User-Agent': 'SiteAnalyzer/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;
      const urls = parseSitemapXml(await response.text(), baseUrl);
      if (urls.length > 0) return urls;
    } catch {
      continue;
    }
  }
  return [];
}
