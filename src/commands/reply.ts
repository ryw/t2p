import { createInterface } from 'readline';
import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileSystemService } from '../services/file-system.js';
import { XAuthService } from '../services/x-auth.js';
import { XApiService, Tweet } from '../services/x-api.js';
import { createLLMService } from '../services/llm-factory.js';
import { logger } from '../utils/logger.js';
import { isShippostProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';
import { readlineSync } from '../utils/readline.js';

interface ReplyOptions {
  count?: number;
}

interface ReplyOpportunity {
  tweet: Tweet;
  suggestedReply: string;
  reasoning: string;
}

function formatFollowerCount(count?: number): string {
  if (!count) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

function formatCount(count?: number): string {
  if (count === undefined || count === null) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return '1d ago';
  return `${diffDays}d ago`;
}

function displayTweetForReply(opportunity: ReplyOpportunity, index: number, total: number): void {
  const { style } = logger;
  const width = 72;

  logger.blank();

  // Header with progress indicator
  const progress = style.dim(`[${index + 1}/${total}]`);
  logger.info(`${progress} ${style.bold('Reply Opportunity')}`);
  logger.info(style.dim(logger.box.line(width)));

  // Author info with styling
  const author = opportunity.tweet.authorUsername
    ? style.cyan(`@${opportunity.tweet.authorUsername}`)
    : style.dim('Unknown');
  const followers = opportunity.tweet.authorFollowersCount
    ? style.yellow(` ${formatFollowerCount(opportunity.tweet.authorFollowersCount)}`)
    : '';
  const timeAgo = style.dim(formatTimeAgo(opportunity.tweet.createdAt));
  logger.info(`${author}${followers} ${style.dim('•')} ${timeAgo}`);

  logger.blank();

  // Tweet content (white/default for readability)
  const tweetLines = opportunity.tweet.text.split('\n');
  tweetLines.forEach((line) => {
    logger.info(`  ${line}`);
  });

  logger.blank();

  // Engagement stats with color-coded icons
  const likes = formatCount(opportunity.tweet.likeCount);
  const replies = formatCount(opportunity.tweet.replyCount);
  const retweets = formatCount(opportunity.tweet.retweetCount);
  logger.info(
    `  ${style.red('♥')} ${style.dim(likes)}  ${style.blue('💬')} ${style.dim(replies)}  ${style.green('↻')} ${style.dim(retweets)}`
  );

  // URL (dimmed, clickable in Ghostty)
  const tweetUrl = opportunity.tweet.authorUsername
    ? `https://x.com/${opportunity.tweet.authorUsername}/status/${opportunity.tweet.id}`
    : `https://x.com/i/status/${opportunity.tweet.id}`;
  logger.info(`  ${style.dim(tweetUrl)}`);

  logger.blank();
  logger.info(style.dim(logger.box.line(width)));

  // Suggested reply section
  logger.info(`${style.brightGreen('▶')} ${style.bold('Suggested Reply')}`);
  logger.blank();
  const replyLines = opportunity.suggestedReply.split('\n');
  replyLines.forEach((line) => {
    logger.info(`  ${style.brightCyan(line)}`);
  });

  logger.blank();
  logger.info(style.dim(logger.box.line(width)));
}

async function promptForReplyDecision(): Promise<'post' | 'edit' | 'skip' | 'quit'> {
  const { style } = logger;

  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Styled prompt with keyboard hints
    const prompt = [
      '',
      `  ${style.green('⏎ Enter')} post  │  ${style.yellow('e')} edit  │  ${style.dim('n')} skip  │  ${style.red('q')} quit`,
      '',
      `  ${style.dim('>')} `,
    ].join('\n');

    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === '' || trimmed === 'p' || trimmed === 'y') {
        resolve('post');
      } else if (trimmed === 'e') {
        resolve('edit');
      } else if (trimmed === 'n' || trimmed === 's') {
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

function editReply(currentReply: string): string {
  const { style } = logger;

  // Create temp file with current reply
  const tmpFile = join(tmpdir(), `ship-reply-${Date.now()}.txt`);
  const header = `# Edit your reply below. Lines starting with # are ignored.
# Save and close the editor to submit, or delete all content to cancel.
# ─────────────────────────────────────────────────────────────────────

`;
  writeFileSync(tmpFile, header + currentReply, 'utf8');

  // Determine editor (same order as git)
  const editor = process.env.VISUAL || process.env.EDITOR || 'vim';

  logger.blank();
  logger.info(`${style.cyan('✎')} ${style.bold('Opening editor...')} ${style.dim(`(${editor})`)}`);

  try {
    // Spawn editor synchronously
    const result = spawnSync(editor, [tmpFile], {
      stdio: 'inherit',
      shell: true,
    });

    if (result.status !== 0) {
      logger.warn('Editor exited with non-zero status, keeping original');
      return currentReply;
    }

    // Read back the edited content
    const edited = readFileSync(tmpFile, 'utf8');

    // Remove comment lines and trim
    const content = edited
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n')
      .trim();

    // If empty, keep original
    if (!content) {
      logger.info(style.dim('Empty content, keeping original reply'));
      return currentReply;
    }

    return content;
  } catch (error) {
    logger.error(`Failed to open editor: ${(error as Error).message}`);
    return currentReply;
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function buildReplyPrompt(
  replyTemplate: string,
  styleGuide: string,
  tweets: Tweet[]
): string {
  const tweetsText = tweets
    .map((t, i) => {
      const author = t.authorUsername ? `@${t.authorUsername}` : 'Unknown';
      return `[${i + 1}] ${author}: ${t.text}`;
    })
    .join('\n\n');

  return replyTemplate
    .replace('{{STYLE_GUIDE}}', styleGuide)
    .replace('{{TWEETS}}', tweetsText);
}

function parseReplyOpportunities(
  response: string,
  tweets: Tweet[]
): ReplyOpportunity[] {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response;
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item: any) => {
        const tweetIndex = item.tweetNumber - 1;
        return tweetIndex >= 0 && tweetIndex < tweets.length;
      })
      .map((item: any) => ({
        tweet: tweets[item.tweetNumber - 1],
        suggestedReply: item.suggestedReply || '',
        reasoning: item.reasoning || '',
      }));
  } catch (error) {
    logger.error(`Failed to parse LLM response: ${(error as Error).message}`);
    return [];
  }
}

export async function replyCommand(options: ReplyOptions): Promise<void> {
  const cwd = process.cwd();

  try {
    // Step 1: Validate environment
    logger.section('[1/4] Checking environment...');

    if (!isShippostProject(cwd)) {
      throw new NotInitializedError();
    }

    const fs = new FileSystemService(cwd);
    const config = fs.loadConfig();

    // Initialize LLM service
    const llm = createLLMService(config);
    await llm.ensureAvailable();
    logger.success(`Connected to LLM (${llm.getModelName()})`);

    // Step 2: Authenticate with X
    logger.section('[2/4] Connecting to X...');

    const clientId = config.x?.clientId;
    if (!clientId) {
      logger.error('X API not configured. Run `ship analyze-x --setup` first.');
      process.exit(1);
    }

    const authService = new XAuthService(cwd, clientId);
    const accessToken = await authService.getValidToken();
    const apiService = new XApiService(accessToken);

    const user = await apiService.getMe();
    logger.success(`Authenticated as @${user.username}`);

    const apiTier = config.x?.apiTier || 'free';
    const includeMetrics = apiTier === 'basic';
    const { style } = logger;

    if (includeMetrics) {
      logger.info(`${style.cyan('⚡')} ${style.bold(style.cyan('BASIC X MODE'))} ${style.dim('• sorted by influence • engagement metrics')}`);
    } else {
      logger.info(`${style.dim('○')} ${style.bold('FREE X MODE')} ${style.dim('• chronological • no metrics')}`);
    }

    // Step 3: Fetch timeline and generate replies
    logger.section('[3/4] Finding reply opportunities...');

    const maxTweets = options.count || 10;

    if (includeMetrics) {
      logger.info(`Fetching ${maxTweets} tweets with metrics...`);
    } else {
      logger.info(`Fetching ${maxTweets} tweets from your timeline...`);
    }

    let tweets = await apiService.getHomeTimeline(maxTweets, includeMetrics);

    // Filter out user's own tweets
    tweets = tweets.filter((t) => t.authorUsername?.toLowerCase() !== user.username.toLowerCase());

    if (tweets.length === 0) {
      logger.error('No tweets found in timeline');
      process.exit(1);
    }

    // For Basic tier: sort by follower count (descending) and recency
    if (includeMetrics) {
      tweets = tweets.sort((a, b) => {
        // Primary: follower count (higher first)
        const followerDiff = (b.authorFollowersCount || 0) - (a.authorFollowersCount || 0);
        if (followerDiff !== 0) return followerDiff;
        // Secondary: recency (newer first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      logger.success(`Fetched ${tweets.length} tweets (sorted by influence & recency)`);
    } else {
      logger.success(`Fetched ${tweets.length} tweets`);
    }

    // Load prompts
    const styleGuide = fs.loadPrompt('style.md');
    const replyTemplate = fs.loadPrompt('reply.md');

    // Generate reply opportunities
    logger.info('Analyzing tweets for reply opportunities...');
    const prompt = buildReplyPrompt(replyTemplate, styleGuide, tweets);
    const response = await llm.generate(prompt);
    const opportunities = parseReplyOpportunities(response, tweets);

    if (opportunities.length === 0) {
      logger.info('No good reply opportunities found. Try again later!');
      return;
    }

    logger.success(`Found ${opportunities.length} reply opportunities`);

    // Step 4: Interactive review
    logger.section('[4/4] Review and post replies...');

    let posted = 0;
    let skipped = 0;

    for (let i = 0; i < opportunities.length; i++) {
      const opportunity = opportunities[i];

      displayTweetForReply(opportunity, i, opportunities.length);

      const decision = await promptForReplyDecision();

      if (decision === 'quit') {
        logger.blank();
        logger.info(`Session ended. Posted ${posted}, skipped ${skipped}`);
        return;
      }

      if (decision === 'skip') {
        skipped++;
        logger.info('Skipped');
        continue;
      }

      let replyText = opportunity.suggestedReply;

      if (decision === 'edit') {
        replyText = editReply(opportunity.suggestedReply);
        logger.info(`${logger.style.dim('Edited reply:')} "${replyText}"`);
      }

      // Post the reply
      try {
        const postedReply = await apiService.postReply(opportunity.tweet.id, replyText);
        posted++;
        logger.success(`Posted reply! https://x.com/i/status/${postedReply.id}`);
      } catch (error) {
        logger.error(`Failed to post: ${(error as Error).message}`);
      }
    }

    // Final summary
    logger.blank();
    logger.success('Reply session complete!');
    logger.info(`  Posted: ${posted} • Skipped: ${skipped}`);
  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
