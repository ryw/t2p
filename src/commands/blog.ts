import { createInterface } from 'readline';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { XAuthService } from '../services/x-auth.js';
import { XApiService, Tweet } from '../services/x-api.js';
import { createLLMService } from '../services/llm-factory.js';
import { logger } from '../utils/logger.js';
import { readlineSync } from '../utils/readline.js';
import { T2pConfig } from '../types/config.js';

const STATE_FILE = '.ship-blog-state.json';
const TOKENS_FILE = '.shippost-tokens.json';
const CONFIG_FILE = '.shippostrc.json';
const SNOOZE_DAYS = 7; // Snoozed posts reappear after 7 days

interface BlogState {
  processedTweets: Record<string, number>; // tweetId -> timestamp when processed
  snoozedTweets: Record<string, number>; // tweetId -> timestamp when snoozed
  skippedTweets: Record<string, number>; // tweetId -> timestamp when skipped (permanent)
}

interface BlogFromXOptions {
  count?: number;
  output?: string;
  setup?: boolean;
}

function loadState(cwd: string): BlogState {
  const stateFile = join(cwd, STATE_FILE);
  if (!existsSync(stateFile)) {
    return { processedTweets: {}, snoozedTweets: {}, skippedTweets: {} };
  }
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return { processedTweets: {}, snoozedTweets: {}, skippedTweets: {} };
  }
}

function saveState(cwd: string, state: BlogState): void {
  const stateFile = join(cwd, STATE_FILE);
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function markProcessed(cwd: string, tweetId: string): void {
  const state = loadState(cwd);
  state.processedTweets[tweetId] = Date.now();
  // Remove from snoozed if it was there
  delete state.snoozedTweets[tweetId];
  saveState(cwd, state);
}

function markSnoozed(cwd: string, tweetId: string): void {
  const state = loadState(cwd);
  state.snoozedTweets[tweetId] = Date.now();
  saveState(cwd, state);
}

function markSkipped(cwd: string, tweetId: string): void {
  const state = loadState(cwd);
  state.skippedTweets[tweetId] = Date.now();
  saveState(cwd, state);
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

function getTotalEngagement(tweet: Tweet): number {
  return (tweet.likeCount || 0) + (tweet.replyCount || 0) + (tweet.retweetCount || 0);
}

function displayTweet(tweet: Tweet, index: number, total: number): void {
  const { style } = logger;
  const width = 70;

  logger.blank();
  logger.info(style.dim(`─── [${index + 1}/${total}] ` + '─'.repeat(width - 12)));

  // Type indicator and time
  const typeLabel = tweet.isReply ? style.yellow('reply') : style.cyan('post');
  const timeAgo = style.dim(formatTimeAgo(tweet.createdAt));
  const engagement = getTotalEngagement(tweet);

  // Engagement stats
  const likes = formatCount(tweet.likeCount);
  const replies = formatCount(tweet.replyCount);
  const retweets = formatCount(tweet.retweetCount);
  const engagementStr = `${style.red('♥')}${style.dim(likes)} ${style.blue('💬')}${style.dim(replies)} ${style.green('↻')}${style.dim(retweets)} ${style.dim('=')} ${style.brightYellow(String(engagement))}`;

  logger.info(`${typeLabel} ${style.dim('•')} ${timeAgo}  ${engagementStr}`);

  // Tweet content
  const tweetLines = tweet.text.split('\n');
  tweetLines.forEach((line) => {
    logger.info(`  ${line}`);
  });

  // URL
  const tweetUrl = `https://x.com/${tweet.authorUsername}/status/${tweet.id}`;
  logger.info(style.dim(`  ${tweetUrl}`));
}

async function promptForDecision(): Promise<'use' | 'snooze' | 'skip' | 'quit'> {
  const { style } = logger;

  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = `  ${style.green('⏎')}use ${style.yellow('z')}snooze ${style.dim('s')}kip ${style.red('q')}uit > `;

    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === '' || trimmed === 'u' || trimmed === 'y') {
        resolve('use');
      } else if (trimmed === 'z') {
        resolve('snooze');
      } else if (trimmed === 's') {
        resolve('skip');
      } else if (trimmed === 'q') {
        resolve('quit');
      } else {
        resolve('snooze'); // Default to snooze for unrecognized input
      }
    });
  });
}

function generateBlogPrompt(tweet: Tweet): string {
  const isReply = tweet.isReply ? 'This is a reply to another tweet.' : 'This is an original post.';

  return `You are converting a successful X (Twitter) post into a blog post draft.

The original X post (${isReply}):
"""
${tweet.text}
"""

Engagement: ${tweet.likeCount || 0} likes, ${tweet.replyCount || 0} replies, ${tweet.retweetCount || 0} retweets

Create a blog post that:
1. Expands on the idea from the tweet
2. Adds context, examples, or deeper explanation
3. Maintains the voice and tone of the original
4. Is 300-800 words
5. Has a compelling title

Format your response as:

TITLE: [Your title here]

[Blog content in markdown]`;
}

function generateFrontmatter(title: string, tweet: Tweet): string {
  const date = new Date().toISOString().split('T')[0];
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  return `---
title: "${title.replace(/"/g, '\\"')}"
date: ${date}
draft: true
source_tweet: https://x.com/${tweet.authorUsername}/status/${tweet.id}
---

`;
}

function parseBlogResponse(response: string): { title: string; content: string } {
  const titleMatch = response.match(/TITLE:\s*(.+)/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

  // Remove the TITLE line and get the rest as content
  const content = response
    .replace(/TITLE:\s*.+/i, '')
    .trim();

  return { title, content };
}

function loadConfig(cwd: string): T2pConfig | null {
  // First check current directory
  const localConfig = join(cwd, CONFIG_FILE);
  if (existsSync(localConfig)) {
    try {
      return JSON.parse(readFileSync(localConfig, 'utf8'));
    } catch {
      return null;
    }
  }

  // Then check home directory for global config
  const homeConfig = join(process.env.HOME || '', CONFIG_FILE);
  if (existsSync(homeConfig)) {
    try {
      return JSON.parse(readFileSync(homeConfig, 'utf8'));
    } catch {
      return null;
    }
  }

  return null;
}

export async function blogCommand(options: BlogFromXOptions): Promise<void> {
  const cwd = process.cwd();
  const { style } = logger;

  try {
    logger.section('[1/4] Setting up...');

    // Load config (from local or home dir)
    const config = loadConfig(cwd);
    if (!config) {
      logger.error('No shippost config found.');
      logger.info('Run `ship init` in any directory first, or run this from a shippost project.');
      process.exit(1);
    }

    const clientId = config.x?.clientId;
    if (!clientId) {
      logger.error('X API not configured. Run `ship analyze-x --setup` first.');
      process.exit(1);
    }

    // Setup output directory
    const outputDir = options.output || 'content/drafts';
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
      logger.info(`Created output directory: ${outputDir}`);
    }

    // Initialize LLM
    const llm = createLLMService(config);
    await llm.ensureAvailable();
    logger.success(`Connected to LLM (${llm.getModelName()})`);

    // Authenticate with X
    logger.section('[2/4] Connecting to X...');

    // Check for tokens in current dir first, then home dir
    let tokenDir = cwd;
    if (!existsSync(join(cwd, TOKENS_FILE))) {
      const homeTokens = join(process.env.HOME || '', TOKENS_FILE);
      if (existsSync(homeTokens)) {
        tokenDir = process.env.HOME || '';
      }
    }

    const authService = new XAuthService(tokenDir, clientId);
    const accessToken = await authService.getValidToken();
    const apiService = new XApiService(accessToken);

    const user = await apiService.getMe();
    logger.success(`Authenticated as @${user.username}`);

    // Fetch tweets
    logger.section('[3/4] Fetching your posts...');

    const maxTweets = options.count || 50;
    logger.info(`Fetching up to ${maxTweets} posts sorted by engagement...`);

    const allTweets = await apiService.getMyTweetsWithEngagement(maxTweets);

    // Filter out already processed, skipped, and recently snoozed tweets
    const state = loadState(cwd);
    const now = Date.now();
    const snoozeExpiry = SNOOZE_DAYS * 24 * 60 * 60 * 1000;

    const tweets = allTweets.filter((tweet) => {
      // Skip already processed
      if (state.processedTweets[tweet.id]) return false;
      // Skip permanently skipped
      if (state.skippedTweets[tweet.id]) return false;
      // Skip recently snoozed (within SNOOZE_DAYS)
      const snoozedAt = state.snoozedTweets[tweet.id];
      if (snoozedAt && now - snoozedAt < snoozeExpiry) return false;
      return true;
    });

    if (tweets.length === 0) {
      logger.info('No new posts to process. All your posts have been handled!');
      return;
    }

    const filtered = allTweets.length - tweets.length;
    if (filtered > 0) {
      logger.info(style.dim(`Filtered ${filtered} already processed/snoozed/skipped posts`));
    }

    logger.success(`Found ${tweets.length} posts to review`);

    // Interactive review
    logger.section('[4/4] Review your posts...');
    logger.info(`${style.green('⏎/u')}se → generate blog draft`);
    logger.info(`${style.yellow('z')}snooze → review again in ${SNOOZE_DAYS} days`);
    logger.info(`${style.dim('s')}kip → never show again`);
    logger.info(`${style.red('q')}uit → exit`);

    let used = 0;
    let snoozed = 0;
    let skipped = 0;

    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];

      displayTweet(tweet, i, tweets.length);

      const decision = await promptForDecision();

      if (decision === 'quit') {
        logger.blank();
        logger.info(`Session ended. Used: ${used}, Snoozed: ${snoozed}, Skipped: ${skipped}`);
        return;
      }

      if (decision === 'snooze') {
        snoozed++;
        markSnoozed(cwd, tweet.id);
        logger.info(style.yellow(`Snoozed for ${SNOOZE_DAYS} days`));
        continue;
      }

      if (decision === 'skip') {
        skipped++;
        markSkipped(cwd, tweet.id);
        logger.info(style.dim('Skipped permanently'));
        continue;
      }

      // Generate blog post
      logger.info(style.cyan('Generating blog post...'));

      const prompt = generateBlogPrompt(tweet);
      const response = await llm.generate(prompt);
      const { title, content } = parseBlogResponse(response);

      // Create filename from title
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
      const filename = `${slug}.md`;
      const filepath = join(outputDir, filename);

      // Write file with frontmatter
      const frontmatter = generateFrontmatter(title, tweet);
      writeFileSync(filepath, frontmatter + content);

      used++;
      markProcessed(cwd, tweet.id);
      logger.success(`Created: ${filepath}`);
    }

    // Final summary
    logger.blank();
    logger.success('Blog generation complete!');
    logger.info(`  Used: ${used} • Snoozed: ${snoozed} • Skipped: ${skipped}`);
    if (used > 0) {
      logger.info(`  Drafts saved to: ${outputDir}/`);
    }
  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}
