import { Ollama } from 'ollama';
import type { T2pConfig } from '../types/config.js';
import type { LLMService } from './llm-service.js';
import { OllamaNotAvailableError, ModelNotFoundError } from '../utils/errors.js';

export class OllamaService implements LLMService {
  private client: Ollama;
  private config: T2pConfig;

  constructor(config: T2pConfig) {
    this.config = config;

    if (!config.ollama) {
      throw new Error('Ollama configuration not found in config');
    }

    this.client = new Ollama({
      host: config.ollama.host,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkModel(): Promise<boolean> {
    try {
      const models = await this.client.list();
      return models.models.some((m) => m.name.includes(this.config.ollama!.model));
    } catch (error) {
      return false;
    }
  }

  async ensureAvailable(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new OllamaNotAvailableError();
    }

    const hasModel = await this.checkModel();
    if (!hasModel) {
      throw new ModelNotFoundError(this.config.ollama!.model);
    }
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await this.client.generate({
        model: this.config.ollama!.model,
        prompt: prompt,
        options: {
          temperature: this.config.generation.temperature,
        },
      });

      return response.response;
    } catch (error) {
      if ((error as Error).message.includes('model')) {
        throw new ModelNotFoundError(this.config.ollama!.model);
      }
      throw error;
    }
  }

  getModelName(): string {
    return this.config.ollama!.model;
  }

  getTemperature(): number {
    return this.config.generation.temperature || 0.7;
  }
}
