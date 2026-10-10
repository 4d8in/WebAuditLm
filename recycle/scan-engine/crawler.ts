// Autonomous crawler for the scan engine.
//
// Extracted verbatim from supabase/functions/run-scan/index.ts (Partie A.1).
// Behavior is intentionally identical — this module is a mechanical move so
// the orchestrator can shrink without any observable change.
//
// ⚠ KNOWN LIMITATION (already flagged in previous reports, NOT fixed here):
// `requestCache`, `rateLimiter` and `connectionPool` are module-level `Map`s /
// counters. In a Deno Deploy / edge serverless runtime, each isolate keeps its
// own copy and isolates are recycled at will — so the cache/rate-limit is NOT
// reliable across invocations, and enforcement is best-effort within a single
// scan run. Fixing this requires an external store (KV / Redis) and is out of
// scope for the A.1 extraction.

import type { CrawlResult, RobotsTxtRules } from './types.ts';
import { parseRobotsTxt, isUrlAllowed } from './robots.ts';
import { parseSitemapXml } from './sitemap.ts';

// ────────────────────────────────────────────────────────────────────────────
// In-memory caches (per isolate — see LIMITATION above)
// ────────────────────────────────────────────────────────────────────────────

export const requestCache = {
  robotsTxt: new Map<string, { rules: RobotsTxtRules | null; timestamp: number }>(),
  sitemap: new Map<string, { urls: string[]; timestamp: number }>(),
  pageContent: new Map<string, { data: CrawlResult | null; timestamp: number }>(),
  duplicateContent: new Map<string, { hash: string; url: string }>(),
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL;
}

// Rate limiting per domain
const rateLimiter = new Map<string, { requests: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 10; // Max requests per window
const RATE_LIMIT_WINDOW = 60000; // 1 minute window

// Connection pool simulation (for optimization)
const connectionPool = {
  active: 0,
  max: 10,
  queue: [] as Array<() => void>,
};

// ────────────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────────────

export function isNonHtmlFile(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const nonHtmlPatterns = [
      /\.xml$/i, /\.txt$/i, /\.json$/i, /\.pdf$/i, /\.zip$/i, /\.css$/i, /\.js$/i,
      /\.jpg$/i, /\.jpeg$/i, /\.png$/i, /\.gif$/i, /\.svg$/i, /\.webp$/i,
      /\.woff$/i, /\.woff2$/i, /\.ttf$/i, /\.eot$/i,
      /sitemap\.xml$/i, /robots\.txt$/i, /feed\.xml$/i, /rss\.xml$/i, /atom\.xml$/i,
    ];
    for (const pattern of nonHtmlPatterns) {
      if (pattern.test(pathname)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function detectJavaScriptHeavy(html: string): boolean {
  const scriptCount = (html.match(/<script[^>]*>/gi) || []).length;
  const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .trim();
  const textLength = textContent.length;
  const hasFramework = /react|vue|angular|svelte/i.test(html);
  const hasRootDiv = /<div[^>]*id=["'](root|app|main)["'][^>]*>/i.test(html);
  const hasNoContent = textLength < 500 && scriptCount > 3;
  return hasFramework || (hasRootDiv && hasNoContent) || (scriptCount > 5 && textLength < 1000);
}

export async function checkRateLimit(domain: string): Promise<boolean> {
  const now = Date.now();
  const limit = rateLimiter.get(domain);
  if (!limit || now > limit.resetTime) {
    rateLimiter.set(domain, { requests: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (limit.requests >= RATE_LIMIT_REQUESTS) {
    const waitTime = limit.resetTime - now;
    if (waitTime > 0) {
      console.log(`Rate limit reached for ${domain}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      rateLimiter.set(domain, { requests: 1, resetTime: Date.now() + RATE_LIMIT_WINDOW });
      return true;
    }
  }
  limit.requests++;
  return true;
}

export function detectCDN(headers: Record<string, string>, html: string): string[] {
  const cdns: string[] = [];
  const server = headers['server'] || '';
  if (server.includes('cloudflare')) cdns.push('Cloudflare');
  if (server.includes('cloudfront')) cdns.push('AWS CloudFront');
  if (server.includes('fastly')) cdns.push('Fastly');
  if (headers['cf-ray']) cdns.push('Cloudflare');
  if (headers['x-amz-cf-id']) cdns.push('AWS CloudFront');
  const cdnPatterns = [
    /cdn\.jsdelivr\.net/i, /cdnjs\.cloudflare\.com/i, /unpkg\.com/i,
    /ajax\.googleapis\.com/i, /maxcdn\.bootstrapcdn\.com/i,
  ];
  for (const pattern of cdnPatterns) {
    if (pattern.test(html)) {
      const match = html.match(pattern);
      if (match && !cdns.includes('External CDN')) cdns.push('External CDN');
    }
  }
  return [...new Set(cdns)];
}

export function detectDuplicateContent(html: string, url: string): { isDuplicate: boolean; originalUrl?: string } {
  const mainContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1000);
  const hash = mainContent.length.toString() + '_' + mainContent.substring(0, 50).replace(/\s/g, '');
  for (const [cachedUrl, cachedData] of requestCache.duplicateContent.entries()) {
    if (cachedData.hash === hash && cachedUrl !== url) {
      return { isDuplicate: true, originalUrl: cachedUrl };
    }
  }
  requestCache.duplicateContent.set(url, { hash, url });
  return { isDuplicate: false };
}

export async function fetchWithPool(url: string, options: RequestInit = {}): Promise<Response> {
  if (connectionPool.active >= connectionPool.max) {
    await new Promise<void>(resolve => { connectionPool.queue.push(resolve); });
  }
  connectionPool.active++;
  try {
    return await fetch(url, options);
  } finally {
    connectionPool.active--;
    const next = connectionPool.queue.shift();
    if (next) next();
  }
}

export function checkCompression(headers: Record<string, string>): { supported: boolean; type?: string } {
  const acceptEncoding = headers['accept-encoding'] || '';
  const contentEncoding = headers['content-encoding'] || '';
  if (contentEncoding) return { supported: true, type: contentEncoding };
  if (acceptEncoding.includes('br')) return { supported: true, type: 'br' };
  if (acceptEncoding.includes('gzip')) return { supported: true, type: 'gzip' };
  return { supported: false };
}

export function extractLinks(html: string, baseUrl: string, includeSubdomains: boolean): string[] {
  const links: string[] = [];
  const baseUrlObj = new URL(baseUrl);
  const baseHostname = baseUrlObj.hostname;
  const hrefRegex = /href=["']([^"']+)["']/gi;
  const matches = html.matchAll(hrefRegex);
  for (const match of matches) {
    const href = match[1];
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    try {
      let absoluteUrl: URL;
      if (href.startsWith('http://') || href.startsWith('https://')) absoluteUrl = new URL(href);
      else if (href.startsWith('//')) absoluteUrl = new URL(`${baseUrlObj.protocol}${href}`);
      else absoluteUrl = new URL(href, baseUrl);
      if (includeSubdomains) {
        if (absoluteUrl.hostname === baseHostname || absoluteUrl.hostname.endsWith(`.${baseHostname}`)) {
          links.push(absoluteUrl.href);
        }
      } else if (absoluteUrl.hostname === baseHostname) {
        links.push(absoluteUrl.href);
      }
    } catch {
      continue;
    }
  }
  return [...new Set(links.map(url => {
    try { const u = new URL(url); u.hash = ''; return u.href; } catch { return url; }
  }))];
}

export function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch) return ogTitleMatch[1].trim();
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// robots.txt / sitemap fetchers (with cache)
// ────────────────────────────────────────────────────────────────────────────

export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsTxtRules | null> {
  const cacheKey = new URL(baseUrl).origin;
  const cached = requestCache.robotsTxt.get(cacheKey);
  if (cached && isCacheValid(cached.timestamp)) return cached.rules;
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'SiteAnalyzer/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      requestCache.robotsTxt.set(cacheKey, { rules: null, timestamp: Date.now() });
      return null;
    }
    const robotsText = await response.text();
    const rules = parseRobotsTxt(robotsText);
    requestCache.robotsTxt.set(cacheKey, { rules, timestamp: Date.now() });
    return rules;
  } catch (error) {
    console.error('Error fetching robots.txt:', error);
    requestCache.robotsTxt.set(cacheKey, { rules: null, timestamp: Date.now() });
    return null;
  }
}

export async function fetchSitemap(baseUrl: string): Promise<string[]> {
  const cacheKey = new URL(baseUrl).origin;
  const cached = requestCache.sitemap.get(cacheKey);
  if (cached && isCacheValid(cached.timestamp)) return cached.urls;
  const urls: string[] = [];
  const sitemapPaths = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'];
  for (const path of sitemapPaths) {
    try {
      const sitemapUrl = new URL(path, baseUrl).href;
      const response = await fetch(sitemapUrl, {
        headers: { 'User-Agent': 'SiteAnalyzer/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const xml = await response.text();
        const extractedUrls = parseSitemapXml(xml, baseUrl);
        urls.push(...extractedUrls);
        if (urls.length > 0) {
          requestCache.sitemap.set(cacheKey, { urls, timestamp: Date.now() });
          return urls;
        }
      }
    } catch {
      continue;
    }
  }
  requestCache.sitemap.set(cacheKey, { urls, timestamp: Date.now() });
  return urls;
}

// ────────────────────────────────────────────────────────────────────────────
// Page crawling
// ────────────────────────────────────────────────────────────────────────────

export interface CrawlPageOptions {
  timeout?: number;
  useCache?: boolean;
  skipJSDetection?: boolean;
}

/** Public API: fetch a single page with cache, rate limit, pool, CDN/compression/JS detection. */
export async function crawlPage(url: string, options: CrawlPageOptions = {}): Promise<CrawlResult | null> {
  if (options.useCache !== false) {
    const cached = requestCache.pageContent.get(url);
    if (cached && isCacheValid(cached.timestamp)) return cached.data;
  }
  try {
    const domain = new URL(url).hostname;
    await checkRateLimit(domain);
  } catch { /* continue */ }

  const startTime = Date.now();
  const timeout = options.timeout || 10000;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetchWithPool(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SiteAnalyzer/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const html = await response.text();
    const loadTimeMs = Date.now() - startTime;

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });

    const compression = checkCompression(headers);
    if (compression.supported) console.log(`Page ${url} uses ${compression.type} compression`);

    const cdns = detectCDN(headers, html);
    if (cdns.length > 0) console.log(`CDN detected for ${url}: ${cdns.join(', ')}`);

    const isJSHeavy = !options.skipJSDetection && detectJavaScriptHeavy(html);
    if (isJSHeavy) console.log(`JavaScript-heavy page detected: ${url} - may need Firecrawl for full content`);

    const duplicateCheck = detectDuplicateContent(html, url);
    if (duplicateCheck.isDuplicate) console.log(`Duplicate content detected: ${url} (similar to ${duplicateCheck.originalUrl})`);

    const links = extractLinks(html, url, false);
    const title = extractTitle(html);

    const result: CrawlResult = {
      url: response.url,
      html,
      title,
      statusCode: response.status,
      headers,
      links,
      loadTimeMs,
    };
    if (options.useCache !== false) {
      requestCache.pageContent.set(url, { data: result, timestamp: Date.now() });
    }
    return result;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    if (options.useCache !== false) {
      requestCache.pageContent.set(url, { data: null, timestamp: Date.now() });
    }
    return null;
  }
}

/** Backwards-compat alias used by the current orchestrator. */
export const fetchPageAutonomous = crawlPage;

export async function mapSite(startUrl: string, maxPages: number, includeSubdomains: boolean): Promise<string[]> {
  const baseUrlObj = new URL(startUrl);
  const baseHostname = baseUrlObj.hostname;

  console.log('Checking for sitemap.xml...');
  const sitemapUrls = await fetchSitemap(startUrl);

  const discoveredUrls = new Set<string>([startUrl]);
  const toVisit: string[] = [];

  if (sitemapUrls.length > 0) {
    console.log(`Found ${sitemapUrls.length} URLs in sitemap`);
    for (const sitemapUrl of sitemapUrls.slice(0, maxPages)) {
      try {
        if (isNonHtmlFile(sitemapUrl)) {
          console.log(`Skipping non-HTML file from sitemap: ${sitemapUrl}`);
          continue;
        }
        const urlObj = new URL(sitemapUrl);
        const sameHost = includeSubdomains
          ? (urlObj.hostname === baseHostname || urlObj.hostname.endsWith(`.${baseHostname}`))
          : (urlObj.hostname === baseHostname);
        if (sameHost) {
          discoveredUrls.add(sitemapUrl);
          toVisit.push(sitemapUrl);
        }
      } catch {
        continue;
      }
    }
  }

  if (toVisit.length === 0) toVisit.push(startUrl);

  console.log('Checking robots.txt...');
  const robotsRules = await fetchRobotsTxt(startUrl);
  const crawlDelay = robotsRules?.crawlDelay || 0;

  const visited = new Set<string>();

  while (toVisit.length > 0 && discoveredUrls.size < maxPages) {
    const currentUrl = toVisit.shift()!;
    if (visited.has(currentUrl)) continue;
    if (!isUrlAllowed(currentUrl, robotsRules)) {
      console.log(`Skipping ${currentUrl} (disallowed by robots.txt)`);
      continue;
    }
    visited.add(currentUrl);
    if (crawlDelay > 0 && visited.size > 1) {
      await new Promise(resolve => setTimeout(resolve, crawlDelay));
    }
    try {
      const page = await crawlPage(currentUrl, { useCache: true });
      if (!page) continue;
      const links = page.links.filter(link => {
        try {
          const linkUrl = new URL(link);
          if (includeSubdomains) {
            return linkUrl.hostname === baseHostname || linkUrl.hostname.endsWith(`.${baseHostname}`);
          }
          return linkUrl.hostname === baseHostname;
        } catch {
          return false;
        }
      });
      for (const link of links) {
        if (!isUrlAllowed(link, robotsRules)) continue;
        if (isNonHtmlFile(link)) {
          console.log(`Skipping non-HTML file: ${link}`);
          continue;
        }
        if (!visited.has(link) && !discoveredUrls.has(link)) {
          discoveredUrls.add(link);
          if (discoveredUrls.size < maxPages) toVisit.push(link);
        }
      }
    } catch (error) {
      console.error(`Error mapping ${currentUrl}:`, error);
      continue;
    }
  }

  return Array.from(discoveredUrls).slice(0, maxPages);
}

/** Backwards-compat alias used by the current orchestrator. */
export const mapSiteAutonomous = mapSite;

export async function crawlPages(
  urls: string[],
  batchSize: number = 2,
  onProgress?: (current: number, total: number, url: string) => Promise<void> | void,
): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];
  let currentBatchSize = batchSize;
  for (let i = 0; i < urls.length; i += currentBatchSize) {
    const batch = urls.slice(i, i + currentBatchSize);
    const domains = new Set(batch.map(url => { try { return new URL(url).hostname; } catch { return ''; } }));
    if (domains.size < batch.length * 0.5) {
      currentBatchSize = 1;
      console.log(`Reducing batch size to 1 (same domain)`);
    } else {
      currentBatchSize = batchSize;
    }
    for (let bi = 0; bi < batch.length; bi++) {
      const url = batch[bi];
      const idx = i + bi;
      try { await onProgress?.(idx + 1, urls.length, url); } catch { /* ignore */ }
      const r = await crawlPage(url, { useCache: true });
      if (r) results.push(r);
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    if (i + currentBatchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  return results;
}

/** Backwards-compat alias used by the current orchestrator. */
export const crawlPagesAutonomous = crawlPages;
