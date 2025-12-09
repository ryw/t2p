import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Post } from '../types/post.js';
import type { T2pConfig } from '../types/config.js';
import type { T2pState, ProcessedFileInfo } from '../types/state.js';
import type { ContentStrategy } from '../types/strategy.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import { FileSystemError, ConfigError, NotInitializedError } from '../utils/errors.js';
import { validateConfig } from '../utils/validation.js';

export class FileSystemService {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  loadConfig(): T2pConfig {
    const configPath = join(this.cwd, '.shippostrc.json');

    if (!existsSync(configPath)) {
      throw new NotInitializedError();
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      if (!validateConfig(config)) {
        throw new ConfigError('Invalid configuration format');
      }

      // Migrate old config format to new format
      let migratedConfig = { ...config };
      if (!config.llm && config.ollama) {
        // Old format detected - migrate to new format
        migratedConfig = {
          llm: {
            provider: 'ollama',
          },
          ...config,
        };
      }

      return { ...DEFAULT_CONFIG, ...migratedConfig };
    } catch (error) {
      if (error instanceof NotInitializedError || error instanceof ConfigError) {
        throw error;
      }
      throw new FileSystemError(`Failed to load config: ${(error as Error).message}`);
    }
  }

  saveConfig(config: T2pConfig): void {
    const configPath = join(this.cwd, '.shippostrc.json');

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Failed to save config: ${(error as Error).message}`);
    }
  }

  loadPrompt(filename: 'style.md' | 'work.md' | 'system.md' | 'analysis.md' | 'banger-eval.md' | 'content-analysis.md' | 'reply.md'): string {
    const promptPath = join(this.cwd, 'prompts', filename);

    if (!existsSync(promptPath)) {
      throw new NotInitializedError();
    }

    try {
      return readFileSync(promptPath, 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Failed to load prompt ${filename}: ${(error as Error).message}`);
    }
  }

  loadStrategies(): ContentStrategy[] {
    const strategiesPath = join(this.cwd, 'strategies.json');

    if (!existsSync(strategiesPath)) {
      // Return empty array if strategies file doesn't exist (backward compat)
      return [];
    }

    try {
      const content = readFileSync(strategiesPath, 'utf-8');
      const strategies: ContentStrategy[] = JSON.parse(content);

      if (!Array.isArray(strategies)) {
        throw new Error('Strategies file must contain a JSON array');
      }

      return strategies;
    } catch (error) {
      throw new FileSystemError(`Failed to load strategies: ${(error as Error).message}`);
    }
  }

  appendPost(post: Post): void {
    const postsPath = join(this.cwd, 'posts.jsonl');

    try {
      const line = JSON.stringify(post) + '\n';
      appendFileSync(postsPath, line, 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Failed to append post: ${(error as Error).message}`);
    }
  }

  readPosts(): Post[] {
    const postsPath = join(this.cwd, 'posts.jsonl');

    if (!existsSync(postsPath)) {
      return [];
    }

    try {
      const content = readFileSync(postsPath, 'utf-8');
      const lines = content.trim().split('\n').filter((line) => line.length > 0);

      return lines.map((line) => JSON.parse(line) as Post);
    } catch (error) {
      throw new FileSystemError(`Failed to read posts: ${(error as Error).message}`);
    }
  }

  writePosts(posts: Post[]): void {
    const postsPath = join(this.cwd, 'posts.jsonl');

    try {
      const content = posts.map((post) => JSON.stringify(post)).join('\n') + '\n';
      writeFileSync(postsPath, content, 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Failed to write posts: ${(error as Error).message}`);
    }
  }

  createPost(sourceFile: string, content: string, model: string, temperature: number): Post {
    return {
      id: randomUUID(),
      sourceFile,
      content,
      metadata: {
        model,
        temperature,
      },
      timestamp: new Date().toISOString(),
      status: 'new',
    };
  }

  ensureDirectory(path: string): void {
    if (!existsSync(path)) {
      try {
        mkdirSync(path, { recursive: true });
      } catch (error) {
        throw new FileSystemError(`Failed to create directory ${path}: ${(error as Error).message}`);
      }
    }
  }

  writeFile(path: string, content: string): void {
    try {
      writeFileSync(path, content, 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Failed to write file ${path}: ${(error as Error).message}`);
    }
  }

  fileExists(path: string): boolean {
    return existsSync(path);
  }

  loadState(): T2pState {
    const statePath = join(this.cwd, '.shippost-state.json');

    if (!existsSync(statePath)) {
      return { processedFiles: {} };
    }

    try {
      const content = readFileSync(statePath, 'utf-8');
      return JSON.parse(content) as T2pState;
    } catch (error) {
      throw new FileSystemError(`Failed to load state: ${(error as Error).message}`);
    }
  }

  saveState(state: T2pState): void {
    const statePath = join(this.cwd, '.shippost-state.json');

    try {
      writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Failed to save state: ${(error as Error).message}`);
    }
  }

  isFileProcessed(filePath: string, state: T2pState): boolean {
    const fileInfo = state.processedFiles[filePath];
    if (!fileInfo) {
      return false;
    }

    // Check if file has been modified since last processing
    try {
      const stats = statSync(filePath);
      const currentModifiedAt = stats.mtime.toISOString();
      return fileInfo.modifiedAt === currentModifiedAt;
    } catch (error) {
      // If we can't stat the file, consider it unprocessed
      return false;
    }
  }

  markFileProcessed(filePath: string, postsGenerated: number, state: T2pState): T2pState {
    try {
      const stats = statSync(filePath);
      const modifiedAt = stats.mtime.toISOString();

      return {
        ...state,
        processedFiles: {
          ...state.processedFiles,
          [filePath]: {
            path: filePath,
            processedAt: new Date().toISOString(),
            modifiedAt,
            postsGenerated,
          },
        },
      };
    } catch (error) {
      throw new FileSystemError(`Failed to mark file as processed: ${(error as Error).message}`);
    }
  }
}
