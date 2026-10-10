// robots.txt fetching and parsing.
// Pure module — no DB, no env. Caller owns caching.
import type { RobotsTxtRules } from './types.ts';

export function parseRobotsTxt(robotsText: string): RobotsTxtRules {
  const rules: RobotsTxtRules = { allowed: [], disallowed: [] };
  let currentUserAgent = '*';
  let inRelevantSection = false;

  for (const line of robotsText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [directive, ...valueParts] = trimmed.split(':').map((s) => s.trim());
    const value = valueParts.join(':').trim();
    const dir = directive.toLowerCase();

    if (dir === 'user-agent') {
      currentUserAgent = value.toLowerCase();
      inRelevantSection = currentUserAgent === '*' || currentUserAgent === 'siteanalyzer';
    } else if (inRelevantSection) {
      if (dir === 'allow' && value) rules.allowed.push(value);
      else if (dir === 'disallow' && value) rules.disallowed.push(value);
      else if (dir === 'crawl-delay' && value) rules.crawlDelay = parseFloat(value) * 1000;
    }
  }

  return rules;
}

export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsTxtRules | null> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'SiteAnalyzer/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return parseRobotsTxt(await response.text());
  } catch (error) {
    console.error('Error fetching robots.txt:', error);
    return null;
  }
}

export function isUrlAllowed(url: string, rules: RobotsTxtRules | null): boolean {
  if (!rules) return true;
  const urlPath = new URL(url).pathname;

  for (const disallowed of rules.disallowed) {
    if (disallowed === '/') return false;
    if (urlPath.startsWith(disallowed)) {
      const hasMoreSpecificAllow = rules.allowed.some(
        (allowed) => allowed.startsWith(disallowed) && urlPath.startsWith(allowed) && allowed.length > disallowed.length,
      );
      if (!hasMoreSpecificAllow) return false;
    }
  }

  if (rules.allowed.length > 0) return rules.allowed.some((allowed) => urlPath.startsWith(allowed));
  return true;
}
