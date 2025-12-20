import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FileSystemService } from '../services/file-system.js';
import { XAuthService } from '../services/x-auth.js';
import { XApiService } from '../services/x-api.js';
import { logger } from '../utils/logger.js';
import { isShippostProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';
import type { UserV2WithMetrics, TweetV2WithMetrics } from '../types/x-api-responses.js';

const STATS_CACHE_FILE = '.shippost-stats-cache.json';
const STATS_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour (Basic tier has strict rate limits)

interface TweetWithMetrics {
  id: string;
  text: string;
  createdAt: string;
  impressions: number;
  likes: number;
  replies: number;
  retweets: number;
  quotes: number;
  bookmarks: number;
  engagementRate: number;
}

interface FetchError {
  isRateLimit: boolean;
  resetTime?: Date;
  message?: string;
  code?: number;
  details?: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatPercent(n: number): string {
  return `${n.toFixed(2)}%`;
}

function truncate(str: string, len: number): string {
  const oneLine = str.replace(/\n/g, ' ').trim();
  if (oneLine.length <= len) return oneLine;
  return oneLine.slice(0, len - 1) + '…';
}

function renderProgressBar(current: number, goal: number, width: number = 30): string {
  const { style } = logger;
  const pct = Math.min(1, current / goal);
  const filled = Math.round(pct * width);
  const empty = width - filled;

  let color = style.red;
  if (pct >= 1) color = style.brightGreen;
  else if (pct >= 0.5) color = style.yellow;
  else if (pct >= 0.25) color = style.yellow;

  return color('█'.repeat(filled)) + style.dim('░'.repeat(empty));
}

function renderSparkline(values: number[]): string {
  if (values.length === 0) return '';
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  return values.map(v => {
    const idx = Math.round(((v - min) / range) * (chars.length - 1));
    return chars[idx];
  }).join('');
}

export async function statsCommand(): Promise<void> {
  const cwd = process.cwd();
  const { style } = logger;

  try {
    if (!isShippostProject(cwd)) {
      throw new NotInitializedError();
    }

    const fs = new FileSystemService(cwd);
    const config = fs.loadConfig();

    const clientId = config.x?.clientId;
    if (!clientId) {
      logger.error('X API not configured. Run `ship analyze-x --setup` first.');
      process.exit(1);
    }

    const apiTier = config.x?.apiTier || 'free';
    if (apiTier !== 'basic') {
      logger.error('Stats command requires Basic X API tier.');
      logger.info(style.dim('Add "apiTier": "basic" to your .shippostrc.json'));
      process.exit(1);
    }

    // Header
    console.log();
    console.log(style.bold('┌─────────────────────────────────────────────────────────────────────┐'));
    console.log(style.bold('│') + '                        ' + style.brightCyan(style.bold('📊 X STATS DASHBOARD')) + '                        ' + style.bold('│'));
    console.log(style.bold('└─────────────────────────────────────────────────────────────────────┘'));

    // Authenticate
    const authService = new XAuthService(cwd, clientId);
    const accessToken = await authService.getValidToken();
    const apiService = new XApiService(accessToken);

    // Get user info with public metrics
    const me = await apiService.getMe();
    const meWithMetrics = await getMeWithMetrics(accessToken);

    // Account Section
    console.log();
    console.log(style.bold(' 👤 ACCOUNT'));
    console.log(style.dim(' ─────────────────────────────────────────────────────────────────────'));
    console.log(`    ${style.cyan('@' + me.username)}  ${style.dim(me.name)}`);
    if (meWithMetrics) {
      console.log();
      console.log(`    ${style.bold(formatNumber(meWithMetrics.followers))} ${style.dim('followers')}    ${style.bold(formatNumber(meWithMetrics.following))} ${style.dim('following')}    ${style.bold(formatNumber(meWithMetrics.tweets))} ${style.dim('tweets')}`);
    }

    // Fetch recent tweets with metrics (up to 500 to cover ~30 days)
    // Uses caching to avoid rate limits
    const cacheFile = join(cwd, STATS_CACHE_FILE);
    let tweets: TweetWithMetrics[] = [];
    let usingCache = false;

    // Try to load from cache first
    let cachedData: { tweets: TweetWithMetrics[]; timestamp: number; userId: string } | null = null;
    if (existsSync(cacheFile)) {
      try {
        cachedData = JSON.parse(readFileSync(cacheFile, 'utf8'));
      } catch {
        // Ignore invalid cache
      }
    }

    // Check if cache is fresh and for same user
    const cacheIsFresh = cachedData &&
      cachedData.userId === me.id &&
      Date.now() - cachedData.timestamp < STATS_CACHE_MAX_AGE;

    if (cacheIsFresh && cachedData) {
      tweets = cachedData.tweets;
      usingCache = true;
      logger.info(style.dim('\n    Using cached data (less than 1 hour old)'));
    } else {
      logger.info(style.dim('\n    Fetching recent tweets (this may take a moment)...'));
      try {
        // Fetch only 100 tweets (1 API call) to conserve rate limit
        // Basic tier allows only 5 userTimeline requests per 15 min
        tweets = await getRecentTweetsWithMetrics(accessToken, me.id, 100);
        // Cache the results
        writeFileSync(cacheFile, JSON.stringify({
          tweets,
          timestamp: Date.now(),
          userId: me.id,
        }));
      } catch (error) {
        const fetchError = error as FetchError;
        if (fetchError.isRateLimit) {
          // Try to use stale cache
          if (cachedData && cachedData.userId === me.id) {
            tweets = cachedData.tweets;
            usingCache = true;
            const age = Math.round((Date.now() - cachedData.timestamp) / 60000);
            logger.warn(`⏳ Rate limited - using cached data from ${age} min ago`);
            if (fetchError.resetTime) {
              const waitMins = Math.ceil((fetchError.resetTime.getTime() - Date.now()) / 60000);
              logger.info(style.dim(`   Rate limit resets in ${waitMins} minute${waitMins !== 1 ? 's' : ''}`));
            }
          } else {
            logger.error('⏳ X API rate limit reached and no cached data available');
            if (fetchError.resetTime) {
              const resetDate = new Date(fetchError.resetTime);
              logger.info(style.dim(`   Resets at ${resetDate.toLocaleTimeString()}`));
            } else {
              logger.info(style.dim('   Try again in ~15 minutes'));
            }
            process.exit(1);
          }
        } else {
          // Show detailed error for debugging
          logger.error(`Failed to fetch tweets: ${fetchError.message || 'Unknown error'}`);
          if (fetchError.code) logger.info(style.dim(`   Error code: ${fetchError.code}`));
          if (fetchError.details && fetchError.details !== '{}') logger.info(style.dim(`   Details: ${fetchError.details}`));
          process.exit(1);
        }
      }
    }

    if (tweets.length === 0) {
      logger.warn('No recent tweets found');
      return;
    }

    // Calculate aggregate stats
    const now = new Date();
    const last24h = tweets.filter(t => (now.getTime() - new Date(t.createdAt).getTime()) < 24 * 60 * 60 * 1000);
    const last7d = tweets.filter(t => (now.getTime() - new Date(t.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000);
    const last30d = tweets.filter(t => (now.getTime() - new Date(t.createdAt).getTime()) < 30 * 24 * 60 * 60 * 1000);

    // Calculate actual data coverage (oldest tweet age in days)
    const oldestTweet = tweets.length > 0 ? tweets[tweets.length - 1] : null;
    const oldestTweetAge = oldestTweet
      ? Math.floor((now.getTime() - new Date(oldestTweet.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const dataCoverageDays = Math.max(1, oldestTweetAge);

    const sumMetrics = (arr: TweetWithMetrics[]) => ({
      impressions: arr.reduce((s, t) => s + t.impressions, 0),
      likes: arr.reduce((s, t) => s + t.likes, 0),
      replies: arr.reduce((s, t) => s + t.replies, 0),
      retweets: arr.reduce((s, t) => s + t.retweets, 0),
      quotes: arr.reduce((s, t) => s + t.quotes, 0),
      bookmarks: arr.reduce((s, t) => s + t.bookmarks, 0),
      engagementRate: arr.length > 0 ? arr.reduce((s, t) => s + t.engagementRate, 0) / arr.length : 0,
    });

    const stats24h = sumMetrics(last24h);
    const stats7d = sumMetrics(last7d);
    const stats30d = sumMetrics(last30d);

    // Two-column layout helper
    const colWidth = 36;
    const pad = (s: string, w: number) => {
      // Strip ANSI codes for length calculation
      const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
      const padding = Math.max(0, w - stripped.length);
      return s + ' '.repeat(padding);
    };
    const printRow = (left: string, right: string) => {
      console.log(pad(left, colWidth) + ' │ ' + right);
    };
    const divider = () => console.log(style.dim('─'.repeat(colWidth) + '─┼─' + '─'.repeat(colWidth)));

    // Sparklines
    const dailyPosts = getDailyPostCounts(tweets, 14);
    const dailyImpressions = getDailyImpressions(tweets, 14);

    // 90-day goal calcs
    const dailyAvg = stats7d.impressions / 7;
    const projected90d = Math.round(dailyAvg * 90);
    const goal = 5_000_000;
    const pctOfGoal = (projected90d / goal) * 100;

    // Best times
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hourlyEngagement = getHourlyEngagement(last30d);
    const topHours = hourlyEngagement
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3);

    console.log();
    printRow(style.bold('📝 POSTING ACTIVITY'), style.bold('👀 IMPRESSIONS'));
    divider();
    printRow(`${style.dim('24h:')} ${style.bold(last24h.length.toString())} posts`, `${style.dim('24h posts:')} ${style.brightCyan(formatNumber(stats24h.impressions))}`);
    printRow(`${style.dim('7d:')}  ${style.bold(last7d.length.toString())} ${style.dim(`(${(last7d.length/7).toFixed(1)}/day)`)}`, `${style.dim('7d posts:')}  ${style.brightCyan(formatNumber(stats7d.impressions))} ${style.dim(`(${formatNumber(Math.round(stats7d.impressions/7))}/day)`)}`);
    // Only show 30d if we actually have >7 days of data
    if (dataCoverageDays > 7) {
      printRow(`${style.dim('30d:')} ${style.bold(last30d.length.toString())} ${style.dim(`(${(last30d.length/30).toFixed(1)}/day)`)}`, `${style.dim('30d posts:')} ${style.brightCyan(formatNumber(stats30d.impressions))} ${style.dim(`(${formatNumber(Math.round(stats30d.impressions/30))}/day)`)}`);
    } else {
      printRow(`${style.dim(`Data:`)} ${style.bold(tweets.length.toString())} ${style.dim(`posts over ${dataCoverageDays}d`)}`, '');
    }
    printRow(`${style.dim('Trend:')} ${style.cyan(renderSparkline(dailyPosts))}`, `${style.dim('Trend:')} ${style.cyan(renderSparkline(dailyImpressions))}`);

    console.log();
    printRow(style.bold('🎯 90-DAY GOAL: 5M'), style.bold('💬 ENGAGEMENT (7d)'));
    divider();
    printRow(`${style.dim('Pace:')} ${formatNumber(Math.round(dailyAvg))}${style.dim('/day')}`, `${style.red('♥')} ${style.bold(formatNumber(stats7d.likes))} ${style.dim('likes')}`);
    printRow(`${style.dim('Proj:')} ${pctOfGoal >= 100 ? style.brightGreen(formatNumber(projected90d)) : style.yellow(formatNumber(projected90d))}`, `${style.blue('💬')} ${style.bold(formatNumber(stats7d.replies))} ${style.dim('replies')}`);
    printRow(`${style.dim('Need:')} ${formatNumber(Math.round(goal/90))}${style.dim('/day')}`, `${style.green('↻')} ${style.bold(formatNumber(stats7d.retweets))} ${style.dim('retweets')}`);
    printRow(`${renderProgressBar(projected90d, goal, 20)} ${style.dim(`${pctOfGoal.toFixed(0)}%`)}`, `${style.magenta('❝')} ${style.bold(formatNumber(stats7d.quotes))} ${style.dim('quotes')}`);
    const goalMsg = pctOfGoal >= 100 ? style.brightGreen('✓ On track!') : style.dim(`+${formatNumber(Math.round((goal/90)-dailyAvg))}/day needed`);
    printRow(goalMsg, `${style.yellow('🔖')} ${style.bold(formatNumber(stats7d.bookmarks))} ${style.dim('bookmarks')}`);
    printRow('', `${style.dim('Eng rate:')} ${style.bold(formatPercent(stats7d.engagementRate))}`);

    console.log();
    printRow(style.bold(`⏰ BEST TIMES`), style.bold('🏆 TOP POST (7d)'));
    divider();
    const topPost = [...last7d].sort((a, b) => b.impressions - a.impressions)[0];
    printRow(`${topHours.map(h => style.bold(formatHour(h.hour))).join(' • ')}`, topPost ? `${style.bold(formatNumber(topPost.impressions))} imp • ${style.red('♥')}${formatNumber(topPost.likes)}` : '');
    printRow(style.dim(`(${timezone.split('/')[1] || timezone})`), topPost ? style.dim(truncate(topPost.text, 34)) : '');

    // Footer
    console.log();
    const cacheNote = usingCache ? ' (cached)' : '';
    console.log(style.dim(`─ Updated: ${new Date().toLocaleString()}${cacheNote} ─`));
    console.log();

  } catch (error) {
    logger.blank();
    logger.error((error as Error).message);
    process.exit(1);
  }
}

// Helper to get user metrics
async function getMeWithMetrics(accessToken: string): Promise<{ followers: number; following: number; tweets: number } | null> {
  try {
    const { TwitterApi } = await import('twitter-api-v2');
    const client = new TwitterApi(accessToken);
    const result = await client.v2.me({ 'user.fields': ['public_metrics'] });
    const userWithMetrics = result.data as UserV2WithMetrics;
    const metrics = userWithMetrics.public_metrics;
    return {
      followers: metrics?.followers_count || 0,
      following: metrics?.following_count || 0,
      tweets: metrics?.tweet_count || 0,
    };
  } catch {
    return null;
  }
}

// Helper to get tweets with full metrics (paginates to get up to `count` tweets)
async function getRecentTweetsWithMetrics(accessToken: string, userId: string, count: number): Promise<TweetWithMetrics[]> {
  try {
    const { TwitterApi } = await import('twitter-api-v2');
    const client = new TwitterApi(accessToken);

    const tweets: TweetWithMetrics[] = [];
    let paginationToken: string | undefined;

    // Paginate through results
    while (tweets.length < count) {
      const timeline = await client.v2.userTimeline(userId, {
        max_results: Math.min(100, count - tweets.length),
        'tweet.fields': ['created_at', 'public_metrics', 'organic_metrics', 'non_public_metrics'],
        exclude: ['retweets'],
        pagination_token: paginationToken,
      });

      if (!timeline.data?.data || timeline.data.data.length === 0) {
        break;
      }

      for (const tweet of timeline.data.data) {
        const tweetWithMetrics = tweet as TweetV2WithMetrics;
        const organic = tweetWithMetrics.organic_metrics;
        const pub = tweetWithMetrics.public_metrics;
        const nonPub = tweetWithMetrics.non_public_metrics;

        const impressions = organic?.impression_count || 0;
        const likes = pub?.like_count || 0;
        const replies = pub?.reply_count || 0;
        const retweets = pub?.retweet_count || 0;
        const quotes = pub?.quote_count || 0;
        const bookmarks = nonPub?.bookmark_count || pub?.bookmark_count || 0;

        const totalEngagement = likes + replies + retweets + quotes;
        const engagementRate = impressions > 0 ? (totalEngagement / impressions) * 100 : 0;

        tweets.push({
          id: tweet.id,
          text: tweet.text,
          createdAt: tweet.created_at || new Date().toISOString(),
          impressions,
          likes,
          replies,
          retweets,
          quotes,
          bookmarks,
          engagementRate,
        });

        if (tweets.length >= count) break;
      }

      // Get next page token
      paginationToken = timeline.data.meta?.next_token;
      if (!paginationToken) break;
    }

    return tweets;
  } catch (error) {
    // Check for rate limit
    const err = error as { code?: number; message?: string; rateLimitError?: boolean; rateLimit?: { reset?: number }; data?: unknown; errors?: unknown };
    if (err.code === 429 || err.message?.includes('429') || err.rateLimitError) {
      const resetTime = err.rateLimit?.reset
        ? new Date(err.rateLimit.reset * 1000)
        : undefined;
      throw { isRateLimit: true, resetTime, message: 'Rate limit reached' } as FetchError;
    }
    // Pass through other errors with details
    throw {
      isRateLimit: false,
      message: err.message || 'Unknown error',
      code: err.code,
      details: JSON.stringify(err.data || err.errors || {}, null, 2)
    } as FetchError;
  }
}

function getDailyPostCounts(tweets: TweetWithMetrics[], days: number): number[] {
  const counts: number[] = new Array(days).fill(0);
  const now = new Date();

  tweets.forEach(t => {
    const daysAgo = Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    if (daysAgo < days) {
      counts[days - 1 - daysAgo]++;
    }
  });

  return counts;
}

function getDailyImpressions(tweets: TweetWithMetrics[], days: number): number[] {
  const totals: number[] = new Array(days).fill(0);
  const now = new Date();

  tweets.forEach(t => {
    const daysAgo = Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    if (daysAgo < days) {
      totals[days - 1 - daysAgo] += t.impressions;
    }
  });

  return totals;
}

function getHourlyEngagement(tweets: TweetWithMetrics[]): { hour: number; avgEngagement: number }[] {
  const hourData: { total: number; count: number }[] = new Array(24).fill(null).map(() => ({ total: 0, count: 0 }));

  tweets.forEach(t => {
    const hour = new Date(t.createdAt).getHours();
    hourData[hour].total += t.engagementRate;
    hourData[hour].count++;
  });

  return hourData.map((data, hour) => ({
    hour,
    avgEngagement: data.count > 0 ? data.total / data.count : 0,
  }));
}

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}${ampm}`;
}
