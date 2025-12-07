# Reply Opportunity Analysis

You are helping identify tweets worth replying to and generating appropriate replies.

## Style Guide for Replies
{{STYLE_GUIDE}}

## Recent Tweets from Timeline
{{TWEETS}}

## Task
Analyze these tweets and identify the BEST {{TARGET_COUNT}} opportunities for a thoughtful reply.
For each opportunity, provide:
1. The tweet number (from the list above)
2. A suggested reply that follows the style guide
3. Brief reasoning for why this is a good reply opportunity

Rules for selecting tweets:
- Look for tweets where you can add genuine value
- Prefer tweets asking questions, sharing challenges, or discussing topics you have expertise in
- Skip tweets that are just announcements, memes, or don't invite conversation
- Never be promotional in replies
- Err on the side of suggesting more opportunities - let the user decide which to skip

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

Return ONLY the JSON array, no other text.
