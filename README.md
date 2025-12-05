# t2p

> **transcripts → posts**: Transform meeting transcripts and other notes into social media post drafts using local LLMs or cloud AI.

## Overview

t2p is a CLI tool that processes meeting transcripts, notes, and other written content into social media post ideas using local LLMs (Ollama) or cloud-based AI (Anthropic Claude). Keep your content pipeline local and private with Ollama, or leverage Claude's powerful language models for enhanced quality.

## Features

- ✅ **Flexible LLM Providers** — Choose between Ollama (local, privacy-first) or Anthropic Claude (cloud-based, high-quality)
- ✅ **Content Strategies** — 75 proven post formats for maximum variety and engagement
- ✅ **Customizable Style** — Define your brand voice and posting style
- ✅ **Community Examples** — Learn from real style.md examples shared by other users
- ✅ **X Post Analysis** — Auto-generate style guides from your X (Twitter) posts
- ✅ **JSONL Output** — Generated posts stored in an append-only format for easy tracking
- ✅ **Multiple File Processing** — Batch process all transcripts in one command
- ✅ **Post Review System** — Review posts interactively and mark as keep/reject
- ✅ **Typefully Integration** — Stage posts directly to Typefully drafts
- ✅ **Reply Guy Mode** — Find tweets to reply to and post replies via X API

## Prerequisites

- **Node.js** >= 18.0.0
- **LLM Provider** — Choose one:
  - **Ollama** (local) — [Install Ollama](https://ollama.ai) and ensure it's running (`ollama serve`)
  - **Anthropic Claude** (cloud) — Get an API key from [Anthropic Console](https://console.anthropic.com/)

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd t2p

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## Quick Start

```bash
# 1. Initialize a new t2p project
t2p init

# 2. Add your transcripts to the input/ directory
cp ~/meeting-notes.txt input/
# Or copy from Granola (see "Getting Transcripts from Granola" section below)
pbpaste > input/meeting-notes.txt

# 3. Customize your prompts
#    Edit prompts/style.md for your brand voice
#    Edit prompts/work.md for generation instructions

# 4. Generate posts
t2p work

# 5. Review and stage posts to Typefully
t2p posts             # View generated posts
t2p review            # Review posts interactively and stage to Typefully
```

## Commands

### `t2p init`

Initialize a new t2p project in the current directory. Creates:

| Path | Description |
|------|-------------|
| `input/` | Directory for transcripts, notes, and source content |
| `prompts/style.md` | Your posting style, brand voice, and tone guidelines |
| `prompts/work.md` | Instructions for how posts should be generated |
| `strategies.json` | **User-editable** content strategies (64 default strategies) |
| `prompts/system.md` | System prompt for post generation (advanced) |
| `prompts/analysis.md` | Style analysis prompt for X posts (advanced) |
| `prompts/content-analysis.md` | Content strategy selection prompt (advanced) |
| `prompts/banger-eval.md` | Viral potential scoring criteria (advanced) |
| `.t2prc.json` | Project configuration file |

### `t2p work`

Process all files in `input/` and generate new post ideas. Posts are appended to `posts.jsonl`.

**Options:**
- `-m, --model <model>` — Override the Ollama model from config
- `-v, --verbose` — Show detailed processing information
- `-f, --force` — Force reprocessing of all files (bypass tracking)
- `-c, --count <number>` — Number of posts to generate per file (default: 8)
- `-s, --strategy <id>` — Use a specific content strategy by ID
- `--strategies <ids>` — Use multiple strategies (comma-separated)
- `--list-strategies` — List all available content strategies
- `--category <category>` — Filter strategies by category (use with --list-strategies)
- `--no-strategies` — Disable strategy-based generation (use legacy mode)

```bash
# Use default settings (auto-selects 8 diverse strategies)
t2p work

# List all available content strategies
t2p work --list-strategies

# List strategies in a specific category
t2p work --list-strategies --category educational

# Use a specific strategy for all posts
t2p work --strategy bold-observation

# Use multiple specific strategies
t2p work --strategies "personal-story,how-to-guide,contrarian-take"

# Generate more posts per file
t2p work --count 12

# Use legacy mode (no strategies)
t2p work --no-strategies

# Use a specific model with verbose output
t2p work --model llama3.1 --verbose

# Force reprocessing with custom strategy
t2p work --force --strategy thread-lesson

# Combine options
t2p work --model llama2 --count 10 --verbose
```

**What it does:**
1. Validates environment (checks for Ollama and required files)
2. Loads your style guide and generation instructions
3. Scans `input/` for `.txt` and `.md` files
4. **Skips files that have already been processed** (unless `--force` is used)
5. Processes each file through Ollama
6. Parses generated posts and saves to `posts.jsonl`
7. Tracks processed files in `.t2p-state.json` to prevent duplicates
8. Displays summary with file counts and any errors

**File Tracking:**
t2p automatically tracks which files have been processed to prevent generating duplicate posts. Files are considered "processed" until they are modified. This means:
- Running `t2p work` multiple times will only process new or modified files
- Use `--force` to ignore tracking and reprocess all files
- The tracking state is stored in `.t2p-state.json` (not committed to git)

### `t2p analyze-x`

Generate a personalized style guide by analyzing your X (Twitter) posts. Uses X API v2 (free tier) to fetch your recent tweets and Ollama to analyze your writing patterns.

**Options:**
- `--count <n>` — Number of tweets to fetch (default: 33, max: 100)
- `--overwrite` — Overwrite existing style-from-analysis.md without prompting
- `--setup` — Reconfigure X API credentials

```bash
# First time setup (will prompt for X API credentials)
# Analyzes 33 tweets by default
t2p analyze-x

# Fetch more tweets for deeper analysis
t2p analyze-x --count 100

# Overwrite existing style guide
t2p analyze-x --overwrite

# Reconfigure X API credentials
t2p analyze-x --setup
```

**What it does:**
1. Configures X API OAuth 2.0 authentication (first time only)
2. Opens browser for you to authorize the app
3. Fetches your recent tweets (default: 33)
4. Analyzes writing patterns with Ollama
5. Generates and saves a personalized style guide to `prompts/style-from-analysis.md`

**Note:** The analysis is saved to `style-from-analysis.md` (not `style.md`) so you can review it first and merge insights into your main style guide as desired.

**Requirements:**
- Free X Developer account ([sign up here](https://developer.x.com/))
- X API app with OAuth 2.0 enabled
- Redirect URI set to: `http://127.0.0.1:3000/callback`
- Required scopes: `tweet.read`, `users.read`, `offline.access`

**First-time setup:**
1. Visit [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Create a new app (or use existing)
3. Enable OAuth 2.0 in app settings
4. Set redirect URI to `http://127.0.0.1:3000/callback`
5. Copy your Client ID
6. Run `t2p analyze-x` and paste Client ID when prompted

**Rate limits:**
- X API Free tier: 100 reads/month
- Can analyze once per month with free tier
- Upgrade to Basic ($200/month) for 10,000 reads if needed

### `t2p posts`

View recently generated posts in a human-readable format with filtering options.

**Options:**
- `-n, --count <number>` — Number of posts to show (default: 10)
- `--strategy <name>` — Filter by strategy name or ID
- `--min-score <score>` — Show posts with banger score >= N
- `--source <text>` — Filter by source file name
- `--eval` — Evaluate posts that are missing banger scores

```bash
# View last 10 posts
t2p posts

# View last 20 posts
t2p posts -n 20

# Filter by strategy
t2p posts --strategy "personal-story"

# Show only high-quality posts
t2p posts --min-score 70

# Show posts from specific source
t2p posts --source "meeting-2024"

# Evaluate posts missing banger scores
t2p posts --eval
```

### `t2p reply`

Find tweets from accounts you follow and generate contextual replies. Posts replies directly via X API.

**Options:**
- `--count <n>` — Number of tweets to analyze from timeline (default: 10)

**Review actions:**
- `Enter` — Post the suggested reply
- `e` — Edit the reply before posting
- `n` — Skip this tweet
- `q` — Quit reply session

```bash
# Find reply opportunities (default: 10 tweets)
t2p reply

# Analyze more tweets
t2p reply --count 20
```

**What it does:**
1. Authenticates with X API (reuses credentials from `t2p analyze-x`)
2. Fetches recent tweets from your home timeline
3. Uses LLM to identify 3-5 best reply opportunities
4. For each opportunity, generates a contextual reply following your style guide
5. Shows you the tweet + suggested reply
6. You choose: post, edit, skip, or quit
7. Posts approved replies directly via X API

**Reply Style:**
Replies follow the "Reply Style" section in `prompts/style.md`:
- Never promotional
- Add value (insight, wit, helpful info)
- Match your voice/tone
- Keep replies concise (1-2 sentences)

**X API Tiers:**
- **Free tier** (default): Basic timeline fetch, limited to ~15 requests per 15 minutes
- **Basic tier** ($100/month): Fetches follower counts, sorts by influence & recency

Configure your tier in `.t2prc.json`:
```json
{
  "x": {
    "clientId": "your-client-id",
    "apiTier": "basic"
  }
}
```

**Rate Limits:**
The free tier has strict limits. If you hit 429 errors:
- Wait 15 minutes and try again
- Use `--count 10` or less to reduce API calls
- Consider upgrading to Basic tier for more quota

**Requirements:**
- Same X API setup as `t2p analyze-x`
- App must have "Read and Write" permissions (not just "Read")
- Required scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`

If you get 403 errors when posting:
1. Go to [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Change app permissions to "Read and write"
3. Delete `.t2p-tokens.json` to force re-auth
4. Run `t2p reply` again

### `t2p review`

Interactively review posts one-by-one and decide their fate. Posts are shown sorted by banger score (highest first).

**Options:**
- `--min-score <score>` — Only review posts with score >= N

**Review actions:**
- `s` — Stage to Typefully (creates draft)
- `Enter` — Keep for later (status: keep)
- `n` — Reject (status: rejected)
- `q` — Quit review session

```bash
# Review all new posts
t2p review

# Only review high-quality posts
t2p review --min-score 70
```

**What it does:**
1. Loads all posts with status `new` or `keep`
2. Sorts by banger score (highest first)
3. Shows each post with score and strategy
4. Prompts for action: stage, keep, or reject
5. If staging, creates a Typefully draft and saves the draft ID
6. Updates post status immediately after each decision
7. Continues until all posts reviewed or you quit

**Post statuses:**
- `new` — Freshly generated, not yet reviewed
- `keep` — Marked as good, saved for future use
- `staged` — Sent to Typefully as a draft
- `rejected` — Marked as low quality, filtered out
- `published` — Reserved for future use

## Configuration

Configuration is stored in `.t2prc.json`:

**Using Ollama (default):**
```json
{
  "llm": {
    "provider": "ollama"
  },
  "ollama": {
    "host": "http://127.0.0.1:11434",
    "model": "llama3.1",
    "timeout": 60000
  },
  "generation": {
    "postsPerTranscript": 8,
    "temperature": 0.7,
    "strategies": {
      "enabled": true,
      "autoSelect": true,
      "diversityWeight": 0.7,
      "preferThreadFriendly": false
    }
  }
}
```

**Using Anthropic Claude:**
```json
{
  "llm": {
    "provider": "anthropic"
  },
  "anthropic": {
    "model": "claude-sonnet-4-5-20250929",
    "maxTokens": 4096
  },
  "generation": {
    "postsPerTranscript": 8,
    "temperature": 0.7,
    "strategies": {
      "enabled": true,
      "autoSelect": true,
      "diversityWeight": 0.7,
      "preferThreadFriendly": false
    }
  },
  "typefully": {
    "socialSetId": "1"
  }
}
```

Set your API keys in a `.env` file:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
TYPEFULLY_API_KEY=your-typefully-api-key-here
```

See [ANTHROPIC_SETUP.md](ANTHROPIC_SETUP.md) for detailed instructions on using Claude.

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `llm.provider` | `ollama` | LLM provider: `ollama` or `anthropic` |
| `ollama.host` | `http://127.0.0.1:11434` | Ollama server URL (when using Ollama) |
| `ollama.model` | `llama3.1` | Ollama model to use (when using Ollama) |
| `ollama.timeout` | `60000` | Request timeout in milliseconds (when using Ollama) |
| `anthropic.model` | `claude-3-5-sonnet-20241022` | Claude model to use (when using Anthropic) |
| `anthropic.maxTokens` | `4096` | Maximum tokens in response (when using Anthropic) |
| `generation.postsPerTranscript` | `8` | Number of posts to generate per input file |
| `generation.temperature` | `0.7` | LLM temperature (0.0-1.0, higher = more creative) |
| `generation.strategies.enabled` | `true` | Enable strategy-based post generation |
| `generation.strategies.autoSelect` | `true` | Auto-select strategies based on content analysis |
| `generation.strategies.diversityWeight` | `0.7` | Strategy diversity (0.0-1.0, higher = more diverse categories) |
| `generation.strategies.preferThreadFriendly` | `false` | Prioritize thread-friendly strategies |
| `x.clientId` | — | X API OAuth 2.0 Client ID |
| `x.apiTier` | `free` | X API tier: `free` or `basic` (affects reply command features) |
| `typefully.socialSetId` | `"1"` | Typefully Social Set ID (for multi-account setups) |

## Project Structure

After running `t2p init`, your project will look like:

```
your-project/
├── input/                    # Your source content
│   ├── meeting-2024-01.txt
│   └── notes.md
├── prompts/
│   ├── style.md              # Brand voice & tone
│   ├── work.md               # Generation instructions
│   ├── system.md             # System prompt (advanced)
│   ├── analysis.md           # Style analysis prompt (advanced)
│   ├── content-analysis.md   # Content strategy selection (advanced)
│   └── banger-eval.md        # Viral potential scoring (advanced)
├── strategies.json           # Content strategies (CUSTOMIZABLE!)
├── posts.jsonl               # Generated posts (created after first run)
└── .t2prc.json               # Configuration
```

## Output Format

Generated posts are stored in `posts.jsonl` as newline-delimited JSON:

```json
{
  "id":"uuid",
  "sourceFile":"input/meeting.txt",
  "content":"Your generated post...",
  "metadata":{
    "model":"llama3.1",
    "temperature":0.7,
    "strategy":{
      "id":"personal-story",
      "name":"Personal Story or Experience",
      "category":"personal"
    },
    "bangerScore":75,
    "bangerEvaluation":{
      "score":75,
      "breakdown":{
        "hook":18,
        "emotional":16,
        "value":12,
        "format":13,
        "relevance":8,
        "engagement":8,
        "authenticity":0
      },
      "reasoning":"Strong opening hook with curiosity gap..."
    }
  },
  "timestamp":"2024-01-15T10:30:00.000Z",
  "status":"draft"
}
```

Each post includes:
- **id** — Unique identifier
- **sourceFile** — Input file the post was generated from
- **content** — The post text
- **metadata.model** — Ollama model used
- **metadata.temperature** — Generation temperature
- **metadata.strategy** — Content strategy used (id, name, category)
- **metadata.bangerScore** — Viral potential score (1-99)
- **metadata.bangerEvaluation** — Detailed scoring breakdown
- **metadata.typefullyDraftId** — Typefully draft ID (if staged)
- **timestamp** — When the post was generated
- **status** — `new`, `keep`, `staged`, `rejected`, or `published`

### Banger Score

Each generated post is automatically evaluated for its viral potential ("banger" score) on a scale of 1-99:

| Score Range | Potential |
|-------------|-----------|
| 1-29 | Low - unlikely to gain traction |
| 30-49 | Below average - limited reach |
| 50-69 | Average - decent engagement |
| 70-84 | High - strong engagement likely |
| 85-99 | Exceptional - viral potential |

The score is based on 7 key factors:
1. **Hook Strength** (20 pts) - Scroll-stopping opening, curiosity gaps
2. **Emotional Resonance** (20 pts) - Triggers awe, humor, surprise, FOMO
3. **Value & Shareability** (15 pts) - Actionable value, social currency
4. **Format & Structure** (15 pts) - Readability, pacing, visual appeal
5. **Relevance & Timing** (10 pts) - Taps into current conversations
6. **Engagement Potential** (10 pts) - Invites discussion, thought-provoking
7. **Authenticity & Voice** (10 pts) - Human, relatable, genuine

Use banger scores to prioritize which posts to publish first - start with your highest-scoring content!

## Content Strategies

t2p includes **64 proven content strategies** inspired by Typefully's successful post formats. Strategies are **fully customizable** via `strategies.json` - add your own, modify existing ones, or remove strategies you don't need. Each strategy provides a unique angle or format for presenting your ideas, ensuring maximum variety and engagement across your content.

### What Are Content Strategies?

Content strategies are tested frameworks for structuring social media posts. Instead of generating generic posts, t2p applies specific strategies like:
- **Personal Story** - Share an experience, failure, or transformation
- **How-To Guide** - Provide step-by-step instructions
- **Bold Observation** - Make a provocative statement that captures attention
- **Before & After** - Show transformation or progress
- **Resource Thread** - Curate a list of valuable tools or links
- **Behind-the-Scenes** - Show your process or work-in-progress

### How It Works

**1. Content Analysis**
When you run `t2p work`, the system analyzes your transcript to identify characteristics:
- Does it contain personal stories?
- Does it include actionable advice?
- Are there strong opinions?
- Is it about a specific project?

**2. Strategy Selection**
Based on the analysis, t2p intelligently selects applicable strategies:
- Filters out strategies that don't fit your content (e.g., won't use "Personal Story" if there are no personal anecdotes)
- Ensures diversity across 7 categories (personal, educational, provocative, engagement, curation, behind-the-scenes, reflective)
- Uses weighted random selection to avoid over-representing any single category

**3. Post Generation**
Each post is generated using one specific strategy:
- The strategy's prompt is injected between your work instructions and the transcript
- The LLM generates a focused post following that strategy's format
- Strategy metadata is saved with each post for tracking

### Strategy Categories

| Category | Description | Example Strategies |
|----------|-------------|--------------------|
| **Personal** | Stories, experiences, transformations | Personal Story, Failure Story, Transformation |
| **Educational** | How-tos, frameworks, actionable tips | How-To Guide, Step-by-Step Framework, Quick Tip |
| **Provocative** | Bold statements, contrarian takes | Bold Observation, Contrarian Take, Myth Busting |
| **Engagement** | Questions, polls, thought experiments | Open Question, This or That, Thought Experiment |
| **Curation** | Lists, recommendations, resources | Resource List, Tool Recommendation, Thread of Links |
| **Behind-the-Scenes** | Process, work-in-progress, building | Building in Public, Process Share, WIP Update |
| **Reflective** | Lessons learned, retrospectives | Lesson Learned, Retrospective, Before & After |

### Using Strategies

**Auto-Select Mode (Default)**
```bash
# Automatically selects 8 diverse strategies per transcript
t2p work
```

**List Available Strategies**
```bash
# See all 75 strategies
t2p work --list-strategies

# Filter by category
t2p work --list-strategies --category educational
```

**Manual Strategy Selection**
```bash
# Use one specific strategy
t2p work --strategy personal-story

# Use multiple strategies
t2p work --strategies "how-to-guide,bold-observation,resource-list"

# Use 5 strategies from educational category
t2p work --strategies "how-to-guide,step-by-step,framework,quick-tip,common-mistakes"
```

**Control Post Count**
```bash
# Generate 12 posts instead of 8
t2p work --count 12

# Generate just 3 posts with specific strategies
t2p work --count 3 --strategies "personal-story,how-to-guide,bold-observation"
```

**Disable Strategies (Legacy Mode)**
```bash
# Use original batch generation (no strategies)
t2p work --no-strategies
```

### Customizing Strategies

Strategies are defined in `strategies.json` in your project root. This file is **fully editable** - modify existing strategies, add new ones, or remove strategies you don't use.

**Strategy Structure:**
```json
{
  "id": "my-custom-strategy",
  "name": "My Custom Strategy Name",
  "prompt": "The prompt that will be sent to the LLM to guide post generation...",
  "category": "personal",
  "threadFriendly": false,
  "applicability": {
    "requiresPersonalNarrative": true,
    "worksWithAnyContent": false
  }
}
```

**Fields:**
- **id** - Unique identifier (used with `--strategy` flag)
- **name** - Human-readable name shown in `--list-strategies`
- **prompt** - Instructions for the LLM on how to format this post type
- **category** - One of: `personal`, `educational`, `provocative`, `engagement`, `curation`, `behind-the-scenes`, `reflective`
- **threadFriendly** - `true` if this works well in threads, `false` for standalone posts
- **applicability** - Rules for when this strategy applies:
  - `requiresPersonalNarrative` - Needs personal stories
  - `requiresActionableKnowledge` - Needs how-to/tips content
  - `requiresResources` - Needs tool/book mentions
  - `requiresProject` - Needs project context
  - `requiresStrongOpinion` - Needs strong viewpoints
  - `worksWithAnyContent` - Always applicable (fallback strategies)

**Adding a Custom Strategy:**
```bash
# 1. Edit strategies.json
vim strategies.json

# 2. Add your strategy to the array
[
  ...existing strategies...,
  {
    "id": "weekly-reflection",
    "name": "Weekly Reflection Post",
    "prompt": "Share a key lesson or insight from this week. What did you learn? What surprised you? Keep it personal and relatable.",
    "category": "reflective",
    "threadFriendly": false,
    "applicability": {
      "worksWithAnyContent": true
    }
  }
]

# 3. Test your new strategy
t2p work --strategy weekly-reflection
```

**Removing Strategies:**
Simply delete the strategy object from the array in `strategies.json`. The system will continue to work with any number of strategies (even just one!).

**Modifying Prompts:**
Edit the `prompt` field to change how posts are generated. For example, you might want to add more specific instructions, change the tone, or adjust the format.

### Configuration

Fine-tune strategy behavior in `.t2prc.json`:

```json
{
  "generation": {
    "postsPerTranscript": 8,
    "strategies": {
      "enabled": true,
      "autoSelect": true,
      "diversityWeight": 0.7,
      "preferThreadFriendly": false
    }
  }
}
```

- **enabled** — Turn strategy system on/off
- **autoSelect** — Automatically select strategies based on content (vs. random)
- **diversityWeight** — How much to prioritize category diversity (0.0 = no preference, 1.0 = maximum diversity)
- **preferThreadFriendly** — Favor strategies that work well in threads

### Benefits

**Variety** — Never run out of angles. 64 default strategies ensure fresh approaches, and you can add unlimited custom strategies.

**Quality** — Proven formats that have driven engagement on social media.

**Control** — Full control over which strategies to use, or let the system auto-select intelligently.

**Tracking** — Strategy metadata in `posts.jsonl` lets you analyze which formats perform best.

**Efficiency** — One transcript becomes 8+ diverse posts without manual rewriting.

### Strategy Metadata

Each post includes strategy metadata you can use for analysis:

```bash
# See which strategies generated your posts
cat posts.jsonl | jq '{strategy: .metadata.strategy.name, score: .metadata.bangerScore, content: .content[:50]}'

# Group by strategy category
cat posts.jsonl | jq -r '.metadata.strategy.category' | sort | uniq -c

# Find your best-performing strategy
cat posts.jsonl | jq -r 'select(.metadata.bangerScore > 70) | .metadata.strategy.name' | sort | uniq -c | sort -rn

# View posts by status
cat posts.jsonl | jq -r '.status' | sort | uniq -c
```

## Getting Transcripts from Granola

[Granola](https://www.granola.ai/) is an AI meeting transcription tool. Here's how to get your meeting transcripts into t2p:

### Method 1: Manual Copy (Built-in)

1. Open your meeting note in Granola
2. Click the transcription button (3 vertical bars) at the bottom of the note
3. Click the copy button in the top right corner
4. Save to a file:
   ```bash
   pbpaste > input/meeting-2024-01-15.txt
   ```

### Method 2: Chrome Extension (Recommended)

The [Granola Transcriber Chrome extension](https://chromewebstore.google.com/detail/granola-transcriber/apoblbmhjjnfcefcmlidblklbjepfiin) provides one-click extraction:

1. Install the Granola Transcriber extension
2. Open your Granola note in Chrome
3. Click the extension to extract and copy the transcript
4. Save to your `input/` directory

### Method 3: Raycast Extension (Bulk Export)

For power users with [Raycast](https://www.raycast.com/):

1. Install the [Granola Raycast extension](https://www.raycast.com/Rob/granola)
2. Select multiple notes for bulk export
3. Use folder-aware filtering to organize transcripts
4. Export directly to your t2p `input/` directory

### Tips for Granola Users

- **Naming convention**: Use descriptive filenames like `YYYY-MM-DD-topic.txt` for easier tracking
- **Batch processing**: Export multiple meetings at once, then run `t2p work` to process them all
- **Integrations**: Granola also supports direct export to Notion, Hubspot, and Slack (no API/Zapier yet)
- **Clean transcripts**: Remove excessive filler words in Granola before exporting for better post quality

## Example Workflow

Here's a typical workflow for using t2p:

```bash
# 1. Set up a new project
mkdir my-content-pipeline
cd my-content-pipeline
t2p init

# 2. Customize your style
# Edit prompts/style.md to define your:
# - Voice and tone (casual, professional, humorous)
# - Brand guidelines
# - Format preferences (thread length, emoji usage)
# - Target audience

# 3. Add source content
cp ~/Downloads/meeting-notes-*.txt input/
echo "Today I learned..." > input/quick-thoughts.md

# 4. Generate posts
t2p work

# 5. Review generated posts
t2p posts

# 6. Review and stage to Typefully
t2p review --min-score 70

# 7. Process more content later
cp ~/new-transcript.txt input/
t2p work  # Appends new posts to posts.jsonl
```

## Customizing Prompts

All prompts used by t2p are stored as editable files in the `prompts/` directory. This allows you to customize the AI's behavior without touching any code.

### Prompt Files

**Core prompts** (edit these for best results):
- `prompts/style.md` - Your posting style, voice, and brand guidelines
- `prompts/work.md` - Instructions for how posts should be generated from transcripts

**Advanced prompts** (optional, for power users):
- `prompts/system.md` - System prompt wrapper for post generation
- `prompts/analysis.md` - Prompt used to analyze your X posts and generate style guides
- `prompts/content-analysis.md` - Criteria for analyzing transcript content and selecting strategies
- `prompts/banger-eval.md` - Scoring criteria for evaluating viral potential

### Why User-Editable Prompts?

- ✅ **No code changes needed** - Customize behavior by editing markdown files
- ✅ **Version controlled** - Track prompt changes with git
- ✅ **Easy experimentation** - Try different prompting strategies quickly
- ✅ **Project-specific** - Each project can have its own unique prompts

### When to Edit Prompts

**Edit `style.md`** when:
- You want to refine your brand voice
- You're not getting posts in the right tone
- You want to add/remove example posts

**Edit `work.md`** when:
- Posts need a different structure
- You want more/fewer posts per transcript
- You want to change quality criteria

**Edit `banger-eval.md`** (advanced) when:
- You want to adjust viral potential scoring criteria
- You need different scoring weights for the 7 factors
- You want to add or remove evaluation criteria
- You're optimizing for a specific platform beyond X/Twitter

**Edit `system.md` or `analysis.md`** (advanced) when:
- You want to change the core prompting strategy
- You're experimenting with prompt engineering
- You need very specific AI behavior

## Community Style Examples

Learn from real-world examples! The `community-examples/style/` directory contains style.md files contributed by the t2p community. Browse these to:

- See how others define their voice and tone
- Discover different writing styles (casual, professional, humorous, etc.)
- Learn formatting approaches (emoji usage, hashtag strategies, thread preferences)
- Find inspiration for your own style guide

### Using Community Examples

```bash
# Browse available examples
ls community-examples/style/

# Read an example
cat community-examples/style/example-technical-founder.md

# Copy as starting point for your style
cp community-examples/style/example-technical-founder.md prompts/style.md
# Then customize it with your own voice!
```

### Contributing Your Style

Have a style.md you're proud of? Share it with the community!

1. Copy your `prompts/style.md` to `community-examples/style/your-name.md`
2. Remove any private/sensitive information
3. Add a comment at the top with context (target audience, niche, what makes it unique)
4. Submit a PR

See `community-examples/style/README.md` for full contribution guidelines.

**Why contribute?**
- Help others learn from your experience
- Get feedback from the community
- Build a library of proven styles
- Showcase different use cases (dev tools, B2B SaaS, content creators, etc.)

## Tips & Best Practices

**Content Quality**
- Use well-structured transcripts with clear sections and key points
- Remove excessive filler words and tangents for better results
- Longer transcripts (500+ words) tend to generate better insights

**Prompts**
- Be specific in `prompts/style.md` about what you want
- Include 2-3 example posts that represent your ideal style
- Update `prompts/work.md` if posts aren't matching expectations

**Models**

When using Ollama:
- `llama3.1` (default) — Good balance of quality and speed
- `llama2` — Faster, good for quick iterations
- `mixtral` — More creative outputs
- Experiment with different models using `--model` flag

When using Anthropic Claude:
- `claude-sonnet-4-5-20250929` — Smartest model for complex agents and coding (recommended)
- `claude-haiku-4-5-20251001` — Fastest model with near-frontier intelligence
- `claude-opus-4-5-20251101` — Premium model combining maximum intelligence with practical performance
- `claude-opus-4-1-20250805` — Exceptional for specialized reasoning tasks
- See [ANTHROPIC_SETUP.md](ANTHROPIC_SETUP.md) for pricing details

**Output Management**
- `posts.jsonl` is append-only — never deletes old posts
- Use `jq` to filter and manipulate posts: `cat posts.jsonl | jq`
- Consider archiving old posts periodically

**Performance**
- Process files in batches to avoid overloading Ollama
- Use `--verbose` to debug slow or failing generations
- Adjust `temperature` in config for creativity vs consistency

**Content Strategies**
- Let auto-selection work its magic for most transcripts (it's intelligent!)
- Use `--list-strategies` to explore available formats
- Try manual strategy selection when you know exactly what format you want
- Analyze which strategies perform best using banger scores and engagement data
- Use `--count 12` for longer transcripts to get more variety
- Experiment with `diversityWeight` config (higher = more category diversity)
- Review strategy metadata to identify patterns in your best-performing posts

## Troubleshooting

### Ollama is not available

```
✗ Ollama is not available. Please ensure Ollama is running.
```

**Solution:**
1. Install Ollama from https://ollama.ai
2. Start the server: `ollama serve`
3. Verify it's running: `curl http://localhost:11434`

### Ollama model not found

```
✗ Model 'llama3.1' not found. Run: ollama pull llama3.1
```

**Solution:**
```bash
ollama pull llama3.1
```

### Anthropic API key not found

```
✗ Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or add to config.
```

**Solution:**
Create a `.env` file in your project directory:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

Or export the environment variable:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

### Anthropic API is not available

**Solution:**
- Check your API key is valid
- Verify you have internet connectivity
- Ensure your Anthropic account has credits
- Check the status at https://status.anthropic.com/

### Not a t2p project

```
✗ Not a t2p project. Run: t2p init
```

**Solution:** Run `t2p init` in your project directory, or ensure you're in the correct directory.

### Configuration error

Ensure your `.t2prc.json` is valid JSON and includes the required fields:

```json
{
  "ollama": {
    "host": "http://127.0.0.1:11434",
    "model": "llama3.1"
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Link globally for testing
npm link

# Issue tracking
bd list          # View all issues
bd ready         # See unblocked work
bd create "..."  # Create new issue
```

### Project Structure

```
src/
├── index.ts              # CLI entry point with Commander
├── commands/
│   ├── init.ts           # t2p init implementation
│   └── work.ts           # t2p work implementation
├── types/
│   ├── config.ts         # Configuration types
│   └── post.ts           # Post schema
├── services/
│   ├── file-system.ts    # File I/O and JSONL operations
│   └── ollama.ts         # Ollama API integration
└── utils/
    ├── errors.ts         # Custom error classes
    ├── logger.ts         # Console output (✓, ✗, →)
    └── validation.ts     # Config and project validation
```

### Issue Tracking

This project uses [bd (beads)](https://github.com/steveyegge/beads) for issue tracking. See `AGENTS.md` for AI agent workflow guidelines.

## Typefully Integration

t2p integrates with [Typefully](https://typefully.com/) to help you stage posts directly as drafts. This streamlines your workflow from transcript → posts → published content.

### Setup

1. **Get your Typefully API key:**
   - Log in to Typefully
   - Go to Settings > Integrations
   - Create an API key

2. **Add to your `.env` file:**
   ```bash
   TYPEFULLY_API_KEY=your-api-key-here
   ```

3. **(Optional) Configure Social Set ID:**
   If you have multiple social accounts in Typefully, specify which one to post to:
   ```json
   {
     "typefully": {
       "socialSetId": "1"
     }
   }
   ```
   The default is `"1"` (your first connected account). Check Typefully's API docs to find your Social Set IDs.

### Usage

**Interactive review and staging:**
```bash
# Review posts and stage the best ones
t2p review --min-score 70
```

During review:
- Press `s` to stage a post to Typefully
- The post is created as a draft in your Typefully account
- The draft URL is displayed for quick access
- Post status is updated to `staged` with the draft ID saved

**Filter staged posts:**
```bash
# See all staged posts
cat posts.jsonl | jq 'select(.status == "staged")'

# Get Typefully draft URLs
cat posts.jsonl | jq -r 'select(.metadata.typefullyDraftId) | .metadata.typefullyDraftId'
```

### Features

- ✅ Creates drafts for X/Twitter
- ✅ Saves Typefully draft ID and share URL
- ✅ Updates post status automatically
- ✅ Works with multi-account setups via `socialSetId`
- ✅ Handles errors gracefully (reverts status on failure)

### Notes

- Posts are created as **drafts**, not published immediately
- You can review and edit drafts in Typefully before publishing
- Requires Typefully Pro plan for API access
- Currently supports X/Twitter only (LinkedIn coming soon)

## Roadmap

**Core Features (v0.1.0)**
- [x] `t2p init` — Initialize project structure
- [x] `t2p work` — Process transcripts into posts with Ollama
- [x] `t2p analyze-x` — Generate style guide from your X posts (X API v2 free tier)
- [x] `t2p posts` — View and filter generated posts
- [x] `t2p review` — Interactive post review and staging
- [x] `t2p reply` — Reply guy mode with X API posting
- [x] Typefully integration for staging drafts
- [x] Configurable models and generation settings
- [x] JSONL output format with full metadata

**Planned Features**
- [ ] `t2p analyze` — Success metrics analysis (X Basic API, $200/mo)
- [ ] News-aware post generation (incorporate trending topics)
- [ ] LinkedIn support in Typefully integration
- [ ] Multiple output format support (CSV, Markdown)
- [ ] Bulk staging with `t2p stage <n>` command

## License

MIT
