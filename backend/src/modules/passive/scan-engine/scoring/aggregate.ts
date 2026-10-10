// Aggregate per-page analysis into totals used by score calculation.
// Pure function — no I/O, no side effects. Fully unit-testable.
import type { PageAnalysis } from '../types.ts';

export interface AggregatedPageData {
  totalPages: number;
  totalImages: number;
  imagesWithoutAlt: number;
  totalForms: number;
  formsWithoutLabels: number;
  totalInternalLinks: number;
  totalExternalLinks: number;
  totalInlineStyles: number;
  totalInlineScripts: number;
  totalExternalScripts: number;
  duplicateIdsCount: number;
  emptyLinksCount: number;
  httpResourcesCount: number;
  pagesWithoutH1: number;
  pagesWithoutTitle: number;
  pagesWithoutMetaDescription: number;
  avgLoadTimeMs: number;
  avgWordCount: number;
}

export function aggregatePageData(pages: PageAnalysis[]): AggregatedPageData {
  const totalPages = pages.length;
  if (totalPages === 0) {
    return {
      totalPages: 0, totalImages: 0, imagesWithoutAlt: 0, totalForms: 0,
      formsWithoutLabels: 0, totalInternalLinks: 0, totalExternalLinks: 0,
      totalInlineStyles: 0, totalInlineScripts: 0, totalExternalScripts: 0,
      duplicateIdsCount: 0, emptyLinksCount: 0, httpResourcesCount: 0,
      pagesWithoutH1: 0, pagesWithoutTitle: 0, pagesWithoutMetaDescription: 0,
      avgLoadTimeMs: 0, avgWordCount: 0,
    };
  }
  const sum = (fn: (p: PageAnalysis) => number) =>
    pages.reduce((acc, p) => acc + (fn(p) || 0), 0);
  const count = (fn: (p: PageAnalysis) => boolean) =>
    pages.reduce((acc, p) => acc + (fn(p) ? 1 : 0), 0);

  return {
    totalPages,
    totalImages: sum(p => p.totalImages),
    imagesWithoutAlt: sum(p => p.imagesWithoutAlt),
    totalForms: sum(p => p.formCount),
    formsWithoutLabels: sum(p => p.formsWithoutLabels),
    totalInternalLinks: sum(p => p.internalLinks),
    totalExternalLinks: sum(p => p.externalLinks),
    totalInlineStyles: sum(p => p.inlineStylesCount),
    totalInlineScripts: sum(p => p.inlineScriptsCount),
    totalExternalScripts: sum(p => p.externalScriptsCount),
    duplicateIdsCount: sum(p => p.duplicateIds?.length ?? 0),
    emptyLinksCount: sum(p => p.emptyLinks),
    httpResourcesCount: sum(p => p.httpResources),
    pagesWithoutH1: count(p => !p.hasH1),
    pagesWithoutTitle: count(p => !p.hasTitle),
    pagesWithoutMetaDescription: count(p => !p.hasMetaDescription),
    avgLoadTimeMs: Math.round(sum(p => p.loadTimeMs) / totalPages),
    avgWordCount: Math.round(sum(p => p.wordCount) / totalPages),
  };
}
