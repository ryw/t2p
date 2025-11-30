# t2p

> **transcripts → posts**: Transform meeting transcripts and other notes into social media post drafts using local LLMs.

## Overview

t2p is a CLI tool that processes meeting transcripts, notes, and other written content into social media post ideas using Ollama. Keep your content pipeline local and private—no data leaves your machine.

## Features

- ✅ **Local LLM Processing** — Uses Ollama for privacy-first content generation
- ✅ **Customizable Style** — Define your brand voice and posting style
- ✅ **X Post Analysis** — Auto-generate style guides from your X (Twitter) posts
- ✅ **JSONL Output** — Generated posts stored in an append-only format for easy tracking
- ✅ **Multiple File Processing** — Batch process all transcripts in one command
- ⏳ **Typefully Integration** — Stage posts directly to Typefully drafts (coming soon)

## Prerequisites

- **Node.js** >= 18.0.0
- **Ollama** — [Install Ollama](https://ollama.ai) and ensure it's running (`ollama serve`)

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

# 5. Stage posts to Typefully (coming soon)
t2p stage 5
```

## Commands

### `t2p init`

Initialize a new t2p project in the current directory. Creates:

| Path | Description |
|------|-------------|
| `input/` | Directory for transcripts, notes, and source content |
| `prompts/style.md` | Your posting style, brand voice, and tone guidelines |
| `prompts/work.md` | Instructions for how posts should be generated |
| `prompts/system.md` | System prompt for post generation (advanced) |
| `prompts/analysis.md` | Style analysis prompt for X posts (advanced) |
| `prompts/banger-eval.md` | Viral potential scoring criteria (advanced) |
| `.t2prc.json` | Project configuration file |

### `t2p work`

Process all files in `input/` and generate new post ideas. Posts are appended to `posts.jsonl`.

**Options:**
- `-m, --model <model>` — Override the Ollama model from config
- `-v, --verbose` — Show detailed processing information

```bash
# Use default settings
t2p work

# Use a specific model
t2p work --model llama3.1

# Verbose output with processing details
t2p work --verbose

# Combine options
t2p work --model llama2 --verbose
```

**What it does:**
1. Validates environment (checks for Ollama and required files)
2. Loads your style guide and generation instructions
3. Scans `input/` for `.txt` and `.md` files
4. Processes each file through Ollama
5. Parses generated posts and saves to `posts.jsonl`
6. Displays summary with file counts and any errors

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

### `t2p stage <n>` *(coming soon)*

Stage the next `n` draft posts to Typefully.

```bash
# Stage 5 posts as Typefully drafts
t2p stage 5
```

## Configuration

Configuration is stored in `.t2prc.json`:

```json
{
  "ollama": {
    "host": "http://127.0.0.1:11434",
    "model": "llama3.1",
    "timeout": 60000
  },
  "generation": {
    "postsPerTranscript": 5,
    "temperature": 0.7
  }
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `ollama.host` | `http://127.0.0.1:11434` | Ollama server URL |
| `ollama.model` | `llama3.1` | LLM model to use |
| `ollama.timeout` | `60000` | Request timeout in milliseconds |
| `generation.postsPerTranscript` | `5` | Number of posts to generate per input file |
| `generation.temperature` | `0.7` | LLM temperature (0.0-1.0, higher = more creative) |

## Project Structure

After running `t2p init`, your project will look like:

```
your-project/
├── input/              # Your source content
│   ├── meeting-2024-01.txt
│   └── notes.md
├── prompts/
│   ├── style.md        # Brand voice & tone
│   ├── work.md         # Generation instructions
│   ├── system.md       # System prompt (advanced)
│   ├── analysis.md     # Style analysis prompt (advanced)
│   └── banger-eval.md  # Viral potential scoring (advanced)
├── posts.jsonl         # Generated posts (created after first run)
└── .t2prc.json         # Configuration
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
- **metadata.bangerScore** — Viral potential score (1-99)
- **metadata.bangerEvaluation** — Detailed scoring breakdown
- **timestamp** — When the post was generated
- **status** — `draft`, `staged`, or `published`

### Banger Score

Each generated post is automatically evaluated for its viral potential ("banger" score) on a scale of 1-99:

| Score Range | Potential |
|-------------|-----------|
| 1-20 | Low - unlikely to gain traction |
| 21-40 | Below average - limited reach |
| 41-60 | Average - decent engagement |
| 61-80 | High - strong engagement likely |
| 81-99 | Exceptional - viral potential |

The score is based on 7 key factors:
1. **Hook Strength** (20 pts) - Scroll-stopping opening, curiosity gaps
2. **Emotional Resonance** (20 pts) - Triggers awe, humor, surprise, FOMO
3. **Value & Shareability** (15 pts) - Actionable value, social currency
4. **Format & Structure** (15 pts) - Readability, pacing, visual appeal
5. **Relevance & Timing** (10 pts) - Taps into current conversations
6. **Engagement Potential** (10 pts) - Invites discussion, thought-provoking
7. **Authenticity & Voice** (10 pts) - Human, relatable, genuine

Use banger scores to prioritize which posts to publish first - start with your highest-scoring content!

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
cat posts.jsonl | jq '.content' -r

# 6. Process more content later
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
- `llama3.1` (default) — Good balance of quality and speed
- `llama2` — Faster, good for quick iterations
- `mixtral` — More creative outputs
- Experiment with different models using `--model` flag

**Output Management**
- `posts.jsonl` is append-only — never deletes old posts
- Use `jq` to filter and manipulate posts: `cat posts.jsonl | jq`
- Consider archiving old posts periodically

**Performance**
- Process files in batches to avoid overloading Ollama
- Use `--verbose` to debug slow or failing generations
- Adjust `temperature` in config for creativity vs consistency

## Troubleshooting

### Ollama is not available

```
✗ Ollama is not available. Please ensure Ollama is running.
```

**Solution:**
1. Install Ollama from https://ollama.ai
2. Start the server: `ollama serve`
3. Verify it's running: `curl http://localhost:11434`

### Model not found

```
✗ Model 'llama3.1' not found. Run: ollama pull llama3.1
```

**Solution:**
```bash
ollama pull llama3.1
```

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

## Roadmap

**Core Features (v0.1.0)**
- [x] `t2p init` — Initialize project structure
- [x] `t2p work` — Process transcripts into posts with Ollama
- [x] `t2p analyze-x` — Generate style guide from your X posts (X API v2 free tier)
- [x] Configurable models and generation settings
- [x] JSONL output format with full metadata

**Planned Features**
- [ ] `t2p stage <n>` — Typefully integration for staging posts
- [ ] `t2p analyze` — Success metrics analysis (X Basic API, $200/mo)
- [ ] News-aware post generation (incorporate trending topics)
- [ ] LinkedIn support
- [ ] Multiple output format support (CSV, Markdown)

## License

MIT
