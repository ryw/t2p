import { join, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { FileSystemService } from '../services/file-system.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { isT2pProject } from '../utils/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load template files from src/templates/
const STYLE_TEMPLATE = readFileSync(join(__dirname, '../templates/style.md'), 'utf-8');
const WORK_TEMPLATE = readFileSync(join(__dirname, '../templates/work.md'), 'utf-8');
const SYSTEM_TEMPLATE = readFileSync(join(__dirname, '../templates/system.md'), 'utf-8');
const ANALYSIS_TEMPLATE = readFileSync(join(__dirname, '../templates/analysis.md'), 'utf-8');
const BANGER_EVAL_TEMPLATE = readFileSync(join(__dirname, '../templates/banger-eval.md'), 'utf-8');

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();
  const fs = new FileSystemService(cwd);

  // Check if already initialized
  if (isT2pProject(cwd)) {
    logger.error('Already initialized! This directory is already a t2p project.');
    process.exit(1);
  }

  try {
    // Create directories
    fs.ensureDirectory(join(cwd, 'input'));
    logger.success('Created directory: input/');

    fs.ensureDirectory(join(cwd, 'prompts'));
    logger.success('Created directory: prompts/');

    // Create prompt templates
    fs.writeFile(join(cwd, 'prompts', 'style.md'), STYLE_TEMPLATE);
    logger.success('Created file: prompts/style.md');

    fs.writeFile(join(cwd, 'prompts', 'work.md'), WORK_TEMPLATE);
    logger.success('Created file: prompts/work.md');

    fs.writeFile(join(cwd, 'prompts', 'system.md'), SYSTEM_TEMPLATE);
    logger.success('Created file: prompts/system.md');

    fs.writeFile(join(cwd, 'prompts', 'analysis.md'), ANALYSIS_TEMPLATE);
    logger.success('Created file: prompts/analysis.md');

    fs.writeFile(join(cwd, 'prompts', 'banger-eval.md'), BANGER_EVAL_TEMPLATE);
    logger.success('Created file: prompts/banger-eval.md');

    // Create empty posts.jsonl
    fs.writeFile(join(cwd, 'posts.jsonl'), '');
    logger.success('Created file: posts.jsonl');

    // Create default config
    fs.saveConfig(DEFAULT_CONFIG);
    logger.success('Created configuration: .t2prc.json');

    // Success message
    logger.blank();
    logger.info('t2p initialized successfully!');
    logger.blank();
    logger.info('Next steps:');
    logger.info('1. Edit prompts/style.md to define your posting style');
    logger.info('2. Edit prompts/work.md to customize post generation');
    logger.info('3. (Optional) Edit prompts/system.md, prompts/analysis.md, and prompts/banger-eval.md for advanced customization');
    logger.info('4. Add transcript files to input/');
    logger.info('5. Run: t2p work');
  } catch (error) {
    logger.error(`Initialization failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
