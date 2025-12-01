import { FileSystemService } from '../services/file-system.js';
import { logger } from '../utils/logger.js';
import { isT2pProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';
import type { Post } from '../types/post.js';

interface PostsOptions {
  count?: number;
  strategy?: string;
  minScore?: number;
  source?: string;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
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

export async function postsCommand(options: PostsOptions): Promise<void> {
  const cwd = process.cwd();
  const fs = new FileSystemService(cwd);

  try {
    // Check if initialized
    if (!isT2pProject(cwd)) {
      throw new NotInitializedError();
    }

    // Load all posts
    let posts = fs.readPosts();

    if (posts.length === 0) {
      logger.info('No posts found. Run `t2p work` to generate posts.');
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
        logger.info('Run `t2p work --list-strategies` to see available strategies');
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
