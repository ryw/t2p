/**
 * Type definitions for X/Twitter API v2 responses.
 * These extend the twitter-api-v2 library types to include metrics
 * that are returned but not fully typed in the library.
 */

import type {
  TweetV2,
  UserV2,
  TweetPublicMetricsV2,
  TweetNonPublicMetricsV2,
  TweetOrganicMetricsV2,
  ReferencedTweetV2,
  NoteTweetV2,
} from 'twitter-api-v2';

/**
 * Public metrics returned for users when requested via user.fields
 */
export interface UserPublicMetrics {
  followers_count: number;
  following_count: number;
  tweet_count: number;
  listed_count?: number;
}

/**
 * Extended non-public metrics with bookmark_count which can appear in some responses
 */
export interface TweetNonPublicMetricsExtended extends TweetNonPublicMetricsV2 {
  bookmark_count?: number;
}

/**
 * Extended tweet type with all optional metric fields.
 * The library types don't fully expose these optional properties.
 */
export interface TweetV2WithMetrics extends TweetV2 {
  public_metrics?: TweetPublicMetricsV2;
  organic_metrics?: TweetOrganicMetricsV2;
  non_public_metrics?: TweetNonPublicMetricsExtended;
  note_tweet?: NoteTweetV2;
  referenced_tweets?: ReferencedTweetV2[];
}

/**
 * Extended user type with public metrics
 */
export interface UserV2WithMetrics extends UserV2 {
  public_metrics?: UserPublicMetrics;
}

/**
 * Rate limit information from API responses
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}
