// Global weighted score. Weights preserved verbatim from the original
// run-scan orchestrator (Partie A.3 extraction — no behavior change).
import type { CategoryScores } from './category.ts';

export const GLOBAL_WEIGHTS = {
  seo: 0.30,
  performance: 0.25,
  accessibility: 0.20,
  security: 0.15,
  broken_links: 0.10,
} as const;

export function calculateGlobalScore(scores: CategoryScores): number {
  return Math.round(
    scores.seo_score * GLOBAL_WEIGHTS.seo +
    scores.performance_score * GLOBAL_WEIGHTS.performance +
    scores.accessibility_score * GLOBAL_WEIGHTS.accessibility +
    scores.security_score * GLOBAL_WEIGHTS.security +
    scores.broken_links_score * GLOBAL_WEIGHTS.broken_links,
  );
}
