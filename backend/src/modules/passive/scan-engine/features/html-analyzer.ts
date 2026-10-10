// Pure HTML analysis: SEO meta, accessibility signals, performance heuristics
// and Core Web Vitals estimation. Extracted verbatim from run-scan/index.ts
// (Partie A.2 — no behavioral change).
import type { PageAnalysis } from '../types.ts';

export function analyzeHtmlPro(html: string, url: string): Partial<PageAnalysis> {
  // Basic checks
  const hasH1 = /<h1[^>]*>/i.test(html);
  const hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
  const hasMetaDescription = /<meta[^>]*name=["']description["'][^>]*>/i.test(html);

  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const metaDescription = metaDescMatch ? metaDescMatch[1] : null;
  const metaDescriptionLength = metaDescription?.length || 0;

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleLength = titleMatch ? titleMatch[1].trim().length : 0;

  const imgMatches = html.match(/<img[^>]*>/gi) || [];
  const totalImages = imgMatches.length;
  const imagesWithoutAlt = imgMatches.filter(img => !img.match(/alt=["'][^"']+["']/i)).length;

  const hasSemanticStructure = /<(header|main|footer|nav|article|section|aside)[^>]*>/i.test(html);

  const headingMatches = html.match(/<h[1-6][^>]*>([^<]*)<\/h[1-6]>/gi) || [];
  const headingStructure = headingMatches.map(h => {
    const level = h.match(/<h([1-6])/i)?.[1] || '?';
    const text = h.replace(/<[^>]*>/g, '').trim().substring(0, 50);
    return `H${level}: ${text}`;
  });

  const linkMatches = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi) || [];
  let internalLinks = 0;
  let externalLinks = 0;
  const baseUrl = new URL(url).hostname;

  linkMatches.forEach(link => {
    const hrefMatch = link.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      const href = hrefMatch[1];
      if (href.startsWith('http')) {
        try {
          const linkHostname = new URL(href).hostname;
          if (linkHostname === baseUrl || linkHostname.endsWith(`.${baseUrl}`)) {
            internalLinks++;
          } else {
            externalLinks++;
          }
        } catch {
          externalLinks++;
        }
      } else if (href.startsWith('/') || href.startsWith('#')) {
        internalLinks++;
      }
    }
  });

  const hasCanonical = /<link[^>]*rel=["']canonical["'][^>]*>/i.test(html);
  const hasOpenGraph = /<meta[^>]*property=["']og:/i.test(html);
  const hasTwitterCard = /<meta[^>]*name=["']twitter:/i.test(html);

  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const hasStructuredData = jsonLdMatches.length > 0 || /itemscope/i.test(html) || /vocab=["']http:\/\/schema\.org/i.test(html);

  const structuredDataTypes: string[] = [];
  jsonLdMatches.forEach(match => {
    const typeMatch = match.match(/"@type"\s*:\s*"([^"]+)"/);
    if (typeMatch) structuredDataTypes.push(typeMatch[1]);
  });

  const hasViewport = /<meta[^>]*name=["']viewport["'][^>]*>/i.test(html);

  const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);
  const hasRobotsMeta = !!robotsMatch;
  const robotsContent = robotsMatch ? robotsMatch[1] : null;

  const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
  const hasLangAttribute = !!langMatch;
  const langValue = langMatch ? langMatch[1] : null;

  const hasFavicon = /<link[^>]*rel=["'](icon|shortcut icon|apple-touch-icon)["'][^>]*>/i.test(html);
  const hasHreflang = /<link[^>]*hreflang=["'][^"']+["'][^>]*>/i.test(html);
  const hasAmpVersion = /<link[^>]*rel=["']amphtml["'][^>]*>/i.test(html);

  const formMatches = html.match(/<form[^>]*>/gi) || [];
  const formCount = formMatches.length;
  const labelMatches = html.match(/<label[^>]*>/gi) || [];
  const inputMatches = html.match(/<input[^>]*>/gi) || [];
  const formsWithoutLabels = Math.max(0, inputMatches.length - labelMatches.length);

  const hasSkipLink = /<a[^>]*href=["']#(main|content|skip)[^"']*["'][^>]*>/i.test(html);
  const hasAriaLandmarks = /role=["'](banner|navigation|main|contentinfo|complementary|search|form)[^"']*["']/i.test(html);

  const tabindexIssues = (html.match(/tabindex=["']-?\d+["']/gi) || []).filter(t => {
    const val = parseInt(t.match(/-?\d+/)?.[0] || '0');
    return val > 0;
  }).length;

  const inlineStylesCount = (html.match(/style=["'][^"']+["']/gi) || []).length;
  const inlineScriptsCount = (html.match(/<script(?![^>]*src=)[^>]*>/gi) || []).length;
  const externalScriptsCount = (html.match(/<script[^>]*src=["'][^"']+["'][^>]*>/gi) || []).length;
  const externalStylesheetsCount = (html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || []).length;

  const hasLazyLoading = /loading=["']lazy["']/i.test(html);
  const hasAsyncDefer = /(async|defer)[^>]*>/i.test(html);
  const hasPrefetch = /<link[^>]*rel=["'](prefetch|preload|dns-prefetch)["'][^>]*>/i.test(html);
  const hasPreconnect = /<link[^>]*rel=["']preconnect["'][^>]*>/i.test(html);

  const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = textContent.split(' ').filter(w => w.length > 0);
  const wordCount = words.length;
  const readingTime = Math.ceil(wordCount / 200);

  const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
  const avgWordLength = words.length > 0 ? words.reduce((sum, w) => sum + w.length, 0) / words.length : 0;

  const hasLowQualityContent = wordCount < 300 || avgSentenceLength < 5 || avgSentenceLength > 30;
  const hasRepetitiveContent = words.length > 0 && new Set(words.map(w => w.toLowerCase())).size < words.length * 0.3;

  const headingCount = headingMatches.length;
  const contentStructureScore = headingCount > 0 && wordCount > 0
    ? Math.min(100, (headingCount / Math.max(1, wordCount / 200)) * 20)
    : 0;

  const idMatches = html.match(/id=["']([^"']+)["']/gi) || [];
  const ids = idMatches.map(m => m.match(/id=["']([^"']+)["']/i)?.[1] || '');
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

  const emptyLinks = (html.match(/<a[^>]*href=["'](#|javascript:void\(0\)|javascript:;)?["'][^>]*>\s*<\/a>/gi) || []).length;
  const httpResources = (html.match(/(?:src|href)=["']http:\/\//gi) || []).length;

  const hasKeyboardNavigation = /<a[^>]*href/i.test(html) && hasSkipLink;
  const hasFocusIndicators = /:focus/i.test(html) || /outline:/i.test(html);
  const colorContrastIssues = (html.match(/color:\s*(#fff|#ffffff|white|#000|#000000|black)/gi) || []).length;

  const largeImages = (html.match(/<img[^>]*>/gi) || []).filter(img => {
    return !img.includes('loading="lazy"') && !img.includes("loading='lazy'");
  });
  const hasHeroImage = /<(section|div)[^>]*class=["'][^"']*(hero|banner|jumbotron|splash)[^"']*["'][^>]*>[\s\S]*?<img/i.test(html);
  const hasLargeBackgroundImage = /background(-image)?:\s*url\(/i.test(html);

  let estimatedLCP = 800;
  if (largeImages.length > 0) estimatedLCP += 600;
  if (hasHeroImage || hasLargeBackgroundImage) estimatedLCP += 400;
  if (!hasPreconnect && externalScriptsCount > 2) estimatedLCP += 300;
  if (!hasLazyLoading && totalImages > 5) estimatedLCP += 200;
  if (externalStylesheetsCount > 3) estimatedLCP += 200;
  const hasLCPPreload = /<link[^>]*rel=["']preload["'][^>]*as=["'](image|font)["']/i.test(html);
  if (!hasLCPPreload && (hasHeroImage || largeImages.length > 0)) estimatedLCP += 300;

  let lcpElement: string | null = null;
  if (hasHeroImage) lcpElement = 'Hero image';
  else if (largeImages.length > 0) lcpElement = 'Above-the-fold image';
  else if (hasLargeBackgroundImage) lcpElement = 'CSS background image';
  else lcpElement = 'Text block (H1/paragraph)';

  const imgTags = html.match(/<img[^>]*>/gi) || [];
  const imagesWithoutDimensions = imgTags.filter(img => {
    const hasWidth = /width=["']?\d+/i.test(img) || /style=["'][^"']*width\s*:/i.test(img);
    const hasHeight = /height=["']?\d+/i.test(img) || /style=["'][^"']*height\s*:/i.test(img);
    return !(hasWidth && hasHeight);
  }).length;

  const hasWebFontsPreload = /<link[^>]*rel=["']preload["'][^>]*as=["']font["']/i.test(html);
  const usesWebFonts = /@font-face/i.test(html) || /fonts\.googleapis\.com/i.test(html) || /fonts\.gstatic\.com/i.test(html);

  let estimatedCLS = 0;
  const clsRiskFactors: string[] = [];
  if (imagesWithoutDimensions > 0) {
    estimatedCLS += 0.05 * Math.min(imagesWithoutDimensions, 5);
    clsRiskFactors.push(`${imagesWithoutDimensions} image(s) sans dimensions`);
  }
  if (usesWebFonts && !hasWebFontsPreload) {
    estimatedCLS += 0.05;
    clsRiskFactors.push('Web fonts sans preload (FOUT/FOIT)');
  }
  if (/<iframe[^>]*>/i.test(html)) {
    estimatedCLS += 0.03;
    clsRiskFactors.push('iframes sans dimensions réservées');
  }
  if (/position:\s*absolute/i.test(html) && /top:\s*0/i.test(html)) {
    estimatedCLS += 0.02;
    clsRiskFactors.push('Éléments injectés dynamiquement');
  }

  const totalRenderBlockingScripts = (html.match(/<script(?![^>]*(async|defer|type=["']module["']))[^>]*src=["'][^"']+["'][^>]*>/gi) || []).length;
  let estimatedFID = 50;
  estimatedFID += totalRenderBlockingScripts * 30;
  if (inlineScriptsCount > 3) estimatedFID += 20;
  if (externalScriptsCount > 5) estimatedFID += 40;

  let estimatedINP = estimatedFID * 1.5;
  if (totalRenderBlockingScripts > 3) estimatedINP += 50;

  return {
    hasH1, hasTitle, hasMetaDescription, metaDescription, metaDescriptionLength,
    titleLength, imagesWithoutAlt, totalImages, hasSemanticStructure, headingStructure,
    internalLinks, externalLinks,
    hasCanonical, hasOpenGraph, hasTwitterCard, hasStructuredData, structuredDataTypes,
    hasViewport, hasRobotsMeta, robotsContent, hasLangAttribute, langValue,
    hasFavicon, hasHreflang, hasAmpVersion,
    formCount, formsWithoutLabels, hasSkipLink, hasAriaLandmarks,
    tabIndexIssues: tabindexIssues,
    inlineStylesCount, inlineScriptsCount, externalScriptsCount, externalStylesheetsCount,
    hasLazyLoading, hasAsyncDefer, hasPrefetch, hasPreconnect,
    wordCount, readingTime, duplicateIds, emptyLinks, httpResources,
    avgSentenceLength, avgWordLength, hasLowQualityContent, hasRepetitiveContent, contentStructureScore,
    hasKeyboardNavigation, hasFocusIndicators, colorContrastIssues,
    estimatedLCP,
    estimatedCLS: Math.round(estimatedCLS * 100) / 100,
    estimatedFID,
    estimatedINP: Math.round(estimatedINP),
    lcpElement, clsRiskFactors,
    fidBlockingResources: totalRenderBlockingScripts,
    hasWebFontsPreload, hasLCPPreload, imagesWithoutDimensions, totalRenderBlockingScripts,
  };
}
