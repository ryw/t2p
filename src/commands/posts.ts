import { FileSystemService } from '../services/file-system.js';
import { logger } from '../utils/logger.js';
import { isShippostProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';
import { createLLMService } from '../services/llm-factory.js';
import { buildBangerEvalPrompt, parseBangerEval } from '../utils/banger-eval.js';
import { formatTimestamp } from '../utils/format.js';
import type { Post } from '../types/post.js';

interface PostsOptions {
  count?: number;
  strategy?: string;
  minScore?: number;
  source?: string;
  eval?: boolean;
}

function displayPost(post: Post, index: number, total: number): void {
  const counter = `[${index + 1}/${total}]`;

  logger.blank();
  logger.info(`${counter} Post ID: ${post.id}`);

  // Metadata line
  const metadata: string[] = [];
  if (post.metadata.strategy) {
    metadata.push(`Strategy: ${post.metadata.strategy.name}`);
  }
  if (post.metadata.bangerScore) {
    const score = post.metadata.bangerScore;
    const emoji = score >= 8 ? '🔥' : score >= 6 ? '✨' : '📝';
    metadata.push(`${emoji} Banger: ${score}/10`);
  }
  metadata.push(`Model: ${post.metadata.model}`);
  metadata.push(`Created: ${formatTimestamp(post.timestamp)}`);

  logger.info(`  ${metadata.join(' • ')}`);

  if (post.sourceFile) {
    logger.info(`  Source: ${post.sourceFile}`);
  }

  // Post content
  logger.info('  ' + '─'.repeat(70));
  const lines = post.content.split('\n');
  lines.forEach((line) => {
    logger.info(`  ${line}`);
  });
  logger.info('  ' + '─'.repeat(70));

  // Optional: Show banger evaluation reasoning in very verbose mode
  if (post.metadata.bangerEvaluation?.reasoning) {
    logger.info(`  💭 Evaluation: ${post.metadata.bangerEvaluation.reasoning}`);
  }
}

async function evaluateMissingScores(
  cwd: string,
  fs: FileSystemService,
  posts: Post[]
): Promise<void> {
  const postsWithoutScore = posts.filter((p) => !p.metadata.bangerScore);

  if (postsWithoutScore.length === 0) {
    logger.success('All posts already have banger scores!');
    return;
  }

  logger.blank();
  logger.info(`Found ${postsWithoutScore.length} posts without banger scores`);
  logger.info('Evaluating...');
  logger.blank();

  // Load config and create LLM service
  const config = fs.loadConfig();
  const llm = createLLMService(config);

  // Load banger eval prompt
  let bangerEvalTemplate: string;
  try {
    bangerEvalTemplate = fs.loadPrompt('banger-eval.md');
  } catch {
    logger.error('Missing prompts/banger-eval.md - run ship init to create it');
    return;
  }

  let evaluated = 0;
  let failed = 0;

  for (const post of postsWithoutScore) {
    const progress = `[${evaluated + failed + 1}/${postsWithoutScore.length}]`;

    try {
      const evalPrompt = buildBangerEvalPrompt(bangerEvalTemplate, post.content);
      const evalResponse = await llm.generate(evalPrompt);
      const evaluation = parseBangerEval(evalResponse);

      if (evaluation) {
        post.metadata.bangerScore = evaluation.score;
        post.metadata.bangerEvaluation = evaluation;
        evaluated++;

        const scoreEmoji = evaluation.score >= 70 ? '🔥' : evaluation.score >= 50 ? '✨' : '📝';
        logger.success(`${progress} ${scoreEmoji} Score: ${evaluation.score}/99`);

        // Show snippet of post
        const snippet = post.content.substring(0, 60).replace(/\n/g, ' ');
        logger.info(`    "${snippet}..."`);
      } else {
        failed++;
        logger.error(`${progress} Failed to parse evaluation`);
      }
    } catch (error) {
      failed++;
      logger.error(`${progress} Error: ${(error as Error).message}`);
    }
  }

  // Rewrite posts.jsonl with updated scores
  if (evaluated > 0) {
    fs.writePosts(posts);
    logger.blank();
    logger.success(`Updated ${evaluated} posts with banger scores`);
  }

  if (failed > 0) {
    logger.error(`Failed to evaluate ${failed} posts`);
  }

  // Show summary stats
  const allScored = posts.filter((p) => p.metadata.bangerScore);
  if (allScored.length > 0) {
    const avgScore =
      allScored.reduce((sum, p) => sum + (p.metadata.bangerScore || 0), 0) / allScored.length;
    logger.blank();
    logger.info(`📊 Average banger score: ${avgScore.toFixed(1)}/99`);

    const highQuality = allScored.filter((p) => (p.metadata.bangerScore || 0) >= 70);
    logger.info(`🔥 High potential posts (70+): ${highQuality.length}`);
  }
}

export async function postsCommand(options: PostsOptions): Promise<void> {
  const cwd = process.cwd();
  const fs = new FileSystemService(cwd);

  try {
    // Check if initialized
    if (!isShippostProject(cwd)) {
      throw new NotInitializedError();
    }

    // Load all posts
    let posts = fs.readPosts();

    if (posts.length === 0) {
      logger.info('No posts found. Run `ship work` to generate posts.');
      return;
    }

    // Handle --eval flag: evaluate posts missing banger scores
    if (options.eval) {
      await evaluateMissingScores(cwd, fs, posts);
      return;
    }

    // Apply filters
    if (options.strategy) {
      const strategy = options.strategy;
      posts = posts.filter(
        (p) =>
          p.metadata.strategy?.id === strategy ||
          p.metadata.strategy?.name.toLowerCase().includes(strategy.toLowerCase())
      );

      if (posts.length === 0) {
        logger.error(`No posts found with strategy: ${strategy}`);
        logger.info('Run `ship work --list-strategies` to see available strategies');
        return;
      }
    }

    if (options.minScore !== undefined) {
      const minScore = options.minScore;
      posts = posts.filter((p) => (p.metadata.bangerScore || 0) >= minScore);

      if (posts.length === 0) {
        logger.error(`No posts found with banger score >= ${minScore}`);
        return;
      }
    }

    if (options.source) {
      const source = options.source;
      posts = posts.filter((p) => p.sourceFile?.includes(source));

      if (posts.length === 0) {
        logger.error(`No posts found from source: ${source}`);
        return;
      }
    }

    // Get last N posts (default 10)
    const count = options.count || 10;
    const recentPosts = posts.slice(-count).reverse(); // Most recent first

    // Display summary
    logger.blank();
    logger.success(`Showing ${recentPosts.length} of ${posts.length} total posts`);

    if (options.strategy) {
      logger.info(`Filtered by strategy: ${options.strategy}`);
    }
    if (options.minScore) {
      logger.info(`Filtered by min score: ${options.minScore}`);
    }
    if (options.source) {
      logger.info(`Filtered by source: ${options.source}`);
    }

    // Display posts
    recentPosts.forEach((post, index) => {
      displayPost(post, index, recentPosts.length);
    });

    // Summary stats
    logger.blank();
    logger.info('📊 Statistics:');

    const withScores = posts.filter((p) => p.metadata.bangerScore);
    if (withScores.length > 0) {
      const avgScore =
        withScores.reduce((sum, p) => sum + (p.metadata.bangerScore || 0), 0) / withScores.length;
      logger.info(`  Average banger score: ${avgScore.toFixed(1)}/10`);

      const highQuality = withScores.filter((p) => (p.metadata.bangerScore || 0) >= 8);
      logger.info(`  High quality posts (8+): ${highQuality.length}`);
    }

    // Strategy breakdown
    const strategies = new Map<string, number>();
    posts.forEach((p) => {
      if (p.metadata.strategy) {
        const name = p.metadata.strategy.name;
        strategies.set(name, (strategies.get(name) || 0) + 1);
      }
    });

    if (strategies.size > 0) {
      logger.info(`  Strategies used: ${strategies.size}`);
      const topStrategy = Array.from(strategies.entries()).sort((a, b) => b[1] - a[1])[0];
      logger.info(`  Most used: ${topStrategy[0]} (${topStrategy[1]} posts)`);
    }

    logger.blank();
    logger.info('💡 Tip: Use filters to narrow results');
    logger.info('  --strategy <name>    Filter by strategy');
    logger.info('  --min-score <N>      Show posts with score >= N');
    logger.info('  --source <text>      Filter by source file');
    logger.info('  -n <count>           Number of posts to show');
  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
