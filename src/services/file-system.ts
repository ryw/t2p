import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Post } from '../types/post.js';
import type { T2pConfig } from '../types/config.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import { FileSystemError, ConfigError, NotInitializedError } from '../utils/errors.js';
import { validateConfig } from '../utils/validation.js';

export class FileSystemService {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  loadConfig(): T2pConfig {
    const configPath = join(this.cwd, '.t2prc.json');

    if (!existsSync(configPath)) {
      throw new NotInitializedError();
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      if (!validateConfig(config)) {
        throw new ConfigError('Invalid configuration format');
      }

      return { ...DEFAULT_CONFIG, ...config };
    } catch (error) {
      if (error instanceof NotInitializedError || error instanceof ConfigError) {
        throw error;
      }
      throw new FileSystemError(`Failed to load config: ${(error as Error).message}`);
    }
  }

  saveConfig(config: T2pConfig): void {
    const configPath = join(this.cwd, '.t2prc.json');

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      throw new FileSystemError(`Failed to save config: ${(error as Error).message}`);
    }
  }

  loadPrompt(filename: 'style.md' | 'work.md' | 'system.md' | 'analysis.md' | 'banger-eval.md'): string {
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
      status: 'draft',
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
}
