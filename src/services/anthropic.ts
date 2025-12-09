import Anthropic from '@anthropic-ai/sdk';
import type { T2pConfig } from '../types/config.js';
import type { LLMService } from './llm-service.js';

export class AnthropicService implements LLMService {
  private client: Anthropic;
  private config: T2pConfig;
  private apiKey: string;
  private lastError: Error | null = null;

  constructor(config: T2pConfig) {
    this.config = config;

    // Get API key from env or config
    this.apiKey = process.env.ANTHROPIC_API_KEY || config.anthropic?.apiKey || '';

    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or add to config.'
      );
    }

    // Validate API key format
    if (!this.apiKey.startsWith('sk-ant-')) {
      throw new Error(
        `Invalid Anthropic API key format. Key should start with 'sk-ant-'. Got: ${this.apiKey.substring(0, 10)}...`
      );
    }

    this.client = new Anthropic({
      apiKey: this.apiKey,
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
      // Store the error for better reporting
      this.lastError = error as Error;
      return false;
    }
  }

  async ensureAvailable(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      const error = this.lastError;
      let errorMsg = 'Anthropic API is not available.\n';

      if (error) {
        const errorStr = error.toString();

        if (errorStr.includes('401') || errorStr.includes('authentication')) {
          errorMsg += '✗ Authentication failed: Invalid API key\n';
          errorMsg += `  - Check your API key in .env file or environment\n`;
          errorMsg += `  - Current key starts with: ${this.apiKey.substring(0, 15)}...\n`;
        } else if (errorStr.includes('model')) {
          errorMsg += `✗ Model not found: ${this.getModelName()}\n`;
          errorMsg += '  - Check your model name in .shippostrc.json\n';
        } else if (errorStr.includes('network') || errorStr.includes('ENOTFOUND')) {
          errorMsg += '✗ Network error: Cannot reach Anthropic API\n';
          errorMsg += '  - Check your internet connection\n';
        } else {
          errorMsg += `✗ Error: ${error.message}\n`;
        }
      }

      throw new Error(errorMsg);
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
