# t2p

> **transcripts → posts**: Transform meeting transcripts into engaging social media content using local LLMs.

## Overview

t2p is a CLI tool that processes meeting transcripts, notes, and other written content into social media post ideas using Ollama. Keep your content pipeline local and private—no data leaves your machine.

## Features

- ✅ **Local LLM Processing** — Uses Ollama for privacy-first content generation
- ✅ **Customizable Style** — Define your brand voice and posting style
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
│   └── work.md         # Generation instructions
├── posts.jsonl         # Generated posts (created after first run)
└── .t2prc.json         # Configuration
```

## Output Format

Generated posts are stored in `posts.jsonl` as newline-delimited JSON:

```json
{"id":"uuid","sourceFile":"input/meeting.txt","content":"Your generated post...","metadata":{"model":"llama3.1","temperature":0.7},"timestamp":"2024-01-15T10:30:00.000Z","status":"draft"}
```

Each post has a status:
- `draft` — Newly generated, not yet staged
- `staged` — Sent to Typefully
- `published` — Posted to social media

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
- [x] Configurable models and generation settings
- [x] JSONL output format with full metadata

**Planned Features**
- [ ] `t2p stage <n>` — Typefully integration for staging posts
- [ ] `t2p analyze x` — Generate style guide from your X posts (X free API)
- [ ] `t2p analyze` — Success metrics analysis (X Basic API, $200/mo)
- [ ] News-aware post generation (incorporate trending topics)
- [ ] LinkedIn support
- [ ] Multiple output format support (CSV, Markdown)

## License

MIT
