export interface XTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
}

export interface XTokensStore {
  x?: XTokens;
}

/**
 * Twitter API extended user metrics (not always available depending on API tier)
 */
export interface XPublicMetrics {
  followers_count?: number;
  following_count?: number;
  tweet_count?: number;
  listed_count?: number;
}

/**
 * Twitter API tweet public metrics
 */
export interface XTweetPublicMetrics {
  like_count?: number;
  reply_count?: number;
  retweet_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
}

/**
 * Twitter API organic metrics (available on Basic tier)
 */
export interface XTweetOrganicMetrics {
  impression_count?: number;
  reply_count?: number;
  retweet_count?: number;
  like_count?: number;
}

/**
 * Twitter API non-public metrics (available on Basic tier)
 */
export interface XTweetNonPublicMetrics {
  impression_count?: number;
  url_link_clicks?: number;
  user_profile_clicks?: number;
  bookmark_count?: number;
}

/**
 * Extended user object with public metrics
 */
export interface XUserWithMetrics {
  id: string;
  username: string;
  name: string;
  public_metrics?: XPublicMetrics;
}

/**
 * Extended tweet with metrics and note_tweet for long tweets
 */
export interface XTweetWithMetrics {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: XTweetPublicMetrics;
  organic_metrics?: XTweetOrganicMetrics;
  non_public_metrics?: XTweetNonPublicMetrics;
  note_tweet?: {
    text: string;
  };
  referenced_tweets?: Array<{
    type: 'replied_to' | 'quoted' | 'retweeted';
    id: string;
  }>;
}

/**
 * API error structure from Twitter API v2
 */
export interface XApiError {
  code?: number;
  message?: string;
  rateLimitError?: boolean;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };
}
