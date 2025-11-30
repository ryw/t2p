import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { FileSystemService } from '../services/file-system.js';
import { OllamaService } from '../services/ollama.js';
import { logger } from '../utils/logger.js';
import { isT2pProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';
import { buildBangerEvalPrompt, parseBangerEval } from '../utils/banger-eval.js';
import type { PostGenerationResult } from '../types/post.js';

interface WorkOptions {
  model?: string;
  verbose?: boolean;
  force?: boolean;
}

function buildPrompt(systemPrompt: string, styleGuide: string, workInstructions: string, transcript: string): string {
  return `${systemPrompt}

STYLE GUIDE:
${styleGuide}

INSTRUCTIONS:
${workInstructions}

TRANSCRIPT TO PROCESS:
${transcript}`;
}

function parsePostsFromResponse(response: string): PostGenerationResult[] {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    return parsed.filter((item) => item && typeof item.content === 'string');
  } catch (error) {
    logger.error(`Failed to parse LLM response: ${(error as Error).message}`);
    logger.info('Raw response:');
    logger.info(response.substring(0, 500));
    return [];
  }
}

function findInputFiles(inputDir: string): string[] {
  try {
    const files = readdirSync(inputDir);
    const textFiles: string[] = [];

    for (const file of files) {
      const filePath = join(inputDir, file);
      const stats = statSync(filePath);

      if (stats.isFile() && (file.endsWith('.txt') || file.endsWith('.md'))) {
        textFiles.push(filePath);
      }
    }

    return textFiles;
  } catch (error) {
    logger.error(`Failed to read input directory: ${(error as Error).message}`);
    return [];
  }
}

export async function workCommand(options: WorkOptions): Promise<void> {
  const cwd = process.cwd();

  try {
    const fs = new FileSystemService(cwd);

    // Step 1: Validate environment
    logger.section('[1/3] Checking environment...');

    if (!isT2pProject(cwd)) {
      throw new NotInitializedError();
    }

  // Load config
  const config = fs.loadConfig();

  // Override model if specified
  if (options.model) {
    config.ollama.model = options.model;
  }

  // Initialize Ollama service
  const ollama = new OllamaService(config);

  // Check Ollama availability
  await ollama.ensureAvailable();
  logger.success(`Connected to Ollama (model: ${ollama.getModelName()})`);

  // Step 2: Load context
  logger.section('[2/3] Loading context...');

  const systemPrompt = fs.loadPrompt('system.md');
  logger.success('Loaded system prompt');

  const styleGuide = fs.loadPrompt('style.md');
  logger.success('Loaded style guide');

  const workInstructions = fs.loadPrompt('work.md');
  logger.success('Loaded work instructions');

  const bangerEvalTemplate = fs.loadPrompt('banger-eval.md');
  logger.success('Loaded banger evaluation prompt');

  const inputFiles = findInputFiles(join(cwd, 'input'));
  if (inputFiles.length === 0) {
    logger.error('No input files found in input/ directory');
    logger.info('Add .txt or .md files to input/ and try again');
    process.exit(1);
  }

  logger.success(`Found ${inputFiles.length} input file${inputFiles.length === 1 ? '' : 's'}`);

  // Load state
  let state = fs.loadState();
  if (options.force) {
    logger.info('Force mode: reprocessing all files');
  }

  // Step 3: Process files
  logger.section('[3/3] Processing files...');

  let totalProcessed = 0;
  let totalGenerated = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  for (const filePath of inputFiles) {
    const relativePath = relative(cwd, filePath);
    logger.step(relativePath);

    // Check if file was already processed (unless --force is used)
    if (!options.force && fs.isFileProcessed(filePath, state)) {
      logger.info('  Skipped (already processed)');
      totalSkipped++;
      continue;
    }

    try {
      // Read transcript
      const transcript = readFileSync(filePath, 'utf-8');

      if (transcript.trim().length === 0) {
        logger.info('  Skipped (empty file)');
        continue;
      }

      // Build prompt
      const prompt = buildPrompt(systemPrompt, styleGuide, workInstructions, transcript);

      if (options.verbose) {
        logger.info(`  Prompt length: ${prompt.length} characters`);
      }

      // Generate posts
      const response = await ollama.generate(prompt);

      if (options.verbose) {
        logger.info(`  Response length: ${response.length} characters`);
      }

      // Parse response
      const posts = parsePostsFromResponse(response);

      if (posts.length === 0) {
        logger.info('  Generated 0 posts (parsing failed)');
        totalErrors++;
        continue;
      }

      // Evaluate and save posts
      for (const postData of posts) {
        const post = fs.createPost(
          relativePath,
          postData.content,
          ollama.getModelName(),
          ollama.getTemperature()
        );

        // Evaluate banger potential
        try {
          const evalPrompt = buildBangerEvalPrompt(bangerEvalTemplate, postData.content);
          const evalResponse = await ollama.generate(evalPrompt);
          const evaluation = parseBangerEval(evalResponse);

          if (evaluation) {
            post.metadata.bangerScore = evaluation.score;
            post.metadata.bangerEvaluation = evaluation;
          }
        } catch (evalError) {
          // Continue without score if evaluation fails
          if (options.verbose) {
            logger.info(`    Failed to evaluate banger score: ${(evalError as Error).message}`);
          }
        }

        fs.appendPost(post);
      }

      logger.info(`  Generated ${posts.length} posts`);
      totalProcessed++;
      totalGenerated += posts.length;

      // Mark file as processed
      state = fs.markFileProcessed(filePath, posts.length, state);
    } catch (error) {
      logger.error(`  Failed: ${(error as Error).message}`);
      totalErrors++;
    }
  }

  // Save state
  fs.saveState(state);

  // Summary
  logger.blank();
  logger.success('Complete!');
  logger.blank();
  logger.info('Summary:');
  logger.info(`- Files processed: ${totalProcessed}`);
  if (totalSkipped > 0) {
    logger.info(`- Files skipped: ${totalSkipped} (already processed)`);
  }
  logger.info(`- Posts generated: ${totalGenerated}`);
  if (totalErrors > 0) {
    logger.info(`- Errors: ${totalErrors}`);
  }
  logger.info(`- Posts saved to: posts.jsonl`);

  if (totalGenerated > 0) {
    logger.blank();
    logger.info('Next steps:');
    logger.info('- Review posts in posts.jsonl');
    logger.info('- Future: Run `t2p stage` to publish (coming soon)');
  }
  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
