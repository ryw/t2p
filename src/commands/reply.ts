import { createInterface } from 'readline';
import { FileSystemService } from '../services/file-system.js';
import { XAuthService } from '../services/x-auth.js';
import { XApiService, Tweet } from '../services/x-api.js';
import { createLLMService } from '../services/llm-factory.js';
import { logger } from '../utils/logger.js';
import { isT2pProject } from '../utils/validation.js';
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

function displayTweetForReply(opportunity: ReplyOpportunity, index: number, total: number): void {
  logger.blank();
  logger.info(`[${index + 1}/${total}] Reply opportunity`);
  logger.info('─'.repeat(72));

  // Original tweet
  const author = opportunity.tweet.authorUsername
    ? `@${opportunity.tweet.authorUsername}`
    : 'Unknown';
  logger.info(`${author}:`);
  const tweetLines = opportunity.tweet.text.split('\n');
  tweetLines.forEach((line) => {
    logger.info(`  ${line}`);
  });

  logger.blank();
  logger.info('Suggested reply:');
  logger.info('─'.repeat(72));
  const replyLines = opportunity.suggestedReply.split('\n');
  replyLines.forEach((line) => {
    logger.info(`  ${line}`);
  });
  logger.info('─'.repeat(72));
}

async function promptForReplyDecision(): Promise<'post' | 'edit' | 'skip' | 'quit'> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('\nEnter=post / e=edit / n=skip / q=quit: ', (answer) => {
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

async function editReply(currentReply: string): Promise<string> {
  logger.info('Enter your edited reply (press Enter twice to finish):');

  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let reply = '';
    let emptyLineCount = 0;

    rl.on('line', (line) => {
      if (line === '') {
        emptyLineCount++;
        if (emptyLineCount >= 1) {
          rl.close();
          resolve(reply.trim() || currentReply);
          return;
        }
        reply += '\n';
      } else {
        emptyLineCount = 0;
        reply += (reply ? '\n' : '') + line;
      }
    });

    // Show current reply as reference
    logger.info(`(Current: "${currentReply}")`);
  });
}

function buildReplyPrompt(
  styleGuide: string,
  tweets: Tweet[]
): string {
  const tweetsText = tweets
    .map((t, i) => {
      const author = t.authorUsername ? `@${t.authorUsername}` : 'Unknown';
      return `[${i + 1}] ${author}: ${t.text}`;
    })
    .join('\n\n');

  return `You are helping identify tweets worth replying to and generating appropriate replies.

## Style Guide for Replies
${styleGuide}

## Recent Tweets from Timeline
${tweetsText}

## Task
Analyze these tweets and identify the BEST 3-5 opportunities for a thoughtful reply.
For each opportunity, provide:
1. The tweet number (from the list above)
2. A suggested reply that follows the style guide
3. Brief reasoning for why this is a good reply opportunity

Rules for selecting tweets:
- Look for tweets where you can add genuine value
- Prefer tweets asking questions, sharing challenges, or discussing topics you have expertise in
- Skip tweets that are just announcements, memes, or don't invite conversation
- Never be promotional in replies

Rules for replies:
- Keep replies concise (1-2 sentences typically)
- Be helpful, witty, or add a unique perspective
- Match the conversational tone from the style guide
- Don't be sycophantic or overly agreeable

Output format (JSON array):
[
  {
    "tweetNumber": 1,
    "suggestedReply": "Your reply here",
    "reasoning": "Why this is a good opportunity"
  }
]

Return ONLY the JSON array, no other text.`;
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

    if (!isT2pProject(cwd)) {
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
      logger.error('X API not configured. Run `t2p analyze-x --setup` first.');
      process.exit(1);
    }

    const authService = new XAuthService(cwd, clientId);
    const accessToken = await authService.getValidToken();
    const apiService = new XApiService(accessToken);

    const user = await apiService.getMe();
    logger.success(`Authenticated as @${user.username}`);

    // Step 3: Fetch timeline and generate replies
    logger.section('[3/4] Finding reply opportunities...');

    const maxTweets = options.count || 10;
    logger.info(`Fetching ${maxTweets} tweets from your timeline...`);

    const tweets = await apiService.getHomeTimeline(maxTweets);

    if (tweets.length === 0) {
      logger.error('No tweets found in timeline');
      process.exit(1);
    }

    logger.success(`Fetched ${tweets.length} tweets`);

    // Load style guide
    const styleGuide = fs.loadPrompt('style.md');

    // Generate reply opportunities
    logger.info('Analyzing tweets for reply opportunities...');
    const prompt = buildReplyPrompt(styleGuide, tweets);
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
        replyText = await editReply(opportunity.suggestedReply);
        logger.info(`Edited reply: "${replyText}"`);
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
