# Using Anthropic (Claude) with ship

This guide explains how to configure ship to use Anthropic's Claude models instead of local Ollama.

## Prerequisites

- An Anthropic API key (get one at https://console.anthropic.com/)

## Setup

### 1. Configure the Provider

Edit your `.shiprc.json` file and change the provider to `anthropic`:

```json
{
  "llm": {
    "provider": "anthropic"
  },
  "anthropic": {
    "model": "claude-3-5-sonnet-20241022",
    "maxTokens": 4096
  }
}
```

### 2. Set Your API Key

**Option A: Using .env file (Recommended)**

Create a `.env` file in your project directory:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

**Option B: Using environment variable**

Export the variable in your shell:

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

## Available Models

- `claude-3-5-sonnet-20241022` (default) - Best balance of intelligence, speed, and cost
- `claude-3-opus-20240229` - Most capable model, best for complex tasks
- `claude-3-sonnet-20240229` - Good balance for most tasks
- `claude-3-haiku-20240307` - Fastest and most cost-effective

## Usage

Once configured, use ship normally:

```bash
# Generate posts
ship work

# Override model
ship work --model claude-3-opus-20240229

# Check available strategies
ship work --list-strategies
```

## Configuration Options

In `.shiprc.json`:

```json
{
  "llm": {
    "provider": "anthropic"
  },
  "anthropic": {
    "model": "claude-3-5-sonnet-20241022",
    "maxTokens": 4096
  },
  "generation": {
    "temperature": 0.7,
    "postsPerTranscript": 8
  }
}
```

- `model`: Which Claude model to use
- `maxTokens`: Maximum tokens in response (default: 4096)
- `temperature`: Creativity level 0-1 (default: 0.7)

## Switching Back to Ollama

Edit `.shiprc.json` and change the provider back:

```json
{
  "llm": {
    "provider": "ollama"
  }
}
```

## Troubleshooting

### "API key not found" error

Make sure you've either:
- Created a `.env` file with `ANTHROPIC_API_KEY=...`
- Exported `ANTHROPIC_API_KEY` in your shell

### "API is not available" error

Check:
- Your API key is valid
- You have internet connectivity
- Your Anthropic account has credits

### Cost considerations

Anthropic charges per token. Monitor your usage at https://console.anthropic.com/

Approximate costs (as of 2024):
- Claude 3.5 Sonnet: $3/$15 per million tokens (input/output)
- Claude 3 Opus: $15/$75 per million tokens
- Claude 3 Haiku: $0.25/$1.25 per million tokens
