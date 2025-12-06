import { TwitterApi, TweetV2, UserV2 } from 'twitter-api-v2';

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
    } catch (error: any) {
      throw new Error(`Failed to fetch tweets: ${error.message || 'Unknown error'}`);
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
          authorMap.set(user.id, {
            username: user.username,
            name: user.name,
            followersCount: (user as any).public_metrics?.followers_count,
          });
        }
      }

      for await (const tweet of timeline) {
        const author = tweet.author_id ? authorMap.get(tweet.author_id) : undefined;
        const metrics = (tweet as any).public_metrics;
        // Use note_tweet.text for full text of long tweets, fallback to text
        const noteTweet = (tweet as any).note_tweet;
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
    } catch (error: any) {
      throw new Error(`Failed to fetch home timeline: ${error.message || 'Unknown error'}`);
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
    } catch (error: any) {
      throw new Error(`Failed to post reply: ${error.message || 'Unknown error'}`);
    }
  }
}
