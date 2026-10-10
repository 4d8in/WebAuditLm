// Static "pro tips" appended to every scan. Extracted from run-scan/index.ts.
import type { ScanIssue } from '../types.ts';

export function generateProIssues(scanId: string): ScanIssue[] {
  return [
    {
      scan_id: scanId, category: 'seo', severity: 'high',
      title: 'Audit SEO complet recommandé',
      description: 'Vérifiez les balises title, meta description, H1, canonical, Open Graph et données structurées.',
      recommendation: 'Utilisez Google Search Console et un outil comme Screaming Frog pour un audit approfondi.',
    },
    {
      scan_id: scanId, category: 'performance', severity: 'high',
      title: 'Optimisation Core Web Vitals',
      description: 'Les métriques LCP, FID/INP et CLS sont essentielles pour le ranking Google.',
      recommendation: 'Testez avec PageSpeed Insights et optimisez: images WebP, lazy loading, cache, CDN.',
    },
    {
      scan_id: scanId, category: 'accessibility', severity: 'medium',
      title: 'Conformité WCAG 2.1 AA',
      description: 'Assurez la conformité aux normes d\'accessibilité pour tous les utilisateurs.',
      recommendation: 'Testez avec WAVE, axe DevTools. Vérifiez contraste, labels, navigation clavier.',
    },
    {
      scan_id: scanId, category: 'security', severity: 'high',
      title: 'En-têtes de sécurité HTTP',
      description: 'Les en-têtes HSTS, CSP, X-Frame-Options protègent contre les attaques courantes.',
      recommendation: 'Configurez tous les en-têtes de sécurité sur votre serveur web.',
    },
    {
      scan_id: scanId, category: 'seo', severity: 'medium',
      title: 'Stratégie de maillage interne',
      description: 'Un bon maillage interne distribue l\'autorité et améliore la découvrabilité.',
      recommendation: 'Créez une architecture en silo avec des liens contextuels pertinents.',
    },
  ];
}
