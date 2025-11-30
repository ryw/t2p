import type { TranscriptAnalysis } from '../types/strategy.js';
import type { LLMService } from './llm-service.js';

export class ContentAnalyzer {
  constructor(
    private llm: LLMService,
    private analysisTemplate: string
  ) {}

  async analyzeTranscript(transcript: string): Promise<TranscriptAnalysis> {
    try {
      // Build analysis prompt
      const prompt = `${this.analysisTemplate}

TRANSCRIPT TO ANALYZE:
"""
${transcript}
"""

Provide your analysis as JSON:`;

      // Call LLM
      const response = await this.llm.generate(prompt);

      // Parse response
      const analysis = this.parseAnalysis(response);

      if (analysis) {
        return analysis;
      }

      // Fallback if parsing fails
      return this.getDefaultAnalysis(transcript);
    } catch (error) {
      // Fallback on error
      return this.getDefaultAnalysis(transcript);
    }
  }

  private parseAnalysis(response: string): TranscriptAnalysis | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (
        !Array.isArray(parsed.contentTypes) ||
        typeof parsed.hasPersonalStories !== 'boolean' ||
        typeof parsed.hasActionableAdvice !== 'boolean' ||
        typeof parsed.hasResourceMentions !== 'boolean' ||
        typeof parsed.hasProjectContext !== 'boolean' ||
        typeof parsed.hasStrongOpinions !== 'boolean' ||
        !parsed.length ||
        typeof parsed.characterCount !== 'number'
      ) {
        return null;
      }

      return parsed as TranscriptAnalysis;
    } catch (error) {
      return null;
    }
  }

  private getDefaultAnalysis(transcript: string): TranscriptAnalysis {
    // Provide conservative default analysis
    const charCount = transcript.length;
    let length: 'short' | 'medium' | 'long' = 'medium';

    if (charCount < 500) {
      length = 'short';
    } else if (charCount > 1500) {
      length = 'long';
    }

    // Default to permissive analysis - mark common characteristics as true
    return {
      contentTypes: ['educational', 'opinion'],
      hasPersonalStories: false,
      hasActionableAdvice: true,
      hasResourceMentions: false,
      hasProjectContext: false,
      hasStrongOpinions: true,
      length,
      characterCount: charCount,
    };
  }
}
