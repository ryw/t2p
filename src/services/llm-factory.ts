import type { T2pConfig } from '../types/config.js';
import type { LLMService } from './llm-service.js';
import { OllamaService } from './ollama.js';
import { AnthropicService } from './anthropic.js';

/**
 * Factory function to create the appropriate LLM service based on config
 */
export function createLLMService(config: T2pConfig): LLMService {
  const provider = config.llm.provider;

  switch (provider) {
    case 'ollama':
      return new OllamaService(config);
    case 'anthropic':
      return new AnthropicService(config);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
