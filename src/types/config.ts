export type LLMProvider = 'ollama' | 'anthropic';

export type XApiTier = 'free' | 'basic';

export interface T2pConfig {
  llm: {
    provider: LLMProvider;
  };
  ollama?: {
    host: string;
    model: string;
    timeout?: number;
  };
  anthropic?: {
    apiKey?: string;
    model: string;
    maxTokens?: number;
  };
  generation: {
    postsPerTranscript?: number;
    temperature?: number;
    strategies?: {
      enabled?: boolean;
      autoSelect?: boolean;
      diversityWeight?: number;
      preferThreadFriendly?: boolean;
    };
  };
  x?: {
    clientId?: string;
    apiTier?: XApiTier;
  };
  typefully?: {
    socialSetId?: string;
  };
  blog?: {
    outputDir?: string;
  };
}

export const DEFAULT_CONFIG: T2pConfig = {
  llm: {
    provider: 'ollama',
  },
  ollama: {
    host: 'http://127.0.0.1:11434',
    model: 'llama3.1',
    timeout: 60000,
  },
  anthropic: {
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
  },
  generation: {
    postsPerTranscript: 8,
    temperature: 0.7,
    strategies: {
      enabled: true,
      autoSelect: true,
      diversityWeight: 0.7,
      preferThreadFriendly: false,
    },
  },
};
