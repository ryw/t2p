import type { BangerEvaluation } from '../types/post.js';

/**
 * Build prompt for evaluating a post's banger potential
 */
export function buildBangerEvalPrompt(bangerEvalTemplate: string, postContent: string): string {
  return `${bangerEvalTemplate}

POST TO EVALUATE:
"""
${postContent}
"""

Provide your evaluation now:`;
}

/**
 * Parse banger evaluation response from LLM
 */
export function parseBangerEval(response: string): BangerEvaluation | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return null;
    }

    const evaluation = JSON.parse(jsonMatch[0]) as BangerEvaluation;

    // Validate structure
    if (
      typeof evaluation.score !== 'number' ||
      !evaluation.breakdown ||
      typeof evaluation.reasoning !== 'string'
    ) {
      return null;
    }

    // Clamp score to 1-99 range
    evaluation.score = Math.max(1, Math.min(99, evaluation.score));

    return evaluation;
  } catch (error) {
    return null;
  }
}
