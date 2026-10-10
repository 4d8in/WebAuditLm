import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { aggregatePageData } from '../aggregate.ts';
import {
  calculateCategoryScore,
  calculateAllCategoryScores,
  SEVERITY_DEDUCTIONS,
  MIN_CATEGORY_SCORE,
  MAX_CATEGORY_SCORE,
} from '../category.ts';
import { calculateGlobalScore, GLOBAL_WEIGHTS } from '../global.ts';
import type { PageAnalysis, ScanIssue } from '../../types.ts';

function mkPage(over: Partial<PageAnalysis> = {}): PageAnalysis {
  return {
    url: 'https://example.com/', title: null, html: '', markdown: '', links: [],
    statusCode: 200, headers: {}, hasH1: true, hasTitle: true, hasMetaDescription: true,
    metaDescription: null, metaDescriptionLength: 0, titleLength: 0, imagesWithoutAlt: 0,
    totalImages: 0, hasSemanticStructure: false, headingStructure: [], internalLinks: 0,
    externalLinks: 0, brokenLinks: [], loadTimeMs: 0, hasCanonical: false, hasOpenGraph: false,
    hasTwitterCard: false, hasStructuredData: false, structuredDataTypes: [], hasViewport: false,
    hasRobotsMeta: false, robotsContent: null, hasLangAttribute: false, langValue: null,
    hasFavicon: false, hasHreflang: false, hasAmpVersion: false, formCount: 0, formsWithoutLabels: 0,
    hasSkipLink: false, hasAriaLandmarks: false, tabIndexIssues: 0, inlineStylesCount: 0,
    inlineScriptsCount: 0, externalScriptsCount: 0, externalStylesheetsCount: 0, hasLazyLoading: false,
    hasAsyncDefer: false, hasPrefetch: false, hasPreconnect: false, wordCount: 500, readingTime: 3,
    duplicateIds: [], emptyLinks: 0, httpResources: 0, avgSentenceLength: 15, avgWordLength: 5,
    hasLowQualityContent: false, hasRepetitiveContent: false, contentStructureScore: 80,
    hasKeyboardNavigation: false, hasFocusIndicators: false, colorContrastIssues: 0,
    estimatedLCP: 1000, estimatedCLS: 0.05, estimatedFID: 50, estimatedINP: 100, lcpElement: null,
    clsRiskFactors: [], fidBlockingResources: 0, hasWebFontsPreload: false, hasLCPPreload: false,
    imagesWithoutDimensions: 0, totalRenderBlockingScripts: 0,
    ...over,
  };
}

function mkIssue(category: ScanIssue['category'], severity: ScanIssue['severity'], title = 't'): ScanIssue {
  return { scan_id: 's', category, severity, title, description: '', recommendation: '' };
}

// ── aggregatePageData ─────────────────────────────────────────────────────

Deno.test('aggregatePageData returns zeros on empty input', () => {
  const a = aggregatePageData([]);
  assertEquals(a.totalPages, 0);
  assertEquals(a.totalImages, 0);
  assertEquals(a.avgLoadTimeMs, 0);
});

Deno.test('aggregatePageData sums numeric fields and counts booleans', () => {
  const a = aggregatePageData([
    mkPage({ totalImages: 4, imagesWithoutAlt: 2, formsWithoutLabels: 1, hasH1: false, loadTimeMs: 100 }),
    mkPage({ totalImages: 6, imagesWithoutAlt: 3, formsWithoutLabels: 2, hasH1: true, loadTimeMs: 300 }),
  ]);
  assertEquals(a.totalPages, 2);
  assertEquals(a.totalImages, 10);
  assertEquals(a.imagesWithoutAlt, 5);
  assertEquals(a.formsWithoutLabels, 3);
  assertEquals(a.pagesWithoutH1, 1);
  assertEquals(a.avgLoadTimeMs, 200);
});

Deno.test('aggregatePageData counts duplicateIds by array length', () => {
  const a = aggregatePageData([mkPage({ duplicateIds: ['a', 'b', 'c'] })]);
  assertEquals(a.duplicateIdsCount, 3);
});

// ── calculateCategoryScore ────────────────────────────────────────────────

Deno.test('empty issues → perfect score 100', () => {
  assertEquals(calculateCategoryScore([], 'seo'), MAX_CATEGORY_SCORE);
});

Deno.test('score deducts per severity weight', () => {
  const s = calculateCategoryScore([mkIssue('seo', 'high'), mkIssue('seo', 'medium')], 'seo');
  assertEquals(s, 100 - SEVERITY_DEDUCTIONS.high - SEVERITY_DEDUCTIONS.medium);
});

Deno.test('score is floored at MIN_CATEGORY_SCORE', () => {
  const many = Array.from({ length: 20 }, () => mkIssue('seo', 'critical'));
  assertEquals(calculateCategoryScore(many, 'seo'), MIN_CATEGORY_SCORE);
});

Deno.test('score ignores issues from other categories', () => {
  const issues = [mkIssue('seo', 'critical'), mkIssue('security', 'critical')];
  assertEquals(calculateCategoryScore(issues, 'seo'), 100 - SEVERITY_DEDUCTIONS.critical);
});

Deno.test('calculateAllCategoryScores returns one score per category', () => {
  const s = calculateAllCategoryScores([mkIssue('security', 'high')]);
  assertEquals(s.security_score, 100 - SEVERITY_DEDUCTIONS.high);
  assertEquals(s.seo_score, 100);
  assertEquals(s.performance_score, 100);
  assertEquals(s.accessibility_score, 100);
  assertEquals(s.broken_links_score, 100);
});

// ── calculateGlobalScore ──────────────────────────────────────────────────

Deno.test('all perfect → global 100', () => {
  const g = calculateGlobalScore({
    performance_score: 100, seo_score: 100, accessibility_score: 100,
    security_score: 100, broken_links_score: 100,
  });
  assertEquals(g, 100);
});

Deno.test('weights sum to 1', () => {
  const total = GLOBAL_WEIGHTS.seo + GLOBAL_WEIGHTS.performance +
    GLOBAL_WEIGHTS.accessibility + GLOBAL_WEIGHTS.security + GLOBAL_WEIGHTS.broken_links;
  assert(Math.abs(total - 1) < 1e-9);
});

Deno.test('global score matches manual weighted average', () => {
  const scores = {
    seo_score: 80, performance_score: 60, accessibility_score: 70,
    security_score: 50, broken_links_score: 90,
  };
  const expected = Math.round(80 * 0.30 + 60 * 0.25 + 70 * 0.20 + 50 * 0.15 + 90 * 0.10);
  assertEquals(calculateGlobalScore(scores), expected);
});

Deno.test('SEO is the most heavily weighted category', () => {
  const withSeoHit = calculateGlobalScore({
    seo_score: 20, performance_score: 100, accessibility_score: 100,
    security_score: 100, broken_links_score: 100,
  });
  const withPerfHit = calculateGlobalScore({
    seo_score: 100, performance_score: 20, accessibility_score: 100,
    security_score: 100, broken_links_score: 100,
  });
  assert(withSeoHit < withPerfHit);
});
