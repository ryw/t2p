import Anthropic from '@anthropic-ai/sdk';
import type { T2pConfig } from '../types/config.js';
import type { LLMService } from './llm-service.js';

export class AnthropicService implements LLMService {
  private client: Anthropic;
  private config: T2pConfig;

  constructor(config: T2pConfig) {
    this.config = config;

    // Get API key from env or config
    const apiKey = process.env.ANTHROPIC_API_KEY || config.anthropic?.apiKey;

    if (!apiKey) {
      throw new Error(
        'Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or add to config.'
      );
    }

    this.client = new Anthropic({
      apiKey,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test API key by making a minimal request
      await this.client.messages.create({
        model: this.getModelName(),
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async ensureAvailable(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'Anthropic API is not available. Check your API key and network connection.'
      );
    }
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.getModelName(),
        max_tokens: this.config.anthropic?.maxTokens || 4096,
        temperature: this.config.generation.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text from response
      const textContent = response.content.find((block) => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        return textContent.text;
      }

      throw new Error('No text content in Anthropic response');
    } catch (error) {
      if ((error as Error).message.includes('model')) {
        throw new Error(`Anthropic model not found: ${this.getModelName()}`);
      }
      throw error;
    }
  }

  getModelName(): string {
    return this.config.anthropic?.model || 'claude-3-5-sonnet-20241022';
  }

  getTemperature(): number {
    return this.config.generation.temperature || 0.7;
  }
}
