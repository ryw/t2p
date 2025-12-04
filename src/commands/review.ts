import { createInterface } from 'readline';
import { FileSystemService } from '../services/file-system.js';
import { TypefullyService } from '../services/typefully.js';
import { logger } from '../utils/logger.js';
import { isT2pProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';
import type { Post } from '../types/post.js';

interface ReviewOptions {
  minScore?: number;
}

function displayPostForReview(post: Post, remaining: number): void {
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

async function promptForDecision(): Promise<'stage' | 'keep' | 'reject' | 'quit'> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('\ns=stage (Typefully) / Enter=keep / n=reject / q=quit: ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === 's') {
        resolve('stage');
      } else if (trimmed === '' || trimmed === 'k' || trimmed === 'y') {
        resolve('keep');
      } else if (trimmed === 'n' || trimmed === 'r') {
        resolve('reject');
      } else if (trimmed === 'q') {
        resolve('quit');
      } else {
        // Default to keep for unrecognized input
        resolve('keep');
      }
    });
  });
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  const cwd = process.cwd();
  const fs = new FileSystemService(cwd);
  let typefully: TypefullyService | null = null;

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

    // Filter to new and keep posts (not staged or rejected)
    let postsToReview = allPosts.filter((p) => p.status === 'new' || p.status === 'keep');

    // Apply min score filter if specified
    if (options.minScore !== undefined) {
      postsToReview = postsToReview.filter(
        (p) => (p.metadata.bangerScore || 0) >= options.minScore!
      );
    }

    // Sort by banger score descending (highest first)
    postsToReview.sort((a, b) => (b.metadata.bangerScore || 0) - (a.metadata.bangerScore || 0));

    if (postsToReview.length === 0) {
      const kept = allPosts.filter((p) => p.status === 'keep').length;
      const staged = allPosts.filter((p) => p.status === 'staged').length;
      const rejected = allPosts.filter((p) => p.status === 'rejected').length;

      logger.success('No new posts to review!');
      logger.info(`  Kept: ${kept} • Staged: ${staged} • Rejected: ${rejected}`);
      return;
    }

    // Show summary
    logger.blank();
    logger.info(`Found ${postsToReview.length} new posts to review`);
    if (options.minScore) {
      logger.info(`Filtered to posts with score >= ${options.minScore}`);
    }
    logger.info('Posts sorted by banger score (highest first)');

    // Review loop
    let reviewed = 0;
    let kept = 0;
    let staged = 0;
    let rejected = 0;

    for (let i = 0; i < postsToReview.length; i++) {
      const post = postsToReview[i];
      const remaining = postsToReview.length - i;

      displayPostForReview(post, remaining);

      const decision = await promptForDecision();

      if (decision === 'quit') {
        logger.blank();
        logger.info(`Session ended. Reviewed ${reviewed} posts`);
        logger.info(`  Staged: ${staged} • Kept: ${kept} • Rejected: ${rejected}`);
        logger.info(`${remaining} posts remaining to review`);
        return;
      }

      // Update post status
      if (decision === 'stage') {
        post.status = 'staged';
      } else if (decision === 'keep') {
        post.status = 'keep';
      } else {
        post.status = 'rejected';
      }

      // If staging, send to Typefully
      if (decision === 'stage') {
        try {
          // Lazy init Typefully service
          if (!typefully) {
            typefully = new TypefullyService();
          }
          const draft = await typefully.createDraft(post.content);
          post.metadata.typefullyDraftId = draft.id;
          staged++;
          logger.success(`Staged → Typefully [${remaining - 1} remaining]`);
          if (draft.share_url) {
            logger.info(`  ${draft.share_url}`);
          }
        } catch (error) {
          logger.error(`Failed to stage: ${(error as Error).message}`);
          // Revert status on failure
          post.status = 'new';
          continue;
        }
      } else if (decision === 'keep') {
        kept++;
        logger.step(`Kept [${remaining - 1} remaining]`);
      } else {
        rejected++;
        logger.error(`Rejected [${remaining - 1} remaining]`);
      }

      // Save immediately (find post in allPosts and update)
      const postIndex = allPosts.findIndex((p) => p.id === post.id);
      if (postIndex !== -1) {
        allPosts[postIndex] = post;
        fs.writePosts(allPosts);
      }

      reviewed++;
    }

    // Final summary
    logger.blank();
    logger.success('Review complete!');
    logger.info(`  Staged: ${staged} • Kept: ${kept} • Rejected: ${rejected}`);
  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
