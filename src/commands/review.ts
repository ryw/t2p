import { createInterface } from 'readline';
import { FileSystemService } from '../services/file-system.js';
import { logger } from '../utils/logger.js';
import { isT2pProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';
import type { Post } from '../types/post.js';

interface ReviewOptions {
  minScore?: number;
}

function displayPostForReview(post: Post, index: number, total: number): void {
  const remaining = total - index;

  logger.blank();

  // Header with progress and score
  const scoreEmoji =
    (post.metadata.bangerScore || 0) >= 70
      ? '🔥'
      : (post.metadata.bangerScore || 0) >= 50
        ? '✨'
        : '📝';
  const scoreText = post.metadata.bangerScore ? `${scoreEmoji} ${post.metadata.bangerScore}/99` : 'No score';
  const strategyText = post.metadata.strategy?.name || 'No strategy';

  logger.info(`[${remaining} remaining] ${scoreText} • ${strategyText}`);

  // Post content
  logger.info('  ' + '─'.repeat(70));
  const lines = post.content.split('\n');
  lines.forEach((line) => {
    logger.info(`  ${line}`);
  });
  logger.info('  ' + '─'.repeat(70));
}

async function promptForDecision(): Promise<'keep' | 'reject' | 'skip' | 'quit'> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('\nEnter=keep / n=reject / s=skip / q=quit: ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === '' || trimmed === 'k' || trimmed === 'y') {
        resolve('keep');
      } else if (trimmed === 'n' || trimmed === 'r') {
        resolve('reject');
      } else if (trimmed === 's') {
        resolve('skip');
      } else if (trimmed === 'q') {
        resolve('quit');
      } else {
        // Default to skip for unrecognized input
        resolve('skip');
      }
    });
  });
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const cwd = process.cwd();
  const fs = new FileSystemService(cwd);

  try {
    // Check if initialized
    if (!isT2pProject(cwd)) {
      throw new NotInitializedError();
    }

    // Load all posts
    const allPosts = fs.readPosts();

    if (allPosts.length === 0) {
      logger.info('No posts found. Run `t2p work` to generate posts.');
      return;
    }

    // Filter to unreviewed posts
    let postsToReview = allPosts.filter((p) => !p.metadata.reviewStatus);

    // Apply min score filter if specified
    if (options.minScore !== undefined) {
      postsToReview = postsToReview.filter(
        (p) => (p.metadata.bangerScore || 0) >= options.minScore!
      );
    }

    // Sort by banger score descending (highest first)
    postsToReview.sort((a, b) => (b.metadata.bangerScore || 0) - (a.metadata.bangerScore || 0));

    if (postsToReview.length === 0) {
      const reviewed = allPosts.filter((p) => p.metadata.reviewStatus);
      const kept = reviewed.filter((p) => p.metadata.reviewStatus === 'keep').length;
      const rejected = reviewed.filter((p) => p.metadata.reviewStatus === 'reject').length;

      logger.success('All posts have been reviewed!');
      logger.info(`  Kept: ${kept} • Rejected: ${rejected}`);
      return;
    }

    // Show summary
    logger.blank();
    logger.info(`Found ${postsToReview.length} posts to review`);
    if (options.minScore) {
      logger.info(`Filtered to posts with score >= ${options.minScore}`);
    }
    logger.info('Posts sorted by banger score (highest first)');

    // Review loop
    let reviewed = 0;
    let kept = 0;
    let rejected = 0;

    for (let i = 0; i < postsToReview.length; i++) {
      const post = postsToReview[i];

      displayPostForReview(post, i, postsToReview.length);

      const decision = await promptForDecision();

      if (decision === 'quit') {
        logger.blank();
        logger.info(`Session ended. Reviewed ${reviewed} posts (${kept} kept, ${rejected} rejected)`);
        logger.info(`${postsToReview.length - i} posts remaining to review`);
        return;
      }

      if (decision === 'skip') {
        logger.step('Skipped');
        continue;
      }

      // Update post metadata and status
      post.metadata.reviewStatus = decision;
      post.metadata.reviewedAt = new Date().toISOString();
      if (decision === 'reject') {
        post.status = 'rejected';
      }

      // Save immediately (find post in allPosts and update)
      const postIndex = allPosts.findIndex((p) => p.id === post.id);
      if (postIndex !== -1) {
        allPosts[postIndex] = post;
        fs.writePosts(allPosts);
      }

      reviewed++;
      if (decision === 'keep') {
        kept++;
        logger.success(`Kept [${postsToReview.length - i - 1} remaining]`);
      } else {
        rejected++;
        logger.error(`Rejected [${postsToReview.length - i - 1} remaining]`);
      }
    }

    // Final summary
    logger.blank();
    logger.success('Review complete!');
    logger.info(`  Kept: ${kept} • Rejected: ${rejected}`);

    const totalReviewed = allPosts.filter((p) => p.metadata.reviewStatus);
    const totalKept = totalReviewed.filter((p) => p.metadata.reviewStatus === 'keep').length;
    logger.info(`  Total kept posts: ${totalKept}`);
  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
