# t2p

## Objective

Process meeting transcripts into social media post ideas.

## Initial features

- Run `t2p init` in a new github repo, to bootstrap the repo for use. Creates:
  - `/input` where you will commit text files (meeting transcripts, writings, notes, etc)
  - `/prompts/style.md` - x posting style, brand, etc
  - `/prompts/work.md` — how to generate posts
- `t2p work`
  - Processes `/input` into new entries on `/posts.jsonl`
- `t2p stage <n>`
  - Stages `N` posts into Typefully as drafts (https://support.typefully.com/en/articles/8718287-typefully-api)

## Future Roadmap

- `t2p analyze x` if you setup X API (free), can run this command to generate `style-x-generated.md` from your most recent 50 X posts
- `t2p analyze` requires X BASIC API ($200/mo) - pull down success of ideas + themes. This data is used to inform the generation of new posts based on variations of older successful posts.
- LinkedIn support
