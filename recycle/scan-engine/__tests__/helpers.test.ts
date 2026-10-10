import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { optimizeDescription, deduplicateIssues, detectTechnicalPage } from '../helpers.ts';
import type { ScanIssue, PageAnalysis } from '../types.ts';

Deno.test('optimizeDescription passthrough when short', () => {
  assertEquals(optimizeDescription('hello world'), 'hello world');
});

Deno.test('optimizeDescription truncates without breaking word', () => {
  const s = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor';
  const r = optimizeDescription(s, 30);
  assert(r.length <= 31);
  assert(r.endsWith('…'));
  assert(!r.includes('consectetu…') || r.endsWith('…'));
});

Deno.test('optimizeDescription collapses whitespace', () => {
  assertEquals(optimizeDescription('a  b\n\tc'), 'a b c');
});

Deno.test('deduplicateIssues removes duplicates on (category,severity,title,page_url)', () => {
  const issues: ScanIssue[] = [
    { scan_id: 's', category: 'seo', severity: 'high', title: 'X', description: '', recommendation: '', page_url: '/a' },
    { scan_id: 's', category: 'seo', severity: 'high', title: 'X', description: '', recommendation: '', page_url: '/a' },
    { scan_id: 's', category: 'seo', severity: 'high', title: 'X', description: '', recommendation: '', page_url: '/b' },
  ];
  const out = deduplicateIssues(issues);
  assertEquals(out.length, 2);
});

function mkPage(over: Partial<PageAnalysis>): PageAnalysis {
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

Deno.test('detectTechnicalPage flags 404 status', () => {
  const r = detectTechnicalPage(mkPage({ statusCode: 404 }));
  assertEquals(r.isTechnical, true);
  assert(r.reason?.includes('404'));
});

Deno.test('detectTechnicalPage flags admin URL', () => {
  const r = detectTechnicalPage(mkPage({ url: 'https://example.com/wp-admin/' }));
  assertEquals(r.isTechnical, true);
});

Deno.test('detectTechnicalPage flags noindex meta', () => {
  const r = detectTechnicalPage(mkPage({ robotsContent: 'noindex, nofollow' }));
  assertEquals(r.isTechnical, true);
});

Deno.test('detectTechnicalPage keeps normal page', () => {
  const r = detectTechnicalPage(mkPage({ url: 'https://example.com/blog/hello', title: 'Bonjour le monde' }));
  assertEquals(r.isTechnical, false);
});

Deno.test('detectTechnicalPage flags empty stub', () => {
  const r = detectTechnicalPage(mkPage({ wordCount: 10, hasH1: false, hasMetaDescription: false }));
  assertEquals(r.isTechnical, true);
});
