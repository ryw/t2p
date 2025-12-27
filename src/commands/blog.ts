import { createInterface } from 'readline';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { XAuthService } from '../services/x-auth.js';
import { XApiService, Tweet } from '../services/x-api.js';
import { createLLMService } from '../services/llm-factory.js';
import { logger } from '../utils/logger.js';
import { readlineSync } from '../utils/readline.js';
import { formatCount, formatTimeAgo } from '../utils/format.js';
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

type Framework = 'hugo' | 'jekyll' | 'astro' | 'nextjs' | 'gatsby' | 'eleventy' | 'unknown';

interface FrameworkConfig {
  name: string;
  draftsDir: string;
  postsDir: string;
  useDateInFilename: boolean;
  frontmatterStyle: 'yaml' | 'toml';
  draftField: string | null; // null means use drafts folder instead
}

const FRAMEWORK_CONFIGS: Record<Framework, FrameworkConfig> = {
  hugo: {
    name: 'Hugo',
    draftsDir: 'content/posts',
    postsDir: 'content/posts',
    useDateInFilename: false,
    frontmatterStyle: 'yaml',
    draftField: 'draft',
  },
  jekyll: {
    name: 'Jekyll',
    draftsDir: '_drafts',
    postsDir: '_posts',
    useDateInFilename: true,
    frontmatterStyle: 'yaml',
    draftField: null, // Jekyll uses _drafts folder
  },
  astro: {
    name: 'Astro',
    draftsDir: 'src/content/blog',
    postsDir: 'src/content/blog',
    useDateInFilename: false,
    frontmatterStyle: 'yaml',
    draftField: 'draft',
  },
  nextjs: {
    name: 'Next.js',
    draftsDir: 'content/posts',
    postsDir: 'content/posts',
    useDateInFilename: false,
    frontmatterStyle: 'yaml',
    draftField: 'draft',
  },
  gatsby: {
    name: 'Gatsby',
    draftsDir: 'content/blog',
    postsDir: 'content/blog',
    useDateInFilename: false,
    frontmatterStyle: 'yaml',
    draftField: 'draft',
  },
  eleventy: {
    name: 'Eleventy',
    draftsDir: 'src/posts',
    postsDir: 'src/posts',
    useDateInFilename: false,
    frontmatterStyle: 'yaml',
    draftField: 'draft',
  },
  unknown: {
    name: 'Unknown',
    draftsDir: 'drafts',
    postsDir: 'posts',
    useDateInFilename: false,
    frontmatterStyle: 'yaml',
    draftField: 'draft',
  },
};

function detectFramework(cwd: string): Framework {
  // Check for config files that identify the framework

  // Hugo: hugo.toml, hugo.yaml, hugo.json, or config.toml with hugo markers
  if (
    existsSync(join(cwd, 'hugo.toml')) ||
    existsSync(join(cwd, 'hugo.yaml')) ||
    existsSync(join(cwd, 'hugo.json')) ||
    existsSync(join(cwd, 'config.toml'))
  ) {
    // Verify it's Hugo by checking for config.toml content or archetypes
    if (existsSync(join(cwd, 'archetypes'))) return 'hugo';
    if (existsSync(join(cwd, 'config.toml'))) {
      const content = readFileSync(join(cwd, 'config.toml'), 'utf8');
      if (content.includes('baseURL') || content.includes('theme')) return 'hugo';
    }
    if (existsSync(join(cwd, 'hugo.toml')) || existsSync(join(cwd, 'hugo.yaml'))) return 'hugo';
  }

  // Jekyll: _config.yml
  if (existsSync(join(cwd, '_config.yml')) || existsSync(join(cwd, '_config.yaml'))) {
    return 'jekyll';
  }

  // Astro: astro.config.mjs or astro.config.ts
  if (
    existsSync(join(cwd, 'astro.config.mjs')) ||
    existsSync(join(cwd, 'astro.config.ts')) ||
    existsSync(join(cwd, 'astro.config.js'))
  ) {
    return 'astro';
  }

  // Check package.json for framework dependencies
  const packageJsonPath = join(cwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps['astro']) return 'astro';
      if (deps['gatsby']) return 'gatsby';
      if (deps['@11ty/eleventy'] || deps['eleventy']) return 'eleventy';
      if (deps['next']) return 'nextjs';
    } catch {
      // Ignore parse errors
    }
  }

  // Eleventy: .eleventy.js or eleventy.config.js
  if (
    existsSync(join(cwd, '.eleventy.js')) ||
    existsSync(join(cwd, 'eleventy.config.js')) ||
    existsSync(join(cwd, 'eleventy.config.cjs'))
  ) {
    return 'eleventy';
  }

  return 'unknown';
}

function findExistingContentDir(cwd: string, framework: Framework): string | null {
  const config = FRAMEWORK_CONFIGS[framework];

  // Check if the expected drafts/posts dir exists
  if (existsSync(join(cwd, config.draftsDir))) return config.draftsDir;
  if (existsSync(join(cwd, config.postsDir))) return config.postsDir;

  // Check common alternatives
  const alternatives = [
    'content/posts',
    'content/blog',
    'src/content/blog',
    'src/content/posts',
    'src/posts',
    'src/blog',
    'posts',
    'blog',
    '_posts',
    '_drafts',
  ];

  for (const dir of alternatives) {
    if (existsSync(join(cwd, dir))) return dir;
  }

  return null;
}

function detectUsesMdx(cwd: string, contentDir: string): boolean {
  // Check package.json for MDX dependencies
  const packageJsonPath = join(cwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Common MDX packages
      if (
        deps['@mdx-js/mdx'] ||
        deps['@mdx-js/react'] ||
        deps['@next/mdx'] ||
        deps['next-mdx-remote'] ||
        deps['@astrojs/mdx'] ||
        deps['gatsby-plugin-mdx']
      ) {
        return true;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for existing .mdx files in content directory
  const fullContentDir = join(cwd, contentDir);
  if (existsSync(fullContentDir)) {
    try {
      const files = readdirSync(fullContentDir, { recursive: true });
      for (const file of files) {
        if (typeof file === 'string' && file.endsWith('.mdx')) {
          return true;
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return false;
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

function generateBlogPrompt(tweet: Tweet, threadTweets: Tweet[]): string {
  const isThread = threadTweets.length > 1;
  const threadContent = threadTweets.map((t, i) => `[${i + 1}] ${t.text}`).join('\n\n');

  const sourceDescription = isThread
    ? `This is a thread with ${threadTweets.length} tweets.`
    : tweet.isReply
      ? 'This is a reply to another tweet.'
      : 'This is an original post.';

  const totalEngagement = threadTweets.reduce(
    (sum, t) => sum + (t.likeCount || 0) + (t.replyCount || 0) + (t.retweetCount || 0),
    0
  );

  return `You are converting a successful X (Twitter) ${isThread ? 'thread' : 'post'} into a blog post draft.

${sourceDescription}

The content:
"""
${threadContent}
"""

Total engagement: ${totalEngagement} (likes + replies + retweets combined)

Create a blog post that:
1. Expands on the ideas from the ${isThread ? 'thread' : 'tweet'}
2. Adds context, examples, or deeper explanation
3. Maintains the voice and tone of the original
4. Is 500-1200 words
5. Has a compelling title
6. IMPORTANT: Include {{EMBED_PLACEHOLDER}} markers where you want X post embeds to appear (3-5 embeds total, spread throughout the post). The first embed should appear early to show the original inspiration.

Format your response as:

TITLE: [Your title here]

[Blog content in markdown with {{EMBED_PLACEHOLDER}} markers where embeds should go]`;
}

function generateXEmbed(tweet: Tweet): string {
  // Standard X/Twitter embed format that works with most frameworks
  return `<blockquote class="twitter-tweet"><a href="https://x.com/${tweet.authorUsername}/status/${tweet.id}"></a></blockquote>`;
}

function insertEmbeds(content: string, originalTweet: Tweet, repliesFromOthers: Tweet[]): string {
  // Select embeds: 1 from user (the original) + 2-4 from other users
  const otherEmbedCount = Math.min(Math.max(2, repliesFromOthers.length), 4);
  const selectedReplies = repliesFromOthers.slice(0, otherEmbedCount);

  // All tweets to embed: original first, then top replies from others
  const allEmbeds = [originalTweet, ...selectedReplies];

  // Replace placeholders with embeds
  let result = content;
  let embedIndex = 0;

  while (result.includes('{{EMBED_PLACEHOLDER}}') && embedIndex < allEmbeds.length) {
    result = result.replace('{{EMBED_PLACEHOLDER}}', generateXEmbed(allEmbeds[embedIndex]));
    embedIndex++;
  }

  // Remove any remaining placeholders
  result = result.replace(/\{\{EMBED_PLACEHOLDER\}\}/g, '');

  // Add Twitter widget script at the end if we have embeds
  if (embedIndex > 0) {
    result += '\n\n<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>';
  }

  return result;
}

function generateFrontmatter(title: string, tweet: Tweet, frameworkConfig: FrameworkConfig): string {
  const date = new Date().toISOString().split('T')[0];

  const fields: Record<string, string | boolean> = {
    title: title.replace(/"/g, '\\"'),
    date: date,
    source_tweet: `https://x.com/${tweet.authorUsername}/status/${tweet.id}`,
  };

  // Add draft field if the framework uses it (vs drafts folder)
  if (frameworkConfig.draftField) {
    fields[frameworkConfig.draftField] = true;
  }

  if (frameworkConfig.frontmatterStyle === 'toml') {
    const lines = Object.entries(fields).map(([key, value]) => {
      if (typeof value === 'boolean') return `${key} = ${value}`;
      return `${key} = "${value}"`;
    });
    return `+++\n${lines.join('\n')}\n+++\n\n`;
  }

  // YAML (default)
  const lines = Object.entries(fields).map(([key, value]) => {
    if (typeof value === 'boolean') return `${key}: ${value}`;
    return `${key}: "${value}"`;
  });
  return `---\n${lines.join('\n')}\n---\n\n`;
}

function generateFilename(title: string, frameworkConfig: FrameworkConfig, useMdx: boolean): string {
  const date = new Date().toISOString().split('T')[0];
  const ext = useMdx ? 'mdx' : 'md';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  if (frameworkConfig.useDateInFilename) {
    return `${date}-${slug}.${ext}`;
  }
  return `${slug}.${ext}`;
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

    // Detect framework and setup output directory
    // Priority: CLI --output > config blog.outputDir > auto-detect > framework default
    const framework = detectFramework(cwd);
    const frameworkConfig = FRAMEWORK_CONFIGS[framework];

    let outputDir: string;
    if (options.output) {
      outputDir = options.output;
    } else if (config.blog?.outputDir) {
      outputDir = config.blog.outputDir;
    } else {
      // Try to find existing content directory, or use framework default
      const existingDir = findExistingContentDir(cwd, framework);
      outputDir = existingDir || frameworkConfig.draftsDir;
    }

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Detect if site uses MDX
    const useMdx = detectUsesMdx(cwd, outputDir);

    if (framework !== 'unknown') {
      logger.success(`Detected ${frameworkConfig.name} project`);
    }
    logger.info(`Output: ${outputDir}/*.${useMdx ? 'mdx' : 'md'}`)

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

      // Fetch thread content
      logger.info(style.cyan('Fetching thread...'));
      let threadTweets = await apiService.getThread(tweet.id);

      // Fall back to single tweet if thread fetch fails
      if (threadTweets.length === 0) {
        threadTweets = [tweet];
      }

      if (threadTweets.length > 1) {
        logger.info(style.dim(`Found ${threadTweets.length} tweets in thread`));
      }

      // Fetch replies from other users for embedding
      logger.info(style.cyan('Fetching replies from others...'));
      const repliesFromOthers = await apiService.getRepliesFromOthers(tweet.id, 20);
      if (repliesFromOthers.length > 0) {
        logger.info(style.dim(`Found ${repliesFromOthers.length} replies from others`));
      }

      // Generate blog post
      logger.info(style.cyan('Generating blog post...'));

      const prompt = generateBlogPrompt(tweet, threadTweets);
      const response = await llm.generate(prompt);
      const { title, content } = parseBlogResponse(response);

      // Insert X embeds: 1 from user + 2-4 from others
      const contentWithEmbeds = insertEmbeds(content, threadTweets[0], repliesFromOthers);

      // Create filename and path using framework conventions
      const filename = generateFilename(title, frameworkConfig, useMdx);
      const filepath = join(outputDir, filename);

      // Write file with frontmatter
      const frontmatter = generateFrontmatter(title, tweet, frameworkConfig);
      writeFileSync(filepath, frontmatter + contentWithEmbeds);

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
