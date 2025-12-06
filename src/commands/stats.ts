import { FileSystemService } from '../services/file-system.js';
import { XAuthService } from '../services/x-auth.js';
import { XApiService } from '../services/x-api.js';
import { logger } from '../utils/logger.js';
import { isShippostProject } from '../utils/validation.js';
import { NotInitializedError } from '../utils/errors.js';

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

    // Fetch recent tweets with metrics
    logger.info(style.dim('\n    Fetching recent tweets...'));
    const tweets = await getRecentTweetsWithMetrics(accessToken, me.id, 100);

    if (tweets.length === 0) {
      logger.warn('No recent tweets found');
      return;
    }

    // Calculate aggregate stats
    const now = new Date();
    const last24h = tweets.filter(t => (now.getTime() - new Date(t.createdAt).getTime()) < 24 * 60 * 60 * 1000);
    const last7d = tweets.filter(t => (now.getTime() - new Date(t.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000);
    const last30d = tweets.filter(t => (now.getTime() - new Date(t.createdAt).getTime()) < 30 * 24 * 60 * 60 * 1000);

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

    // Posting Activity Section
    console.log();
    console.log(style.bold(' 📝 POSTING ACTIVITY'));
    console.log(style.dim(' ─────────────────────────────────────────────────────────────────────'));
    console.log(`    ${style.dim('Last 24h:')}  ${style.bold(last24h.length.toString())} posts`);
    console.log(`    ${style.dim('Last 7d:')}   ${style.bold(last7d.length.toString())} posts  ${style.dim(`(${(last7d.length / 7).toFixed(1)}/day avg)`)}`);
    console.log(`    ${style.dim('Last 30d:')}  ${style.bold(last30d.length.toString())} posts  ${style.dim(`(${(last30d.length / 30).toFixed(1)}/day avg)`)}`);

    // Daily posting sparkline
    const dailyPosts = getDailyPostCounts(tweets, 14);
    console.log();
    console.log(`    ${style.dim('14-day trend:')} ${style.cyan(renderSparkline(dailyPosts))} ${style.dim('(posts/day)')}`);

    // Impressions Section
    console.log();
    console.log(style.bold(' 👀 IMPRESSIONS'));
    console.log(style.dim(' ─────────────────────────────────────────────────────────────────────'));
    console.log(`    ${style.dim('Last 24h posts:')}  ${style.brightCyan(style.bold(formatNumber(stats24h.impressions)))}`);
    console.log(`    ${style.dim('Last 7d posts:')}   ${style.brightCyan(style.bold(formatNumber(stats7d.impressions)))}  ${style.dim(`(${formatNumber(Math.round(stats7d.impressions / 7))}/day avg)`)}`);
    console.log(`    ${style.dim('Last 30d posts:')}  ${style.brightCyan(style.bold(formatNumber(stats30d.impressions)))}  ${style.dim(`(${formatNumber(Math.round(stats30d.impressions / 30))}/day avg)`)}`);

    // Daily impressions sparkline
    const dailyImpressions = getDailyImpressions(tweets, 14);
    console.log();
    console.log(`    ${style.dim('14-day trend:')} ${style.cyan(renderSparkline(dailyImpressions))}`);

    // 90-day Goal
    const dailyAvg = stats7d.impressions / 7;
    const projected90d = Math.round(dailyAvg * 90);
    const goal = 5_000_000;
    const pctOfGoal = (projected90d / goal) * 100;

    console.log();
    console.log(style.bold(' 🎯 90-DAY GOAL: 5M IMPRESSIONS'));
    console.log(style.dim(' ─────────────────────────────────────────────────────────────────────'));
    console.log(`    ${style.dim('Current pace:')}     ${formatNumber(Math.round(dailyAvg))}${style.dim('/day')}`);
    console.log(`    ${style.dim('Projected 90d:')}    ${pctOfGoal >= 100 ? style.brightGreen(formatNumber(projected90d)) : style.yellow(formatNumber(projected90d))}`);
    console.log(`    ${style.dim('Required pace:')}    ${formatNumber(Math.round(goal / 90))}${style.dim('/day')}`);
    console.log();
    console.log(`    ${renderProgressBar(projected90d, goal)} ${style.dim(`${pctOfGoal.toFixed(1)}%`)}`);

    if (pctOfGoal < 100) {
      const needed = Math.round((goal / 90) - dailyAvg);
      console.log(`    ${style.dim(`Need +${formatNumber(needed)}/day to hit goal`)}`);
    } else {
      console.log(`    ${style.brightGreen('✓ On track to exceed goal!')}`);
    }

    // Engagement Section
    console.log();
    console.log(style.bold(' 💬 ENGAGEMENT (last 7 days)'));
    console.log(style.dim(' ─────────────────────────────────────────────────────────────────────'));
    console.log(`    ${style.red('♥')}  ${style.bold(formatNumber(stats7d.likes))} ${style.dim('likes')}        ${style.blue('💬')} ${style.bold(formatNumber(stats7d.replies))} ${style.dim('replies')}`);
    console.log(`    ${style.green('↻')}  ${style.bold(formatNumber(stats7d.retweets))} ${style.dim('retweets')}     ${style.magenta('❝')}  ${style.bold(formatNumber(stats7d.quotes))} ${style.dim('quotes')}`);
    console.log(`    ${style.yellow('🔖')} ${style.bold(formatNumber(stats7d.bookmarks))} ${style.dim('bookmarks')}`);
    console.log();
    console.log(`    ${style.dim('Avg engagement rate:')} ${style.bold(formatPercent(stats7d.engagementRate))}`);

    // Top Posts Section
    console.log();
    console.log(style.bold(' 🏆 TOP POSTS (by impressions, last 7 days)'));
    console.log(style.dim(' ─────────────────────────────────────────────────────────────────────'));

    const topPosts = [...last7d]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3);

    topPosts.forEach((post, i) => {
      const medal = ['🥇', '🥈', '🥉'][i];
      console.log();
      console.log(`    ${medal} ${style.bold(formatNumber(post.impressions))} ${style.dim('impressions')}  •  ${style.red('♥')} ${formatNumber(post.likes)}  ${style.blue('💬')} ${formatNumber(post.replies)}  ${style.green('↻')} ${formatNumber(post.retweets)}`);
      console.log(`       ${style.dim(truncate(post.text, 60))}`);
      console.log(`       ${style.dim(`https://x.com/${me.username}/status/${post.id}`)}`);
    });

    // Best Times Section (based on engagement rate)
    console.log();
    console.log(style.bold(' ⏰ BEST POSTING TIMES (by engagement)'));
    console.log(style.dim(' ─────────────────────────────────────────────────────────────────────'));

    const hourlyEngagement = getHourlyEngagement(last30d);
    const topHours = hourlyEngagement
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3);

    console.log(`    ${topHours.map(h => style.bold(formatHour(h.hour))).join('  •  ')}`);
    console.log(`    ${style.dim('(based on avg engagement rate from last 30 days)')}`);

    // Footer
    console.log();
    console.log(style.dim(' ─────────────────────────────────────────────────────────────────────'));
    console.log(style.dim(`    Last updated: ${new Date().toLocaleString()}`));
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
    const metrics = (result.data as any).public_metrics;
    return {
      followers: metrics?.followers_count || 0,
      following: metrics?.following_count || 0,
      tweets: metrics?.tweet_count || 0,
    };
  } catch {
    return null;
  }
}

// Helper to get tweets with full metrics
async function getRecentTweetsWithMetrics(accessToken: string, userId: string, count: number): Promise<TweetWithMetrics[]> {
  try {
    const { TwitterApi } = await import('twitter-api-v2');
    const client = new TwitterApi(accessToken);

    const tweets: TweetWithMetrics[] = [];
    const timeline = await client.v2.userTimeline(userId, {
      max_results: Math.min(count, 100),
      'tweet.fields': ['created_at', 'public_metrics', 'organic_metrics', 'non_public_metrics'],
      exclude: ['retweets'],
    });

    for await (const tweet of timeline) {
      const organic = (tweet as any).organic_metrics || {};
      const pub = (tweet as any).public_metrics || {};
      const nonPub = (tweet as any).non_public_metrics || {};

      const impressions = organic.impression_count || 0;
      const likes = pub.like_count || 0;
      const replies = pub.reply_count || 0;
      const retweets = pub.retweet_count || 0;
      const quotes = pub.quote_count || 0;
      const bookmarks = nonPub.bookmark_count || pub.bookmark_count || 0;

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

    return tweets;
  } catch {
    return [];
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
