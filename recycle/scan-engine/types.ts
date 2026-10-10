// Shared types for the scan engine.
// Pure type declarations — safe to import from any edge function.
// Do not add runtime code here (no Deno.env, no fetch).

export interface CrawlResult {
  url: string;
  html: string;
  title: string | null;
  statusCode: number;
  headers: Record<string, string>;
  links: string[];
  loadTimeMs: number;
}

export interface RobotsTxtRules {
  allowed: string[];
  disallowed: string[];
  crawlDelay?: number;
}

export interface ScanIssue {
  scan_id: string;
  category: 'performance' | 'seo' | 'accessibility' | 'security' | 'broken_links';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  page_url?: string;
  recommendation: string;
  code_snippet?: string;
  line_number?: number;
  fix_suggestion?: string;
}

export interface PageAnalysis {
  url: string;
  title: string | null;
  html: string;
  markdown: string;
  links: string[];
  statusCode: number;
  headers?: Record<string, string>;
  hasH1: boolean;
  hasTitle: boolean;
  hasMetaDescription: boolean;
  metaDescription: string | null;
  metaDescriptionLength: number;
  titleLength: number;
  imagesWithoutAlt: number;
  totalImages: number;
  hasSemanticStructure: boolean;
  headingStructure: string[];
  internalLinks: number;
  externalLinks: number;
  brokenLinks: string[];
  loadTimeMs: number;
  // Enhanced pro analysis fields
  hasCanonical: boolean;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  hasViewport: boolean;
  hasRobotsMeta: boolean;
  robotsContent: string | null;
  hasLangAttribute: boolean;
  langValue: string | null;
  hasFavicon: boolean;
  hasHreflang: boolean;
  hasAmpVersion: boolean;
  formCount: number;
  formsWithoutLabels: number;
  hasSkipLink: boolean;
  hasAriaLandmarks: boolean;
  tabIndexIssues: number;
  inlineStylesCount: number;
  inlineScriptsCount: number;
  externalScriptsCount: number;
  externalStylesheetsCount: number;
  hasLazyLoading: boolean;
  hasAsyncDefer: boolean;
  hasPrefetch: boolean;
  hasPreconnect: boolean;
  wordCount: number;
  readingTime: number;
  duplicateIds: string[];
  emptyLinks: number;
  httpResources: number;
  // Enhanced content quality fields
  avgSentenceLength: number;
  avgWordLength: number;
  hasLowQualityContent: boolean;
  hasRepetitiveContent: boolean;
  contentStructureScore: number;
  // Enhanced accessibility fields
  hasKeyboardNavigation: boolean;
  hasFocusIndicators: boolean;
  colorContrastIssues: number;
  // Core Web Vitals estimation
  estimatedLCP: number; // ms - Largest Contentful Paint estimate
  estimatedCLS: number; // score - Cumulative Layout Shift estimate
  estimatedFID: number; // ms - First Input Delay estimate
  estimatedINP: number; // ms - Interaction to Next Paint estimate
  lcpElement: string | null; // What the LCP element likely is
  clsRiskFactors: string[]; // Factors that may cause CLS
  fidBlockingResources: number; // Number of render-blocking resources
  hasWebFontsPreload: boolean; // Web fonts preloaded
  hasLCPPreload: boolean; // LCP image preloaded
  imagesWithoutDimensions: number; // Images missing width/height (CLS risk)
  totalRenderBlockingScripts: number; // Scripts blocking FID/INP
}
