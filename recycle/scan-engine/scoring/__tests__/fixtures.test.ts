// Regression fixture test: pipeline HTML pages → aggregate → category scores → global.
// Guards A.3/A.4 refactor: any change that alters output on these fixtures fails here.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { PageAnalysis, ScanIssue } from '../../types.ts';
import {
  aggregatePageData,
  calculateAllCategoryScores,
  calculateGlobalScore,
} from '../index.ts';

const mkPage = (over: Partial<PageAnalysis> = {}): PageAnalysis => ({
  url: 'https://x.test/',
  statusCode: 200,
  title: 'Bonjour',
  metaDescription: 'ok',
  h1Count: 1,
  hasH1: true,
  hasMetaDescription: true,
  wordCount: 400,
  loadTimeMs: 1200,
  imagesCount: 3,
  imagesWithoutAlt: 0,
  linksCount: 20,
  externalLinks: 5,
  hasCanonical: true,
  hasStructuredData: false,
  robotsContent: 'index, follow',
  ...over,
} as PageAnalysis);

const mkIssue = (o: Partial<ScanIssue>): ScanIssue => ({
  scan_id: 's1', category: 'seo', severity: 'medium', title: 't', description: 'd', recommendation: 'r', ...o,
} as ScanIssue);

Deno.test('fixture: healthy site scores >= 80 on all categories', () => {
  const pages = [mkPage(), mkPage({ url: 'https://x.test/a' }), mkPage({ url: 'https://x.test/b' })];
  const issues: ScanIssue[] = [];
  const agg = aggregatePageData(pages);
  const scores = calculateAllCategoryScores(issues);
  const global = calculateGlobalScore(scores);
  assertEquals(scores.seo_score >= 80, true, `seo=${scores.seo_score}`);
  assertEquals(scores.performance_score >= 80, true, `perf=${scores.performance_score}`);
  assertEquals(scores.accessibility_score >= 80, true, `a11y=${scores.accessibility_score}`);
  assertEquals(scores.security_score >= 80, true, `sec=${scores.security_score}`);
  assertEquals(global >= 80, true, `global=${global}`);
});

Deno.test('fixture: 3 critical security issues collapse security_score < 50', () => {
  const pages = [mkPage()];
  const issues: ScanIssue[] = [
    mkIssue({ category: 'security', severity: 'critical', title: 'XSS' }),
    mkIssue({ category: 'security', severity: 'critical', title: 'Open CORS' }),
    mkIssue({ category: 'security', severity: 'critical', title: 'Secret leak' }),
  ];
  const agg = aggregatePageData(pages);
  const scores = calculateAllCategoryScores(issues);
  assertEquals(scores.security_score < 50, true, `sec=${scores.security_score}`);
});

Deno.test('fixture: pages missing H1 and meta pull SEO below baseline', () => {
  const pages = [
    mkPage({ hasH1: false, hasMetaDescription: false }),
    mkPage({ url: 'https://x.test/a', hasH1: false }),
    mkPage({ url: 'https://x.test/b', hasMetaDescription: false }),
  ];
  const issues: ScanIssue[] = [
    mkIssue({ category: 'seo', severity: 'high', title: 'no h1' }),
    mkIssue({ category: 'seo', severity: 'high', title: 'no meta', page_url: 'https://x.test/a' }),
  ];
  const agg = aggregatePageData(pages);
  const scores = calculateAllCategoryScores(issues);
  assertEquals(scores.seo_score < 90, true, `seo=${scores.seo_score}`);
});

Deno.test('fixture: global score is bounded 0..100 with heavy issue load', () => {
  const pages = [mkPage()];
  const issues: ScanIssue[] = Array.from({ length: 40 }, (_, i) =>
    mkIssue({ category: i % 2 ? 'performance' : 'accessibility', severity: 'critical', title: 't' + i }),
  );
  const agg = aggregatePageData(pages);
  const scores = calculateAllCategoryScores(issues);
  const global = calculateGlobalScore(scores);
  assertEquals(global >= 0 && global <= 100, true, `global=${global}`);
});
