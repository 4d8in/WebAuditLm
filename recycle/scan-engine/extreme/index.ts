// Extreme (NASA-grade) modules extracted from run-scan.
// Each sub-module is guarded, sandboxed, and mutates the shared `issues` array.
import type { ScanIssue, PageAnalysis } from '../types.ts';

export type LogStepFn = (
  step: string,
  message: string,
  level?: 'info' | 'warn' | 'error',
  metadata?: Record<string, unknown>,
) => Promise<void>;

export type RunSandboxFn = <T>(
  step: string,
  label: string,
  fn: (ctx: { fetch: typeof fetch; budget: { used: number; max: number } }) => Promise<T>,
  opts?: { timeoutMs?: number; maxRequests?: number },
) => Promise<T | null>;

export interface ExtremeContext {
  supabase: any;
  scanId: string;
  scan: { url: string };
  scanOptions: Record<string, any>;
  pagesData: PageAnalysis[];
  issues: ScanIssue[]; // mutated
  logStep: LogStepFn;
  runSandbox: RunSandboxFn;
}

export async function runExtremeModules(ctx: ExtremeContext): Promise<void> {
  const { supabase, scanId, scan, scanOptions, pagesData, issues, logStep, runSandbox } = ctx;
  try {
    await supabase.from('scans').update({ current_page_url: 'Mode Extreme — analyses avancées…', scan_progress: 80 }).eq('id', scanId);
    await logStep('extreme', '🛸 Mode Extreme activé — modules avancés', 'info', { options: scanOptions });

    const targetUrl = new URL(scan.url);
    const host = targetUrl.hostname;

    // ---- OSINT: sous-domaines via crt.sh ----
    if (scanOptions.osint !== false) {
      try {
        await logStep('osint', 'OSINT : énumération des sous-domaines (crt.sh)', 'info');
        const apex = host.split('.').slice(-2).join('.');
        const ctRes = await fetch(`https://crt.sh/?q=%25.${apex}&output=json`, { signal: AbortSignal.timeout(15000) });
        if (ctRes.ok) {
          const ctData = await ctRes.json().catch(() => []);
          const subs = new Set<string>();
          for (const row of (Array.isArray(ctData) ? ctData : []).slice(0, 500)) {
            const name = String(row.name_value || '').toLowerCase();
            name.split('\n').forEach((s: string) => {
              if (s.endsWith(apex) && !s.includes('*')) subs.add(s.trim());
            });
          }
          const subList = [...subs].slice(0, 100);
          await logStep('osint', `${subList.length} sous-domaine(s) détecté(s)`, 'info', { sample: subList.slice(0, 10) });
          if (subList.length > 5) {
            issues.push({
              scan_id: scanId, category: 'security', severity: 'medium',
              title: `${subList.length} sous-domaines exposés (OSINT crt.sh)`,
              description: `Surface d'attaque élargie : ${subList.slice(0, 5).join(', ')}${subList.length > 5 ? '…' : ''}`,
              recommendation: "Auditez les sous-domaines orphelins (subdomain takeover), désactivez ceux inutilisés et appliquez les mêmes headers de sécurité partout.",
            } as ScanIssue);
          }
        }
      } catch (e) { await logStep('osint', `OSINT échec : ${(e as Error).message}`, 'warn'); }
    }

    // ---- PENTEST LIGHT: CORS, cookies, méthodes HTTP ----
    if (scanOptions.pentest !== false) {
      try {
        await logStep('pentest', 'Pentest léger : CORS, méthodes HTTP, cookies', 'info');
        const headRes = await fetch(scan.url, { method: 'GET', signal: AbortSignal.timeout(10000) });
        const h = headRes.headers;
        const corsOrigin = h.get('access-control-allow-origin');
        if (corsOrigin === '*') {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'high',
            title: 'CORS permissif : Access-Control-Allow-Origin: *',
            description: "L'API accepte les requêtes cross-origin de n'importe quel domaine. Risque de vol de données si combiné à des credentials.",
            recommendation: "Restreignez à une liste blanche d'origines de confiance et n'utilisez jamais '*' avec Allow-Credentials.",
          } as ScanIssue);
        }
        const setCookie = h.get('set-cookie') || '';
        if (setCookie && !/httponly/i.test(setCookie)) {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'high',
            title: 'Cookies sans flag HttpOnly',
            description: 'Les cookies sont accessibles via JavaScript, exposant les sessions aux attaques XSS.',
            recommendation: 'Ajoutez les flags HttpOnly, Secure et SameSite=Strict à tous les cookies de session.',
          } as ScanIssue);
        }
        try {
          const opt = await fetch(scan.url, { method: 'OPTIONS', signal: AbortSignal.timeout(5000) });
          const allow = (opt.headers.get('allow') || '').toUpperCase();
          if (/TRACE|TRACK|DELETE/.test(allow)) {
            issues.push({
              scan_id: scanId, category: 'security', severity: 'medium',
              title: `Méthodes HTTP sensibles autorisées : ${allow}`,
              description: 'Le serveur expose des méthodes potentiellement dangereuses (TRACE/TRACK/DELETE).',
              recommendation: 'Désactivez TRACE/TRACK au niveau du serveur web et limitez DELETE aux endpoints API authentifiés.',
            } as ScanIssue);
          }
        } catch {}
      } catch (e) { await logStep('pentest', `Pentest échec : ${(e as Error).message}`, 'warn'); }
    }

    // ---- BUNDLE ANALYSIS ----
    if (scanOptions.bundle !== false && pagesData.length > 0) {
      try {
        await logStep('bundle', 'Analyse des bundles JS/CSS', 'info');
        const firstPage = pagesData[0] as any;
        const html: string = firstPage?.html || firstPage?.content || '';
        const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]).slice(0, 15);
        let totalJsBytes = 0;
        const vulnLibs: string[] = [];
        const vulnPatterns: Array<[RegExp, string]> = [
          [/jquery[-.]1\.[0-9]/i, 'jQuery 1.x (XSS connues)'],
          [/jquery[-.]2\.[0-9]/i, 'jQuery 2.x (obsolète)'],
          [/angular\.js\/1\./i, 'AngularJS 1.x (fin de vie)'],
          [/bootstrap[-.]3\./i, 'Bootstrap 3.x (XSS connues)'],
          [/lodash[-.][0-3]\./i, 'Lodash <4 (prototype pollution)'],
        ];
        for (const src of scriptSrcs) {
          try {
            const abs = src.startsWith('http') ? src : new URL(src, scan.url).toString();
            for (const [pat, label] of vulnPatterns) if (pat.test(abs)) vulnLibs.push(label);
            const r = await fetch(abs, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            const len = parseInt(r.headers.get('content-length') || '0', 10);
            if (len) totalJsBytes += len;
          } catch {}
        }
        const totalKb = Math.round(totalJsBytes / 1024);
        await logStep('bundle', `${scriptSrcs.length} bundle(s) JS — ${totalKb} KB total`, 'info');
        if (totalKb > 500) {
          issues.push({
            scan_id: scanId, category: 'performance', severity: totalKb > 1500 ? 'high' : 'medium',
            title: `Bundle JS lourd : ${totalKb} KB`,
            description: `${scriptSrcs.length} scripts pour ${totalKb} KB. Impact direct sur LCP/TTI mobile.`,
            recommendation: 'Code-splitting, tree-shaking, lazy-load des routes, retrait des libs inutilisées.',
          } as ScanIssue);
        }
        for (const v of [...new Set(vulnLibs)]) {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'high',
            title: `Librairie vulnérable détectée : ${v}`,
            description: 'Cette version embarque des vulnérabilités publiques (CVE).',
            recommendation: 'Mettez à jour vers la dernière version stable ou remplacez par une alternative maintenue.',
          } as ScanIssue);
        }
      } catch (e) { await logStep('bundle', `Bundle analyse échec : ${(e as Error).message}`, 'warn'); }
    }

    // ---- XSS REFLECTED probe ----
    if (scanOptions.pentest !== false) {
      try {
        const probe = '"><svg/onload=zXa1>';
        const probeUrl = `${scan.url}${scan.url.includes('?') ? '&' : '?'}q=${encodeURIComponent(probe)}`;
        const r = await fetch(probeUrl, { signal: AbortSignal.timeout(8000) });
        const body = await r.text();
        if (body.includes(probe) && !r.headers.get('content-security-policy')) {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'critical',
            title: 'Possible XSS réfléchi (paramètre q)',
            description: 'La payload de test est renvoyée brute dans la réponse, sans CSP pour la mitiger.',
            recommendation: 'Échappez systématiquement les paramètres d’URL avant rendu et déployez une Content-Security-Policy stricte.',
          } as ScanIssue);
        }
      } catch {}
    }

    // ===== Sandboxed modules =====
    const moduleLimits: Record<string, { maxRequests?: number; timeoutMs?: number }> = (scanOptions.limits as any) || {};
    const limitsFor = (id: string) => moduleLimits[id] || {};

    // ---- Recon .well-known ----
    if (scanOptions.recon !== false) {
      await runSandbox('recon', 'Reconnaissance .well-known / security.txt', async ({ fetch: sf }) => {
        const base = new URL(scan.url).origin;
        const probes = ['/.well-known/security.txt', '/security.txt', '/robots.txt', '/sitemap.xml', '/.env', '/.git/HEAD', '/.DS_Store'];
        const found: string[] = [];
        const leaks: string[] = [];
        for (const p of probes) {
          try {
            const r = await sf(`${base}${p}`);
            if (r.status === 200) {
              found.push(p);
              if (/\.env|\.git|\.DS_Store/.test(p)) leaks.push(p);
            }
          } catch {}
        }
        await logStep('secrets', `Probes : ${found.length} trouvée(s), ${leaks.length} fuite(s) potentielle(s)`, leaks.length ? 'warn' : 'info', { found, leaks });
        if (leaks.length > 0) {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'critical',
            title: `Fichiers sensibles exposés : ${leaks.join(', ')}`,
            description: 'Ces fichiers ne doivent jamais être servis en production — ils peuvent contenir des secrets, l’historique Git ou des artefacts internes.',
            recommendation: 'Bloquez ces chemins au niveau du reverse-proxy (nginx/Cloudflare) et auditez le contenu pour les credentials exposés.',
          } as ScanIssue);
        }
        if (!found.includes('/.well-known/security.txt') && !found.includes('/security.txt')) {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'low',
            title: 'security.txt absent',
            description: 'RFC 9116 recommande un fichier /.well-known/security.txt pour coordonner les divulgations de vulnérabilités.',
            recommendation: 'Publiez un security.txt avec un contact et une politique de divulgation responsable.',
          } as ScanIssue);
        }
      }, limitsFor('recon'));
    }

    // ---- Secrets leak scan in bundles ----
    if (scanOptions.secrets !== false && pagesData.length > 0) {
      await runSandbox('secrets', 'Scan de fuites de secrets dans les bundles JS', async ({ fetch: sf, budget }) => {
        const firstPage = pagesData[0] as any;
        const html: string = firstPage?.html || '';
        const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 8);
        const patterns: Array<[RegExp, string]> = [
          [/AKIA[0-9A-Z]{16}/, 'AWS Access Key ID'],
          [/sk_live_[0-9a-zA-Z]{24,}/, 'Stripe Live Secret Key'],
          [/AIza[0-9A-Za-z\-_]{35}/, 'Google API Key'],
          [/ghp_[A-Za-z0-9]{36}/, 'GitHub Personal Token'],
          [/eyJ[A-Za-z0-9_=\-]{20,}\.[A-Za-z0-9_=\-]{20,}\.[A-Za-z0-9_.\-+/=]{20,}/, 'JWT token'],
          [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, 'Private Key (PEM)'],
          [/SUPABASE_SERVICE_ROLE_KEY|service_role/i, 'Supabase service_role mention'],
        ];
        const hits: Array<{ url: string; type: string }> = [];
        for (const src of scriptSrcs) {
          if (budget.used >= budget.max - 1) break;
          try {
            const abs = src.startsWith('http') ? src : new URL(src, scan.url).toString();
            const r = await sf(abs);
            if (!r.ok) continue;
            const body = (await r.text()).slice(0, 600_000);
            for (const [pat, label] of patterns) {
              if (pat.test(body)) hits.push({ url: abs, type: label });
            }
          } catch {}
        }
        await logStep('secrets', `${hits.length} secret(s) potentiel(s) détecté(s) dans les bundles`, hits.length ? 'warn' : 'info', { hits: hits.slice(0, 10) });
        for (const h of hits.slice(0, 8)) {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'critical',
            title: `Secret exposé côté client : ${h.type}`,
            description: `Détecté dans ${h.url}. Tout secret livré au navigateur est public.`,
            recommendation: 'Rotez immédiatement le secret puis déplacez les appels sensibles vers une fonction serveur.',
          } as ScanIssue);
        }
      }, limitsFor('secrets'));
    }

    // ---- DNS-over-HTTPS ----
    if (scanOptions.dns !== false) {
      await runSandbox('dns', 'DNS over HTTPS (Cloudflare) — SPF / DMARC / MX', async ({ fetch: sf }) => {
        const host2 = new URL(scan.url).hostname.split('.').slice(-2).join('.');
        const doh = async (type: string) => {
          const r = await sf(`https://cloudflare-dns.com/dns-query?name=${host2}&type=${type}`, {
            headers: { Accept: 'application/dns-json' },
          });
          if (!r.ok) return [];
          const d = await r.json().catch(() => ({}));
          return (d?.Answer || []).map((a: any) => String(a.data || ''));
        };
        const [txt, mx, dmarc] = await Promise.all([doh('TXT'), doh('MX'), (async () => {
          try {
            const r = await sf(`https://cloudflare-dns.com/dns-query?name=_dmarc.${host2}&type=TXT`, { headers: { Accept: 'application/dns-json' } });
            const d = await r.json().catch(() => ({}));
            return (d?.Answer || []).map((a: any) => String(a.data || ''));
          } catch { return []; }
        })()]);
        const hasSpf = (txt as string[]).some((t: string) => /v=spf1/i.test(t));
        const hasDmarc = (dmarc as string[]).some((t: string) => /v=DMARC1/i.test(t));
        await logStep('dns', `MX:${mx.length} TXT:${txt.length} SPF:${hasSpf} DMARC:${hasDmarc}`, 'info', { mx: mx.slice(0, 3), spf: hasSpf, dmarc: hasDmarc });
        if (mx.length > 0 && !hasSpf) {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'high',
            title: 'SPF manquant sur le domaine',
            description: 'Sans SPF, votre domaine peut être usurpé pour envoyer des emails frauduleux (spoofing).',
            recommendation: 'Publiez un enregistrement TXT "v=spf1 include:... -all" autorisant uniquement vos émetteurs légitimes.',
          } as ScanIssue);
        }
        if (mx.length > 0 && !hasDmarc) {
          issues.push({
            scan_id: scanId, category: 'security', severity: 'high',
            title: 'DMARC manquant',
            description: 'Sans politique DMARC, vous ne contrôlez pas comment les serveurs distants traitent les emails échouant SPF/DKIM.',
            recommendation: 'Publiez _dmarc.<domaine> TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@..."',
          } as ScanIssue);
        }
      }, limitsFor('dns'));
    }
  } catch (e) {
    await logStep('extreme', `Mode Extreme partiellement échoué : ${(e as Error).message}`, 'warn');
  }
}
