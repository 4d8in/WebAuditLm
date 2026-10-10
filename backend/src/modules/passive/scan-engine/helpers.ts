// Small helpers used by run-scan. Extracted so they can be unit-tested.
import type { ScanIssue, PageAnalysis } from './types.ts';

/**
 * Trim a description to a reasonable size while preserving meaning.
 * Never breaks mid-word; appends an ellipsis if truncated.
 */
export function optimizeDescription(text: string, maxLen = 200): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/**
 * Deduplicate issues by (category, severity, title, page_url).
 * Keeps the first occurrence. Stable ordering.
 */
export function deduplicateIssues(issues: ScanIssue[]): ScanIssue[] {
  const seen = new Set<string>();
  const out: ScanIssue[] = [];
  for (const i of issues) {
    const key = `${i.category}|${i.severity}|${i.title}|${i.page_url ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

/**
 * Detect if a page is a technical/error page that should not be indexed.
 * Returns a reason string so the caller can surface it in the issue.
 */
export function detectTechnicalPage(page: PageAnalysis): { isTechnical: boolean; reason?: string } {
  // Explicit error status
  if (page.statusCode >= 400) {
    return { isTechnical: true, reason: `HTTP ${page.statusCode}` };
  }

  const url = (page.url || '').toLowerCase();
  const title = (page.title || '').toLowerCase();

  // URL-based heuristics
  const technicalPathPatterns = [
    /\/(404|403|500|error|maintenance|coming-soon)(\/|$|\.html?)/,
    /\/(wp-admin|wp-login|admin|login|logout|signin|signout)(\/|$)/,
    /\/(api|graphql|rpc|_next|__|cdn-cgi)(\/|$)/,
    /\.(xml|json|txt|rss|atom|map)(\?|$)/,
  ];
  for (const re of technicalPathPatterns) {
    if (re.test(url)) return { isTechnical: true, reason: `URL technique (${re.source})` };
  }

  // Title-based heuristics
  const technicalTitlePatterns = [
    /^(404|403|500)\b/,
    /page not found/,
    /not found/,
    /access denied/,
    /forbidden/,
    /server error/,
    /under maintenance/,
    /coming soon/,
  ];
  for (const re of technicalTitlePatterns) {
    if (re.test(title)) return { isTechnical: true, reason: `Titre technique : "${page.title}"` };
  }

  // Content too thin AND no H1 AND no meta description → likely technical stub
  if ((page.wordCount ?? 0) < 50 && !page.hasH1 && !page.hasMetaDescription) {
    return { isTechnical: true, reason: 'Contenu quasi vide (stub)' };
  }

  // Explicit noindex meta
  if (page.robotsContent && /noindex/i.test(page.robotsContent)) {
    return { isTechnical: true, reason: 'meta robots noindex' };
  }

  return { isTechnical: false };
}
