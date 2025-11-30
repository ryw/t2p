# t2p

> **transcripts → posts**: Transform meeting transcripts into engaging social media content using local LLMs.

## Overview

t2p is a CLI tool that processes meeting transcripts, notes, and other written content into social media post ideas using Ollama. Keep your content pipeline local and private—no data leaves your machine.

## Features

- **Local LLM Processing** — Uses Ollama for privacy-first content generation
- **Customizable Style** — Define your brand voice and posting style
- **JSONL Output** — Generated posts stored in an append-only format for easy tracking
- **Typefully Integration** — Stage posts directly to Typefully drafts

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

```bash
# Use default settings
t2p work

# Use a specific model (coming soon)
t2p work --model llama3.1

# Verbose output (coming soon)
t2p work --verbose
```

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
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Project structure
src/
├── index.ts              # CLI entry point
├── types/
│   ├── config.ts         # Configuration types
│   └── post.ts           # Post types
├── services/
│   └── file-system.ts    # File operations
└── utils/
    ├── errors.ts         # Custom error classes
    ├── logger.ts         # Console output formatting
    └── validation.ts     # Config validation
```

## Roadmap

- [ ] `t2p init` — Initialize project structure
- [ ] `t2p work` — Process transcripts into posts
- [ ] `t2p stage` — Typefully integration
- [ ] `t2p analyze x` — Generate style from your X posts (free API)
- [ ] `t2p analyze` — Success metrics analysis (X Basic API, $200/mo)
- [ ] LinkedIn support

## License

MIT
