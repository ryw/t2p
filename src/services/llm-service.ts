/**
 * Interface for LLM service implementations
 */
export interface LLMService {
  /**
   * Check if the service is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Ensure the service is available and configured correctly
   * @throws Error if service is not available
   */
  ensureAvailable(): Promise<void>;

  /**
   * Generate text from a prompt
   * @param prompt The input prompt
   * @returns Generated text response
   */
  generate(prompt: string): Promise<string>;

  /**
   * Get the model name being used
   */
  getModelName(): string;

  /**
   * Get the temperature setting
   */
  getTemperature(): number;
}
