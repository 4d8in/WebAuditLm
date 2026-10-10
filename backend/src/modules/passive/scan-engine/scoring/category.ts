// Category score = 100 minus weighted severity deductions, clamped to [20, 100].
// Deduction weights preserved verbatim from the original run-scan orchestrator
// (Partie A.3 extraction — no behavior change).
import type { ScanIssue } from '../types.ts';

export type IssueCategory = ScanIssue['category'];
export type IssueSeverity = ScanIssue['severity'];

export const SEVERITY_DEDUCTIONS: Record<IssueSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

export const MIN_CATEGORY_SCORE = 20;
export const MAX_CATEGORY_SCORE = 100;

export function calculateCategoryScore(
  issues: ScanIssue[],
  category: IssueCategory,
): number {
  const deduction = issues
    .filter(i => i.category === category)
    .reduce((acc, i) => acc + (SEVERITY_DEDUCTIONS[i.severity] ?? 0), 0);
  return Math.max(MIN_CATEGORY_SCORE, MAX_CATEGORY_SCORE - deduction);
}

export interface CategoryScores {
  performance_score: number;
  seo_score: number;
  accessibility_score: number;
  security_score: number;
  broken_links_score: number;
}

export function calculateAllCategoryScores(issues: ScanIssue[]): CategoryScores {
  return {
    performance_score: calculateCategoryScore(issues, 'performance'),
    seo_score: calculateCategoryScore(issues, 'seo'),
    accessibility_score: calculateCategoryScore(issues, 'accessibility'),
    security_score: calculateCategoryScore(issues, 'security'),
    broken_links_score: calculateCategoryScore(issues, 'broken_links'),
  };
}
