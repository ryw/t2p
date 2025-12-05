export class ShippostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShippostError';
  }
}

export class OllamaNotAvailableError extends ShippostError {
  constructor() {
    super(
      'Ollama is not available. Please ensure Ollama is running.\n\nInstall: https://ollama.ai\nStart: ollama serve'
    );
    this.name = 'OllamaNotAvailableError';
  }
}

export class NotInitializedError extends ShippostError {
  constructor() {
    super('Not a shippost project. Run: ship init');
    this.name = 'NotInitializedError';
  }
}

export class ModelNotFoundError extends ShippostError {
  constructor(model: string) {
    super(`Model '${model}' not found. Run: ollama pull ${model}`);
    this.name = 'ModelNotFoundError';
  }
}

export class ConfigError extends ShippostError {
  constructor(message: string) {
    super(`Configuration error: ${message}`);
    this.name = 'ConfigError';
  }
}

export class FileSystemError extends ShippostError {
  constructor(message: string) {
    super(`File system error: ${message}`);
    this.name = 'FileSystemError';
  }
}
