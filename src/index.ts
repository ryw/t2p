#!/usr/bin/env node

// Load environment variables from .env file
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initCommand } from './commands/init.js';
import { workCommand } from './commands/work.js';
import { postsCommand } from './commands/posts.js';
import { analyzeXCommand } from './commands/analyze-x.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('t2p')
  .description('Process meeting transcripts and other notes into social media post drafts')
  .version(packageJson.version);

program
  .command('init')
  .description('Initialize a new t2p project in the current directory')
  .action(initCommand);

program
  .command('work')
  .description('Process input files and generate social media posts')
  .option('-m, --model <model>', 'Override Ollama model')
  .option('-v, --verbose', 'Verbose output')
  .option('-f, --force', 'Force reprocessing of all files (bypass tracking)')
  .option('-c, --count <number>', 'Number of posts to generate per file', parseInt)
  .option('-s, --strategy <id>', 'Use specific strategy by ID')
  .option('--strategies <ids>', 'Use multiple strategies (comma-separated)')
  .option('--list-strategies', 'List all available strategies')
  .option('--category <category>', 'Filter strategies by category (with --list-strategies)')
  .option('--no-strategies', 'Disable strategy-based generation (use legacy mode)')
  .action(workCommand);

program
  .command('posts')
  .description('View recently generated posts in human-readable format')
  .option('-n, --count <number>', 'Number of posts to show (default: 10)', parseInt)
  .option('--strategy <name>', 'Filter by strategy name or ID')
  .option('--min-score <score>', 'Show posts with banger score >= N', parseInt)
  .option('--source <text>', 'Filter by source file')
  .action(postsCommand);

program
  .command('analyze-x')
  .description('Generate style guide from your X (Twitter) posts')
  .option('--count <n>', 'Number of tweets to fetch (max 100)', parseInt, 33)
  .option('--overwrite', 'Overwrite existing style-from-analysis.md without prompting')
  .option('--setup', 'Reconfigure X API credentials')
  .action(analyzeXCommand);

program.parse();
