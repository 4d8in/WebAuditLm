// HTTP security & performance response-header checks (OWASP 2024 aligned).
// Extracted verbatim from run-scan/index.ts (Partie A.2 — no behavioral change).
import type { ScanIssue } from '../types.ts';

export function analyzeHeadersPro(headers: Record<string, string>): ScanIssue[] {
  const issues: ScanIssue[] = [];
  const headerLower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  // HSTS
  if (!headerLower['strict-transport-security']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'high',
      title: 'En-tête HSTS manquant',
      description: 'Le header Strict-Transport-Security (HSTS) n\'est pas configuré. Cela expose le site aux attaques de type "downgrade" et "man-in-the-middle".',
      recommendation: 'Ajoutez l\'en-tête: Strict-Transport-Security: max-age=63072000; includeSubDomains; preload (2 ans selon OWASP 2024)',
      fix_suggestion: 'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
    });
  } else {
    const hstsValue = headerLower['strict-transport-security'];
    const maxAgeMatch = hstsValue.match(/max-age=(\d+)/);
    if (maxAgeMatch) {
      const maxAge = parseInt(maxAgeMatch[1]);
      if (maxAge < 15768000) {
        issues.push({
          scan_id: '', category: 'security', severity: 'high',
          title: 'HSTS max-age trop court (non conforme)',
          description: `Le max-age HSTS est de ${maxAgeMatch[1]} secondes. OWASP 2024 exige minimum 6 mois (15768000s).`,
          recommendation: 'Augmentez le max-age à au moins 15768000 secondes (6 mois minimum, 63072000 recommandé pour 2 ans).',
        });
      } else if (maxAge < 63072000) {
        issues.push({
          scan_id: '', category: 'security', severity: 'medium',
          title: 'HSTS max-age sous-optimal',
          description: `Le max-age HSTS est de ${maxAgeMatch[1]} secondes. OWASP 2024 recommande 2 ans (63072000s) pour meilleure sécurité.`,
          recommendation: 'Augmentez le max-age à 63072000 secondes (2 ans) pour une sécurité optimale.',
        });
      }
    }
    if (!hstsValue.includes('includeSubDomains')) {
      issues.push({
        scan_id: '', category: 'security', severity: 'medium',
        title: 'HSTS sans includeSubDomains',
        description: 'L\'en-tête HSTS ne protège pas les sous-domaines.',
        recommendation: 'Ajoutez "includeSubDomains" à l\'en-tête HSTS pour protéger tous les sous-domaines.',
      });
    }
  }

  if (!headerLower['x-content-type-options']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'medium',
      title: 'X-Content-Type-Options manquant',
      description: 'Sans cet en-tête, le navigateur peut interpréter des fichiers de manière incorrecte (MIME sniffing).',
      recommendation: 'Ajoutez l\'en-tête: X-Content-Type-Options: nosniff',
      fix_suggestion: 'X-Content-Type-Options: nosniff',
    });
  }

  const csp = headerLower['content-security-policy'] || '';
  if (!headerLower['x-frame-options'] && !csp.includes('frame-ancestors')) {
    issues.push({
      scan_id: '', category: 'security', severity: 'high',
      title: 'Protection clickjacking manquante',
      description: 'Le site est vulnérable aux attaques de clickjacking. OWASP 2024 recommande CSP frame-ancestors (X-Frame-Options est déprécié).',
      recommendation: 'Ajoutez frame-ancestors dans CSP (méthode moderne) ou X-Frame-Options: DENY (legacy).',
      fix_suggestion: '# Méthode moderne (recommandée OWASP 2024):\nContent-Security-Policy: ...; frame-ancestors \'none\';\n\n# Méthode legacy:\nX-Frame-Options: DENY',
    });
  } else if (headerLower['x-frame-options'] && !csp.includes('frame-ancestors')) {
    issues.push({
      scan_id: '', category: 'security', severity: 'low',
      title: 'X-Frame-Options utilisé (déprécié OWASP 2024)',
      description: "X-Frame-Options est déprécié selon OWASP 2024. CSP frame-ancestors est la méthode moderne recommandée.",
      recommendation: 'Migrez vers CSP frame-ancestors et supprimez X-Frame-Options.',
      fix_suggestion: 'Remplacez X-Frame-Options par: Content-Security-Policy: ...; frame-ancestors \'none\';',
    });
  }

  if (!headerLower['content-security-policy']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'critical',
      title: 'Content-Security-Policy manquant (PRIORITÉ #1 OWASP 2024)',
      description: 'CSP est le header de sécurité prioritaire selon OWASP 2024. Il est crucial pour prévenir les attaques XSS, injection de données et clickjacking.',
      recommendation: 'Implémentez une politique CSP stricte selon OWASP 2024. Commencez par report-only pour tester, puis activez.',
      fix_suggestion: "Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    });
  } else {
    const cspVal = headerLower['content-security-policy'];
    if (cspVal.includes("'unsafe-inline'")) {
      issues.push({
        scan_id: '', category: 'security', severity: 'high',
        title: 'CSP utilise unsafe-inline (non conforme OWASP 2024)',
        description: "La CSP utilise 'unsafe-inline', ce qui réduit significativement la protection contre XSS. OWASP 2024 recommande d'éviter cette directive.",
        recommendation: "Utilisez des nonces ou hashes au lieu de 'unsafe-inline'. Exemple: script-src 'nonce-{random}' ou script-src 'sha256-{hash}'.",
      });
    }
    if (cspVal.includes("'unsafe-eval'")) {
      issues.push({
        scan_id: '', category: 'security', severity: 'high',
        title: 'CSP utilise unsafe-eval (non conforme OWASP 2024)',
        description: "La CSP utilise 'unsafe-eval', ce qui permet l'exécution de code JavaScript dynamique et réduit la sécurité.",
        recommendation: "Évitez 'unsafe-eval'. Refactorisez le code pour ne pas utiliser eval(), Function(), ou setTimeout/setInterval avec des strings.",
      });
    }
    if (!cspVal.includes("default-src") && !cspVal.includes("script-src")) {
      issues.push({
        scan_id: '', category: 'security', severity: 'medium',
        title: 'CSP configuration incomplète',
        description: 'La CSP ne définit pas de directives essentielles (default-src ou script-src).',
        recommendation: 'Configurez au minimum default-src et script-src selon les recommandations OWASP 2024.',
      });
    }
  }

  if (headerLower['x-xss-protection']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'low',
      title: 'X-XSS-Protection présent (déprécié OWASP 2024)',
      description: "L'en-tête X-XSS-Protection est déprécié selon OWASP 2024. Il peut introduire des vulnérabilités XSS dans des sites autrement sécurisés. CSP est la solution moderne.",
      recommendation: "Supprimez X-XSS-Protection et utilisez uniquement Content-Security-Policy pour la protection XSS.",
      fix_suggestion: 'Supprimez cet en-tête. Utilisez CSP à la place.',
    });
  }

  if (!headerLower['referrer-policy']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'medium',
      title: 'Referrer-Policy manquant',
      description: 'Sans politique de referrer, des informations sensibles peuvent fuiter vers des sites tiers.',
      recommendation: 'Ajoutez l\'en-tête: Referrer-Policy: strict-origin-when-cross-origin',
      fix_suggestion: 'Referrer-Policy: strict-origin-when-cross-origin',
    });
  }

  if (!headerLower['permissions-policy'] && !headerLower['feature-policy']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'low',
      title: 'Permissions-Policy manquant',
      description: 'Permissions-Policy permet de contrôler les APIs browser que le site peut utiliser.',
      recommendation: 'Configurez Permissions-Policy pour désactiver les fonctionnalités non utilisées.',
      fix_suggestion: 'Permissions-Policy: geolocation=(), microphone=(), camera=()',
    });
  }

  if (!headerLower['cross-origin-opener-policy']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'low',
      title: 'Cross-Origin-Opener-Policy manquant',
      description: 'COOP isole le contexte de navigation et protège contre certaines attaques cross-origin.',
      recommendation: 'Ajoutez: Cross-Origin-Opener-Policy: same-origin',
    });
  }

  if (!headerLower['cross-origin-resource-policy']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'low',
      title: 'Cross-Origin-Resource-Policy manquant',
      description: 'CORP empêche d\'autres sites de charger vos ressources.',
      recommendation: 'Ajoutez: Cross-Origin-Resource-Policy: same-origin',
    });
  }

  const cacheControl = headerLower['cache-control'];
  if (!cacheControl) {
    issues.push({
      scan_id: '', category: 'performance', severity: 'medium',
      title: 'Cache-Control non configuré',
      description: 'Sans politique de cache, les navigateurs ne peuvent pas optimiser le chargement.',
      recommendation: 'Configurez Cache-Control approprié: immutable pour assets versionnés, must-revalidate pour HTML.',
      fix_suggestion: 'Cache-Control: public, max-age=31536000, immutable (pour CSS/JS)\nCache-Control: no-cache, must-revalidate (pour HTML)',
    });
  }

  if (!headerLower['etag'] && !headerLower['last-modified']) {
    issues.push({
      scan_id: '', category: 'performance', severity: 'low',
      title: 'Validation de cache absente',
      description: 'Ni ETag ni Last-Modified ne sont présents pour la validation du cache.',
      recommendation: 'Configurez ETag ou Last-Modified pour permettre la revalidation conditionnelle.',
    });
  }

  const contentEncoding = headerLower['content-encoding'];
  if (!contentEncoding || (!contentEncoding.includes('gzip') && !contentEncoding.includes('br'))) {
    issues.push({
      scan_id: '', category: 'performance', severity: 'medium',
      title: 'Compression non activée',
      description: 'Le contenu n\'est pas compressé (gzip/brotli), augmentant les temps de transfert.',
      recommendation: 'Activez la compression gzip ou brotli sur votre serveur.',
    });
  }

  if (headerLower['server']) {
    const serverValue = headerLower['server'];
    if (/nginx|apache|iis|express/i.test(serverValue) && /\d/.test(serverValue)) {
      issues.push({
        scan_id: '', category: 'security', severity: 'low',
        title: 'Version du serveur exposée',
        description: `L'en-tête Server révèle des informations: "${serverValue}". Cela peut aider les attaquants.`,
        recommendation: 'Masquez ou simplifiez l\'en-tête Server pour ne pas révéler la version.',
      });
    }
  }

  if (headerLower['x-powered-by']) {
    issues.push({
      scan_id: '', category: 'security', severity: 'low',
      title: 'X-Powered-By exposé',
      description: `L'en-tête X-Powered-By révèle: "${headerLower['x-powered-by']}".`,
      recommendation: 'Supprimez l\'en-tête X-Powered-By de vos réponses.',
    });
  }

  return issues;
}
