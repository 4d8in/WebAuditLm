// Google PageSpeed Insights v5 client — Partie C integration.
// Uses GOOGLE_API_KEY (already configured) to fetch real Lighthouse metrics
// (LCP, CLS, INP, FCP, TBT, performance score) for a URL.
//
// Limits: PageSpeed Insights free quota is 25k queries/day and rate-limited
// to ~240 rpm per key. Never call from a tight loop — the scan engine calls
// once per scan for the main URL only.
import type { ScanIssue } from './types.ts';

export interface PageSpeedMetrics {
  performanceScore: number | null;    // 0..100 (Lighthouse "performance" category)
  lcpMs: number | null;               // Largest Contentful Paint (ms)
  clsScore: number | null;            // Cumulative Layout Shift (unitless)
  inpMs: number | null;               // Interaction to Next Paint (ms)
  fcpMs: number | null;               // First Contentful Paint (ms)
  tbtMs: number | null;               // Total Blocking Time (ms)
  ttfbMs: number | null;              // Time to First Byte (ms)
  fetchedAt: string;
  strategy: 'mobile' | 'desktop';
}

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/**
 * Fetch PageSpeed Insights metrics for a URL. Returns null on any failure
 * (API key missing, quota exceeded, timeout, invalid URL). Never throws —
 * PageSpeed is an *augmentation* layer, not a hard dependency.
 */
export async function fetchPageSpeedInsights(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
  timeoutMs = 45_000,
): Promise<PageSpeedMetrics | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[pagespeed] GOOGLE_API_KEY not set — skipping PSI');
    return null;
  }

  const params = new URLSearchParams({
    url,
    key: apiKey,
    strategy,
    category: 'performance',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${PSI_URL}?${params.toString()}`, { signal: controller.signal });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.warn(`[pagespeed] ${r.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await r.json()) as any;
    const lighthouse = data?.lighthouseResult;
    const audits = lighthouse?.audits ?? {};
    const perfScore = lighthouse?.categories?.performance?.score;
    // Prefer real CrUX field data when available, fall back to lab audits.
    const loading = data?.loadingExperience?.metrics ?? {};
    const cruxLcp = loading?.LARGEST_CONTENTFUL_PAINT_MS?.percentile;
    const cruxCls = loading?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
    const cruxInp = loading?.INTERACTION_TO_NEXT_PAINT?.percentile;

    return {
      performanceScore: typeof perfScore === 'number' ? Math.round(perfScore * 100) : null,
      lcpMs: cruxLcp ?? audits['largest-contentful-paint']?.numericValue ?? null,
      clsScore: cruxCls !== undefined ? cruxCls / 100 : (audits['cumulative-layout-shift']?.numericValue ?? null),
      inpMs: cruxInp ?? audits['interaction-to-next-paint']?.numericValue ?? audits['max-potential-fid']?.numericValue ?? null,
      fcpMs: audits['first-contentful-paint']?.numericValue ?? null,
      tbtMs: audits['total-blocking-time']?.numericValue ?? null,
      ttfbMs: audits['server-response-time']?.numericValue ?? null,
      fetchedAt: new Date().toISOString(),
      strategy,
    };
  } catch (e) {
    console.warn('[pagespeed] fetch failed:', e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translate PageSpeed metrics into scan_issues rows so the scanner surfaces
 * real Lighthouse regressions alongside its heuristic checks.
 */
export function pageSpeedToIssues(metrics: PageSpeedMetrics, pageUrl: string): ScanIssue[] {
  const issues: ScanIssue[] = [];

  // LCP thresholds: good <=2500ms, needs improvement <=4000ms, poor >4000ms
  if (metrics.lcpMs !== null) {
    if (metrics.lcpMs > 4000) {
      issues.push({
        scan_id: '', category: 'performance', severity: 'high',
        title: `LCP faible: ${Math.round(metrics.lcpMs)}ms (PageSpeed)`,
        description: `Largest Contentful Paint mesuré à ${Math.round(metrics.lcpMs)}ms — seuil "poor" (>4000ms) selon Core Web Vitals.`,
        recommendation: 'Optimisez l\'image LCP (preload, dimensions, format WebP/AVIF), réduisez le TTFB, éliminez les ressources bloquantes.',
        page_url: pageUrl,
      });
    } else if (metrics.lcpMs > 2500) {
      issues.push({
        scan_id: '', category: 'performance', severity: 'medium',
        title: `LCP à améliorer: ${Math.round(metrics.lcpMs)}ms (PageSpeed)`,
        description: `LCP à ${Math.round(metrics.lcpMs)}ms — au-dessus du seuil "good" (<=2500ms).`,
        recommendation: 'Preload l\'image LCP, activez la compression, réduisez le poids des CSS bloquants.',
        page_url: pageUrl,
      });
    }
  }

  // CLS thresholds: good <=0.1, needs improvement <=0.25, poor >0.25
  if (metrics.clsScore !== null && metrics.clsScore > 0.25) {
    issues.push({
      scan_id: '', category: 'performance', severity: 'high',
      title: `CLS trop élevé: ${metrics.clsScore.toFixed(3)} (PageSpeed)`,
      description: `Cumulative Layout Shift à ${metrics.clsScore.toFixed(3)} — seuil "poor" (>0.25).`,
      recommendation: 'Ajoutez width/height sur images et iframes, réservez l\'espace pour ads/embeds, preload les polices.',
      page_url: pageUrl,
    });
  } else if (metrics.clsScore !== null && metrics.clsScore > 0.1) {
    issues.push({
      scan_id: '', category: 'performance', severity: 'medium',
      title: `CLS à améliorer: ${metrics.clsScore.toFixed(3)} (PageSpeed)`,
      description: `CLS à ${metrics.clsScore.toFixed(3)} — au-dessus du seuil "good" (<=0.1).`,
      recommendation: 'Réservez l\'espace pour tout contenu inséré après le premier rendu.',
      page_url: pageUrl,
    });
  }

  // INP thresholds: good <=200ms, needs improvement <=500ms, poor >500ms
  if (metrics.inpMs !== null && metrics.inpMs > 500) {
    issues.push({
      scan_id: '', category: 'performance', severity: 'high',
      title: `INP faible: ${Math.round(metrics.inpMs)}ms (PageSpeed)`,
      description: `Interaction to Next Paint à ${Math.round(metrics.inpMs)}ms — seuil "poor" (>500ms).`,
      recommendation: 'Réduisez le JavaScript long tasks, découpez les scripts, différez les handlers non critiques.',
      page_url: pageUrl,
    });
  } else if (metrics.inpMs !== null && metrics.inpMs > 200) {
    issues.push({
      scan_id: '', category: 'performance', severity: 'medium',
      title: `INP à améliorer: ${Math.round(metrics.inpMs)}ms (PageSpeed)`,
      description: `INP à ${Math.round(metrics.inpMs)}ms — au-dessus du seuil "good" (<=200ms).`,
      recommendation: 'Auditez les long tasks (>50ms), utilisez requestIdleCallback, optimisez les event handlers.',
      page_url: pageUrl,
    });
  }

  // Global performance score
  if (metrics.performanceScore !== null && metrics.performanceScore < 50) {
    issues.push({
      scan_id: '', category: 'performance', severity: 'high',
      title: `Score PageSpeed faible: ${metrics.performanceScore}/100`,
      description: `Lighthouse note la performance ${metrics.performanceScore}/100 (${metrics.strategy}). Un score <50 est considéré comme "poor".`,
      recommendation: 'Consultez le rapport PageSpeed Insights complet pour la liste priorisée d\'optimisations.',
      page_url: pageUrl,
    });
  }

  return issues;
}
