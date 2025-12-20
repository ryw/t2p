import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { isShippostProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';

export async function lastInputCommand(): Promise<void> {
  const cwd = process.cwd();
  const { style } = logger;

  try {
    if (!isShippostProject(cwd)) {
      throw new NotInitializedError();
    }

    const inputDir = join(cwd, 'input');

    let files: string[];
    try {
      files = readdirSync(inputDir).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
    } catch {
      logger.error('No input directory found.');
      process.exit(1);
    }

    if (files.length === 0) {
      logger.info('No transcripts in input/ directory.');
      return;
    }

    // Find the most recently added file (by creation time, fallback to mtime)
    let newest: { file: string; date: Date } | null = null;

    for (const file of files) {
      const filePath = join(inputDir, file);
      const stats = statSync(filePath);
      // Use birthtime if available, otherwise mtime
      const fileDate = stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;

      if (!newest || fileDate > newest.date) {
        newest = { file, date: fileDate };
      }
    }

    if (newest) {
      const daysAgo = Math.floor((Date.now() - newest.date.getTime()) / (1000 * 60 * 60 * 24));
      const dateStr = newest.date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Get first meaningful line as summary
      const filePath = join(inputDir, newest.file);
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const summary = lines[0] || '';
      const truncated = summary.length > 80 ? summary.slice(0, 77) + '...' : summary;

      console.log();
      console.log(`Last transcript added: ${style.bold(dateStr)}`);
      console.log(`  ${style.dim(newest.file)} ${style.dim(`(${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago)`)}`);
      if (truncated) {
        console.log(`  ${style.cyan(truncated)}`);
      }
      console.log();
    }

  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
