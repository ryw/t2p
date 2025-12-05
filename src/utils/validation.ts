import { existsSync } from 'fs';
import { join } from 'path';

export function isShippostProject(cwd: string = process.cwd()): boolean {
  const requiredPaths = [
    join(cwd, 'input'),
    join(cwd, 'prompts'),
    join(cwd, 'prompts', 'style.md'),
    join(cwd, 'prompts', 'work.md'),
    join(cwd, '.shippostrc.json'),
  ];

  return requiredPaths.every((path) => existsSync(path));
}

export function validateConfig(config: unknown): boolean {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const c = config as Record<string, unknown>;

  // Check for llm.provider field (new format)
  if (c.llm && typeof c.llm === 'object') {
    const llm = c.llm as Record<string, unknown>;

    if (typeof llm.provider !== 'string' || !['ollama', 'anthropic'].includes(llm.provider as string)) {
      return false;
    }

    // Validate provider-specific config
    if (llm.provider === 'ollama') {
      if (!c.ollama || typeof c.ollama !== 'object') {
        return false;
      }
      const ollama = c.ollama as Record<string, unknown>;
      if (typeof ollama.host !== 'string' || typeof ollama.model !== 'string') {
        return false;
      }
    } else if (llm.provider === 'anthropic') {
      if (!c.anthropic || typeof c.anthropic !== 'object') {
        return false;
      }
      const anthropic = c.anthropic as Record<string, unknown>;
      if (typeof anthropic.model !== 'string') {
        return false;
      }
    }

    return true;
  }

  // Backward compatibility: old format with just ollama
  if (c.ollama && typeof c.ollama === 'object') {
    const ollama = c.ollama as Record<string, unknown>;
    if (typeof ollama.host === 'string' && typeof ollama.model === 'string') {
      return true;
    }
  }

  return false;
}
