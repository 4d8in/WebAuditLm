// Unit tests for html-analyzer feature module.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeHtmlPro } from '../html-analyzer.ts';

const BASE = 'https://example.com/';

Deno.test('detects title, H1, meta description', () => {
  const html = `<!doctype html><html lang="fr"><head>
    <title>Bonjour</title><meta name="description" content="Une description de test suffisamment longue"></head>
    <body><h1>Hello</h1><p>Lorem ipsum dolor sit amet consectetur adipiscing elit.</p></body></html>`;
  const r = analyzeHtmlPro(html, BASE);
  assertEquals(r.hasTitle, true);
  assertEquals(r.hasH1, true);
  assertEquals(r.hasMetaDescription, true);
  assertEquals(r.hasLangAttribute, true);
  assertEquals(r.langValue, 'fr');
});

Deno.test('counts images without alt attributes', () => {
  const html = `<html><body><img src="a.jpg"><img src="b.jpg" alt="ok"><img src="c.jpg"></body></html>`;
  const r = analyzeHtmlPro(html, BASE);
  assertEquals(r.totalImages, 3);
  assertEquals(r.imagesWithoutAlt, 2);
});

Deno.test('separates internal and external links', () => {
  const html = `<html><body>
    <a href="/about">a</a>
    <a href="https://example.com/x">b</a>
    <a href="https://other.com/y">c</a>
  </body></html>`;
  const r = analyzeHtmlPro(html, BASE);
  assertEquals(r.internalLinks, 2);
  assertEquals(r.externalLinks, 1);
});

Deno.test('detects structured data JSON-LD types', () => {
  const html = `<html><head><script type="application/ld+json">{"@type":"Product","name":"x"}</script></head></html>`;
  const r = analyzeHtmlPro(html, BASE);
  assertEquals(r.hasStructuredData, true);
  assert(r.structuredDataTypes?.includes('Product'));
});

Deno.test('CLS risk grows with images missing dimensions', () => {
  const withDims = analyzeHtmlPro(`<html><body><img src="a.jpg" width="100" height="100"></body></html>`, BASE);
  const withoutDims = analyzeHtmlPro(`<html><body><img src="a.jpg"><img src="b.jpg"><img src="c.jpg"></body></html>`, BASE);
  assert((withoutDims.estimatedCLS ?? 0) > (withDims.estimatedCLS ?? 0));
});
