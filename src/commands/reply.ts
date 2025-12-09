import { createInterface } from 'readline';
import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
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

const SKIP_CACHE_FILE = '.shippost-skipped-tweets.json';
const SKIP_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

interface SkipCache {
  [tweetId: string]: number; // timestamp when skipped
}

function loadSkipCache(cwd: string): SkipCache {
  const cacheFile = join(cwd, SKIP_CACHE_FILE);
  if (!existsSync(cacheFile)) return {};
  try {
    const data = JSON.parse(readFileSync(cacheFile, 'utf8'));
    // Clean up old entries
    const now = Date.now();
    const cleaned: SkipCache = {};
    for (const [id, timestamp] of Object.entries(data)) {
      if (now - (timestamp as number) < SKIP_CACHE_MAX_AGE) {
        cleaned[id] = timestamp as number;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function saveSkipCache(cwd: string, cache: SkipCache): void {
  const cacheFile = join(cwd, SKIP_CACHE_FILE);
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

function addToSkipCache(cwd: string, tweetId: string): void {
  const cache = loadSkipCache(cwd);
  cache[tweetId] = Date.now();
  saveSkipCache(cwd, cache);
}

interface ReplyOptions {
  count?: number;
}

interface ReplyOpportunity {
  tweet: Tweet;
  suggestedReply: string;
  reasoning: string;
}

interface ParsedReplyItem {
  tweetNumber: number;
  suggestedReply?: string;
  reasoning?: string;
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
  const width = 70;

  logger.blank();
  logger.info(style.dim(`─── [${index + 1}/${total}] ` + '─'.repeat(width - 12)));

  // Author info with styling
  const author = opportunity.tweet.authorUsername
    ? style.cyan(`@${opportunity.tweet.authorUsername}`)
    : style.dim('Unknown');
  const followers = opportunity.tweet.authorFollowersCount
    ? style.yellow(` ${formatFollowerCount(opportunity.tweet.authorFollowersCount)}`)
    : '';
  const timeAgo = style.dim(formatTimeAgo(opportunity.tweet.createdAt));

  // Engagement stats inline with author
  const likes = formatCount(opportunity.tweet.likeCount);
  const replies = formatCount(opportunity.tweet.replyCount);
  const retweets = formatCount(opportunity.tweet.retweetCount);
  const engagementStr = `${style.red('♥')}${style.dim(likes)} ${style.blue('💬')}${style.dim(replies)} ${style.green('↻')}${style.dim(retweets)}`;

  logger.info(`${author}${followers} ${style.dim('•')} ${timeAgo}  ${engagementStr}`);

  // Tweet content
  const tweetLines = opportunity.tweet.text.split('\n');
  tweetLines.forEach((line) => {
    logger.info(`  ${line}`);
  });

  // URL (dimmed, clickable in Ghostty)
  const tweetUrl = opportunity.tweet.authorUsername
    ? `https://x.com/${opportunity.tweet.authorUsername}/status/${opportunity.tweet.id}`
    : `https://x.com/i/status/${opportunity.tweet.id}`;
  logger.info(style.dim(`  ${tweetUrl}`));

  // Suggested reply section
  logger.info(`${style.brightGreen('▶')} ${style.bold('Reply:')} ${style.brightCyan(opportunity.suggestedReply.split('\n').join(' '))}`);
}

async function promptForReplyDecision(): Promise<'post' | 'edit' | 'skip' | 'quit'> {
  const { style } = logger;

  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Compact prompt
    const prompt = `  ${style.green('⏎')}post ${style.yellow('e')}dit ${style.dim('s')}kip ${style.red('q')}uit > `;

    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === '' || trimmed === 'p' || trimmed === 'y') {
        resolve('post');
      } else if (trimmed === 'e') {
        resolve('edit');
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
  tweets: Tweet[],
  isBasicTier: boolean
): string {
  const tweetsText = tweets
    .map((t, i) => {
      const author = t.authorUsername ? `@${t.authorUsername}` : 'Unknown';
      return `[${i + 1}] ${author}: ${t.text}`;
    })
    .join('\n\n');

  const targetCount = isBasicTier ? '8-10' : '4-5';

  return replyTemplate
    .replace('{{STYLE_GUIDE}}', styleGuide)
    .replace('{{TWEETS}}', tweetsText)
    .replace('{{TARGET_COUNT}}', targetCount);
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

    const parsed: ParsedReplyItem[] = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => {
        const tweetIndex = item.tweetNumber - 1;
        return tweetIndex >= 0 && tweetIndex < tweets.length;
      })
      .map((item) => ({
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

      // Show impression stats for Basic tier (cached for 1 hour to save rate limits)
      const cacheFile = join(cwd, '.shippost-impressions-cache.json');
      const cacheMaxAge = 60 * 60 * 1000; // 1 hour

      let stats: { dailyImpressions: { date: string; impressions: number }[]; totalImpressions: number } | null = null;

      // Try to load from cache
      try {
        if (existsSync(cacheFile)) {
          const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
          if (Date.now() - cached.timestamp < cacheMaxAge) {
            stats = cached.stats;
            logger.info(style.dim('(using cached impression stats)'));
          }
        }
      } catch {
        // Ignore cache errors
      }

      // Fetch fresh if no valid cache
      if (!stats) {
        try {
          stats = await apiService.getImpressionStats(5);
          // Save to cache
          writeFileSync(cacheFile, JSON.stringify({ timestamp: Date.now(), stats }), 'utf8');
        } catch {
          // Silently skip if impressions aren't available
        }
      }

      if (stats && stats.dailyImpressions.length > 0) {
        const avgDaily = stats.totalImpressions / stats.dailyImpressions.length;
        const projected90Days = Math.round(avgDaily * 90);
        const goal = 5_000_000;
        const percentOfGoal = ((projected90Days / goal) * 100).toFixed(1);

        logger.blank();
        logger.info(style.bold('📊 Impression Stats (last 5 days)'));

        // Show daily breakdown
        const todayStr = new Date().toISOString().split('T')[0];
        const todayImpressions = stats.dailyImpressions.find(d => d.date === todayStr)?.impressions || 0;
        logger.info(`   ${style.dim("Today's posts:")} ${style.brightCyan(formatCount(todayImpressions))}`);
        logger.info(`   ${style.dim('5-day posts total:')} ${formatCount(stats.totalImpressions)}`);
        logger.info(`   ${style.dim('Daily avg:')} ${formatCount(Math.round(avgDaily))} ${style.dim('(posts from that day)')}`);

        // Show 90-day projection vs goal
        const projColor = projected90Days >= goal ? style.brightGreen : style.yellow;
        logger.info(`   ${style.dim('90-day projection:')} ${projColor(formatCount(projected90Days))} ${style.dim(`(${percentOfGoal}% of 5M goal)`)}`);

        // Progress bar toward goal
        const progressPct = Math.min(100, (projected90Days / goal) * 100);
        const barWidth = 20;
        const filled = Math.round((progressPct / 100) * barWidth);
        const barColor = progressPct >= 100 ? style.green : progressPct >= 50 ? style.yellow : style.red;
        const bar = barColor('█'.repeat(filled)) + style.dim('░'.repeat(barWidth - filled));
        logger.info(`   ${bar} ${style.dim(`${progressPct.toFixed(0)}%`)}`);
      }
    } else {
      logger.info(`${style.dim('○')} ${style.bold('FREE X MODE')} ${style.dim('• chronological • no metrics')}`);
    }

    // Step 3: Fetch timeline and generate replies
    logger.section('[3/4] Finding reply opportunities...');

    // Default: 30 tweets for Basic tier (more to choose from), 10 for Free tier
    const defaultCount = includeMetrics ? 30 : 10;
    const maxTweets = options.count || defaultCount;

    if (includeMetrics) {
      logger.info(`Fetching ${maxTweets} tweets with metrics...`);
    } else {
      logger.info(`Fetching ${maxTweets} tweets from your timeline...`);
    }

    let tweets = await apiService.getHomeTimeline(maxTweets, includeMetrics);

    // Filter out user's own tweets
    tweets = tweets.filter((t) => t.authorUsername?.toLowerCase() !== user.username.toLowerCase());

    // Filter out tweets we've already replied to
    const alreadyRepliedTo = await apiService.getMyRecentReplyTargets(100);
    if (alreadyRepliedTo.size > 0) {
      const beforeReplyFilter = tweets.length;
      tweets = tweets.filter((t) => !alreadyRepliedTo.has(t.id));
      if (beforeReplyFilter > tweets.length) {
        logger.info(style.dim(`Filtered ${beforeReplyFilter - tweets.length} tweets you already replied to`));
      }
    }

    // Filter out previously skipped tweets (within 24 hours)
    const skipCache = loadSkipCache(cwd);
    const skippedIds = new Set(Object.keys(skipCache));
    const beforeSkipFilter = tweets.length;
    tweets = tweets.filter((t) => !skippedIds.has(t.id));
    if (beforeSkipFilter > tweets.length) {
      logger.info(style.dim(`Filtered ${beforeSkipFilter - tweets.length} previously skipped tweets`));
    }

    // For Basic tier: filter to accounts with 10k+ followers
    if (includeMetrics) {
      const MIN_FOLLOWERS = 10000;
      const beforeFollowerFilter = tweets.length;
      tweets = tweets.filter((t) => (t.authorFollowersCount || 0) >= MIN_FOLLOWERS);
      if (beforeFollowerFilter > tweets.length) {
        logger.info(style.dim(`Filtered ${beforeFollowerFilter - tweets.length} tweets from accounts with <10k followers`));
      }
    }

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
    const prompt = buildReplyPrompt(replyTemplate, styleGuide, tweets, includeMetrics);
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
        addToSkipCache(cwd, opportunity.tweet.id);
        logger.info('Skipped');
        continue;
      }

      let replyText = opportunity.suggestedReply;

      if (decision === 'edit') {
        replyText = editReply(opportunity.suggestedReply);
        logger.info(`${logger.style.dim('Edited reply:')} "${replyText}"`);
      }

      // Post the reply and like the tweet
      try {
        const postedReply = await apiService.postReply(opportunity.tweet.id, replyText);
        posted++;
        logger.success(`Posted reply! https://x.com/i/status/${postedReply.id}`);

        // Like the original tweet
        try {
          await apiService.likeTweet(opportunity.tweet.id);
          logger.info(`${logger.style.red('♥')} Liked`);
        } catch (likeError) {
          logger.warn(`Could not like tweet: ${(likeError as Error).message}`);
        }
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
