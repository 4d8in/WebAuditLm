// Unit tests for security-headers feature module.
// Run with: deno test supabase/functions/_shared/scan-engine/features/__tests__/
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeHeadersPro } from '../security-headers.ts';

Deno.test('flags missing CSP as critical (OWASP #1)', () => {
  const issues = analyzeHeadersPro({});
  const csp = issues.find(i => i.title.includes('Content-Security-Policy manquant'));
  assert(csp, 'expected CSP-missing issue');
  assertEquals(csp!.severity, 'critical');
});

Deno.test('flags HSTS max-age below OWASP minimum', () => {
  const issues = analyzeHeadersPro({ 'Strict-Transport-Security': 'max-age=60' });
  assert(issues.some(i => i.title.includes('HSTS max-age trop court')));
});

Deno.test('accepts long HSTS with includeSubDomains without warnings', () => {
  const issues = analyzeHeadersPro({
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  });
  assertEquals(issues.filter(i => i.title.toLowerCase().includes('hsts')).length, 0);
});

Deno.test('flags unsafe-inline in CSP as high severity', () => {
  const issues = analyzeHeadersPro({
    'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'",
  });
  const unsafe = issues.find(i => i.title.includes('unsafe-inline'));
  assert(unsafe);
  assertEquals(unsafe!.severity, 'high');
});

Deno.test('flags X-Powered-By information disclosure', () => {
  const issues = analyzeHeadersPro({ 'x-powered-by': 'Express' });
  assert(issues.some(i => i.title.includes('X-Powered-By')));
});

Deno.test('is case-insensitive on header names', () => {
  const lower = analyzeHeadersPro({ 'content-security-policy': "default-src 'self'" });
  const upper = analyzeHeadersPro({ 'Content-Security-Policy': "default-src 'self'" });
  assertEquals(lower.length, upper.length);
});
