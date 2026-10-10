// Adapter for the external Playwright browser service (see /browser-service).
//
// Supabase Edge Functions run in a Deno Deploy isolate with no OS-level
// access, so a real browser binary (Playwright/Chromium) can never run
// in-process here. This module calls out, over HTTP, to a small Node
// service that *does* run a real browser, visits the target page, and
// reports back console errors, failed requests, accessibility violations,
// broken links and a screenshot — things a plain `fetch` + HTML parse can
// never see (no JS execution).
//
// The service is optional: when BROWSER_SERVICE_URL isn't configured, every
// helper here is a no-op and run-scan keeps working exactly as before with
// its fetch-based crawler.
import type { ScanIssue } from './types.ts';

export interface BrowserScanResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  html: string;
  title: string | null;
  links: string[];
  loadTimeMs: number;
  timing: {
    domContentLoadedMs: number | null;
    loadEventMs: number | null;
    firstContentfulPaintMs: number | null;
    largestContentfulPaintMs: number | null;
    transferSizeBytes: number | null;
  };
  consoleErrors: Array<{ type: string; text: string }>;
  failedRequests: Array<{ url: string; method: string; status: number | null; errorText: string | null; resourceType: string }>;
  a11yViolations: Array<{
    id: string;
    impact: string | null;
    description: string;
    help: string;
    helpUrl: string;
    nodeCount: number;
    targets: string[];
  }>;
  brokenLinks: Array<{ url: string; status: number | null; error: string | null }>;
  screenshotBase64: string | null;
}

export interface BrowserServiceConfig {
  baseUrl: string;
  secret?: string;
}

export function getBrowserServiceConfig(): BrowserServiceConfig | null {
  const baseUrl = process.env.BROWSER_SERVICE_URL;
  if (!baseUrl) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), secret: process.env.BROWSER_SERVICE_SECRET ?? undefined };
}

export function isBrowserServiceEnabled(): boolean {
  return getBrowserServiceConfig() !== null;
}

export interface BrowserScanOptions {
  timeoutMs?: number;
  checkBrokenLinks?: boolean;
  maxLinksToCheck?: number;
  captureScreenshot?: boolean;
  runAccessibility?: boolean;
}

/**
 * Visits `url` in a real headless browser via the external browser service.
 * Returns null (never throws) when the service is disabled, unreachable, or
 * errors — callers should treat this as "enrichment unavailable" and keep
 * going with the regular fetch-based crawl results.
 */
export async function scanWithBrowserService(
  url: string,
  options: BrowserScanOptions = {},
): Promise<BrowserScanResult | null> {
  const config = getBrowserServiceConfig();
  if (!config) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), (options.timeoutMs ?? 30000) + 5000);
    const response = await fetch(`${config.baseUrl}/scan-page`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.secret ? { 'x-service-secret': config.secret } : {}),
      },
      body: JSON.stringify({ url, ...options }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Browser service returned', response.status, await response.text().catch(() => ''));
      return null;
    }
    const data = (await response.json()) as any;
    if (!data.success) return null;
    return data.result as BrowserScanResult;
  } catch (error) {
    console.error('Browser service call failed:', error);
    return null;
  }
}

/**
 * Turns what the browser saw (JS console errors, broken links found by
 * actually clicking through the rendered DOM, accessibility violations,
 * failed sub-resource requests) into regular ScanIssue rows.
 */
export function browserResultToIssues(result: BrowserScanResult, scanId: string): ScanIssue[] {
  const issues: ScanIssue[] = [];

  const jsErrors = result.consoleErrors.filter((c) => c.type === 'error');
  if (jsErrors.length > 0) {
    issues.push({
      scan_id: scanId,
      category: 'performance',
      severity: jsErrors.length > 5 ? 'high' : 'medium',
      title: `${jsErrors.length} erreur(s) JavaScript détectée(s)`,
      description: `Des erreurs JavaScript surviennent dans la console du navigateur lors du chargement de la page, ce qui peut casser des fonctionnalités ou dégrader l'expérience utilisateur.\n\nExemples :\n${jsErrors.slice(0, 5).map((e) => `- ${e.text}`).join('\n')}`,
      page_url: result.url,
      recommendation: 'Ouvrir la console développeur sur cette page et corriger les erreurs JavaScript listées, en commençant par celles qui bloquent le rendu ou les interactions.',
    });
  }

  const failedSubResources = result.failedRequests.filter((r) => r.resourceType !== 'document');
  if (failedSubResources.length > 0) {
    issues.push({
      scan_id: scanId,
      category: 'performance',
      severity: failedSubResources.length > 5 ? 'high' : 'medium',
      title: `${failedSubResources.length} ressource(s) en échec de chargement`,
      description: `Des scripts, styles, images ou appels réseau échouent lors du chargement de la page (statut HTTP ou erreur réseau).\n\nExemples :\n${failedSubResources.slice(0, 5).map((r) => `- [${r.resourceType}] ${r.url} — ${r.status ?? r.errorText}`).join('\n')}`,
      page_url: result.url,
      recommendation: 'Vérifier que toutes les ressources référencées existent et sont accessibles publiquement (pas bloquées par CORS, un firewall ou une erreur 404).',
    });
  }

  if (result.brokenLinks.length > 0) {
    issues.push({
      scan_id: scanId,
      category: 'broken_links',
      severity: result.brokenLinks.length > 5 ? 'high' : 'medium',
      title: `${result.brokenLinks.length} lien(s) cassé(s) trouvé(s) (navigateur réel)`,
      description: `En visitant la page avec un navigateur réel et en testant tous les liens rendus (y compris ceux générés par JavaScript), ${result.brokenLinks.length} lien(s) renvoient une erreur.\n\n${result.brokenLinks.slice(0, 10).map((l) => `- ${l.url} — ${l.error}`).join('\n')}`,
      page_url: result.url,
      recommendation: 'Corriger ou retirer les liens cassés listés ci-dessus.',
    });
  }

  for (const violation of result.a11yViolations) {
    const severity: ScanIssue['severity'] =
      violation.impact === 'critical' ? 'critical' :
      violation.impact === 'serious' ? 'high' :
      violation.impact === 'moderate' ? 'medium' : 'low';

    issues.push({
      scan_id: scanId,
      category: 'accessibility',
      severity,
      title: violation.help,
      description: `${violation.description}\n\nÉléments concernés (${violation.nodeCount}) :\n${violation.targets.map((t) => `- ${t}`).join('\n')}`,
      page_url: result.url,
      recommendation: `Voir la documentation axe-core : ${violation.helpUrl}`,
    });
  }

  return issues;
}
