import { join } from 'path';
import { FileSystemService } from '../services/file-system.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { isT2pProject } from '../utils/validation.js';

const STYLE_TEMPLATE = `# Posting Style Guide

## Voice & Tone
- [Describe your posting voice: casual, professional, humorous, etc.]
- [Key phrases or expressions you use]

## Brand Guidelines
- [Your personal or company brand values]
- [Topics you focus on]
- [Topics you avoid]

## Format Preferences
- [Preferred post length: short and punchy, detailed threads, etc.]
- [Emoji usage: frequent, occasional, none]
- [Hashtag strategy: none, 1-2 relevant, many]

## Examples of Your Best Posts
1. [Example post 1 that represents your style well]
2. [Example post 2]
3. [Example post 3]

## Target Audience
- [Who you're writing for]
- [What they care about]
- [How they prefer to consume content]
`;

const WORK_TEMPLATE = `# Post Generation Instructions

## Task
Generate social media post ideas from the provided transcript or notes.

## Process
1. Read the entire transcript carefully
2. Identify key insights, quotes, or learnings
3. Extract quotable moments or interesting perspectives
4. Consider multiple angles or takes on the same content

## Output Requirements
- Generate 3-5 post ideas per transcript
- Each post should be self-contained and understandable without context
- Posts should follow the style guide in style.md
- Focus on value: insights, learnings, or interesting perspectives
- Avoid direct transcript copying - transform into engaging posts

## Post Structure
- Hook: Start with something attention-grabbing
- Body: The main insight or story
- Call-to-action or thought-provoking ending (optional)

## Quality Criteria
- Is it interesting to your target audience?
- Does it provide value (insight, entertainment, education)?
- Is it in your authentic voice?
- Would you actually post this?
`;

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
    logger.info('3. Add transcript files to input/');
    logger.info('4. Run: t2p work');
  } catch (error) {
    logger.error(`Initialization failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
