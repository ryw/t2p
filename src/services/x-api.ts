import { TwitterApi, TweetV2, UserV2 } from 'twitter-api-v2';
import type {
  TweetV2WithMetrics,
  UserV2WithMetrics,
  RateLimitInfo,
} from '../types/x-api-responses.js';

interface TwitterApiError {
  code?: number;
  message?: string;
  rateLimitError?: boolean;
  rateLimit?: {
    limit?: number;
    remaining?: number;
    reset?: number;
  };
}

export class RateLimitError extends Error {
  resetAt?: Date;

  constructor(message: string, resetAt?: Date) {
    super(message);
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

function handleApiError(error: TwitterApiError, context: string): never {
  // Check for rate limit (429)
  if (error.code === 429 || error.message?.includes('429') || error.rateLimitError) {
    const resetTime = error.rateLimit?.reset
      ? new Date(error.rateLimit.reset * 1000)
      : undefined;

    let message = `⏳ X API rate limit reached`;
    if (resetTime) {
      const waitMins = Math.ceil((resetTime.getTime() - Date.now()) / 60000);
      message += ` - resets in ${waitMins} minute${waitMins !== 1 ? 's' : ''}`;
    } else {
      message += ` - try again in ~15 minutes`;
    }
    message += `\n   💡 Tip: Use 'ship x-status' to check your rate limits`;

    throw new RateLimitError(message, resetTime);
  }

  // Check for auth errors (401, 403)
  if (error.code === 401 || error.code === 403) {
    throw new Error(
      `🔐 X API authentication error (${error.code})\n` +
      `   Try: rm .shippost-tokens.json && ship reply`
    );
  }

  // Generic error
  throw new Error(`${context}: ${error.message || 'Unknown error'}`);
}

export interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  authorId?: string;
  authorUsername?: string;
  authorName?: string;
  authorFollowersCount?: number;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
}

export class XApiService {
  private client: TwitterApi;

  constructor(accessToken: string) {
    this.client = new TwitterApi(accessToken);
  }

  /**
   * Get authenticated user's information
   */
  async getMe(): Promise<UserV2> {
    const { data } = await this.client.v2.me();
    return data;
  }

  /**
   * Fetch user's tweets
   */
  async getUserTweets(userId: string, maxResults: number = 100): Promise<Tweet[]> {
    const tweets: Tweet[] = [];

    // X API v2 limits to 100 results per request
    const limit = Math.min(maxResults, 100);

    try {
      const timeline = await this.client.v2.userTimeline(userId, {
        max_results: limit,
        'tweet.fields': ['created_at', 'text'],
        exclude: ['retweets', 'replies'], // Only get original tweets
      });

      for await (const tweet of timeline) {
        tweets.push({
          id: tweet.id,
          text: tweet.text,
          createdAt: tweet.created_at || new Date().toISOString(),
        });

        if (tweets.length >= maxResults) {
          break;
        }
      }

      return tweets;
    } catch (error) {
      handleApiError(error as TwitterApiError, 'Failed to fetch tweets');
    }
  }

  /**
   * Fetch authenticated user's own tweets
   */
  async getMyTweets(maxResults: number = 100): Promise<Tweet[]> {
    const user = await this.getMe();
    return this.getUserTweets(user.id, maxResults);
  }

  /**
   * Fetch home timeline (tweets from accounts the user follows)
   * @param maxResults - Maximum tweets to fetch
   * @param includeMetrics - If true, fetches follower counts (uses more API quota)
   */
  async getHomeTimeline(maxResults: number = 50, includeMetrics: boolean = false): Promise<Tweet[]> {
    const tweets: Tweet[] = [];
    const limit = Math.min(maxResults, 100);

    try {
      const userFields = includeMetrics
        ? ['username', 'name', 'public_metrics'] as const
        : ['username', 'name'] as const;

      const timeline = await this.client.v2.homeTimeline({
        max_results: limit,
        'tweet.fields': ['created_at', 'text', 'author_id', 'public_metrics', 'note_tweet'],
        expansions: ['author_id'],
        'user.fields': [...userFields],
        exclude: ['retweets'], // Include replies but not retweets
      });

      // Build author lookup map
      const authorMap = new Map<string, { username: string; name: string; followersCount?: number }>();
      if (timeline.includes?.users) {
        for (const user of timeline.includes.users) {
          const userWithMetrics = user as UserV2WithMetrics;
          authorMap.set(user.id, {
            username: user.username,
            name: user.name,
            followersCount: userWithMetrics.public_metrics?.followers_count,
          });
        }
      }

      for await (const tweet of timeline) {
        const tweetWithMetrics = tweet as TweetV2WithMetrics;
        const author = tweet.author_id ? authorMap.get(tweet.author_id) : undefined;
        const metrics = tweetWithMetrics.public_metrics;
        // Use note_tweet.text for full text of long tweets, fallback to text
        const noteTweet = tweetWithMetrics.note_tweet;
        const fullText = noteTweet?.text || tweet.text;
        tweets.push({
          id: tweet.id,
          text: fullText,
          createdAt: tweet.created_at || new Date().toISOString(),
          authorId: tweet.author_id,
          authorUsername: author?.username,
          authorName: author?.name,
          authorFollowersCount: author?.followersCount,
          likeCount: metrics?.like_count,
          replyCount: metrics?.reply_count,
          retweetCount: metrics?.retweet_count,
        });

        if (tweets.length >= maxResults) {
          break;
        }
      }

      return tweets;
    } catch (error) {
      handleApiError(error as TwitterApiError, 'Failed to fetch home timeline');
    }
  }

  /**
   * Post a reply to a tweet
   */
  async postReply(inReplyToTweetId: string, text: string): Promise<Tweet> {
    try {
      const result = await this.client.v2.reply(text, inReplyToTweetId);

      return {
        id: result.data.id,
        text: result.data.text,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      handleApiError(error as TwitterApiError, 'Failed to post reply');
    }
  }

  /**
   * Like a tweet
   */
  async likeTweet(tweetId: string): Promise<void> {
    try {
      const me = await this.client.v2.me();
      await this.client.v2.like(me.data.id, tweetId);
    } catch (error) {
      handleApiError(error as TwitterApiError, 'Failed to like tweet');
    }
  }

  /**
   * Get impression stats for user's tweets
   * Returns daily impressions for the last N days
   */
  async getImpressionStats(days: number = 7): Promise<{
    dailyImpressions: { date: string; impressions: number }[];
    totalImpressions: number;
  }> {
    try {
      const me = await this.getMe();

      // Fetch recent tweets with organic metrics (includes impressions)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const timeline = await this.client.v2.userTimeline(me.id, {
        max_results: 100,
        'tweet.fields': ['created_at', 'organic_metrics', 'public_metrics'],
        exclude: ['retweets'],
        start_time: startDate.toISOString(),
      });

      // Group impressions by date
      const dailyMap = new Map<string, number>();

      for await (const tweet of timeline) {
        const tweetWithMetrics = tweet as TweetV2WithMetrics;
        const tweetDate = new Date(tweet.created_at || '').toISOString().split('T')[0];
        const impressions = tweetWithMetrics.organic_metrics?.impression_count || 0;
        dailyMap.set(tweetDate, (dailyMap.get(tweetDate) || 0) + impressions);
      }

      // Convert to array sorted by date
      const dailyImpressions = Array.from(dailyMap.entries())
        .map(([date, impressions]) => ({ date, impressions }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const totalImpressions = dailyImpressions.reduce((sum, d) => sum + d.impressions, 0);

      return { dailyImpressions, totalImpressions };
    } catch {
      // Return empty stats if we can't fetch (might not have access)
      return { dailyImpressions: [], totalImpressions: 0 };
    }
  }

  /**
   * Get IDs of tweets the user has recently replied to
   * Used to avoid suggesting replies to tweets we've already replied to
   */
  async getMyRecentReplyTargets(maxResults: number = 100): Promise<Set<string>> {
    const repliedToIds = new Set<string>();

    try {
      const me = await this.getMe();

      // Fetch user's recent tweets INCLUDING replies
      const timeline = await this.client.v2.userTimeline(me.id, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['referenced_tweets'],
        // Don't exclude replies - we want them!
        exclude: ['retweets'],
      });

      for await (const tweet of timeline) {
        // Check if this tweet is a reply to another tweet
        const tweetWithMetrics = tweet as TweetV2WithMetrics;
        const referencedTweets = tweetWithMetrics.referenced_tweets;
        if (referencedTweets) {
          for (const ref of referencedTweets) {
            if (ref.type === 'replied_to') {
              repliedToIds.add(ref.id);
            }
          }
        }
      }

      return repliedToIds;
    } catch {
      // Return empty set on error - don't block the main flow
      return repliedToIds;
    }
  }

  /**
   * Get rate limit status for key endpoints
   */
  async getRateLimitStatus(): Promise<{
    user: { limit: number; remaining: number; reset: Date } | null;
    timeline: { limit: number; remaining: number; reset: Date } | null;
    tweets: { limit: number; remaining: number; reset: Date } | null;
  }> {
    const status = {
      user: null as { limit: number; remaining: number; reset: Date } | null,
      timeline: null as { limit: number; remaining: number; reset: Date } | null,
      tweets: null as { limit: number; remaining: number; reset: Date } | null,
    };

    try {
      // Check user endpoint rate limit
      const meResult = await this.client.v2.me();
      const meRateLimit = (meResult as unknown as { rateLimit?: RateLimitInfo }).rateLimit;
      if (meRateLimit) {
        status.user = {
          limit: meRateLimit.limit,
          remaining: meRateLimit.remaining,
          reset: new Date(meRateLimit.reset * 1000),
        };
      }
    } catch {
      // Ignore errors
    }

    try {
      // Check timeline endpoint rate limit (minimal request)
      const timelineResult = await this.client.v2.homeTimeline({ max_results: 10 });
      const timelineRateLimit = (timelineResult as unknown as { rateLimit?: RateLimitInfo }).rateLimit;
      if (timelineRateLimit) {
        status.timeline = {
          limit: timelineRateLimit.limit,
          remaining: timelineRateLimit.remaining,
          reset: new Date(timelineRateLimit.reset * 1000),
        };
      }
    } catch {
      // Ignore errors
    }

    return status;
  }
}
