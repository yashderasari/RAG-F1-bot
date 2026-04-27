# Lessons Learned

## Project: RAG-F1 MCP Upgrade

### [2026-04-26] Source URL not persisted during seeding
Current `scripts/loadDb.ts:53-56` only stores `text` per chunk — the source URL is not persisted. The `search_f1_knowledge` tool therefore cannot return `source_url` in its response. Future work: update `loadDb.ts` to include `source_url` field in the upserted document, and re-run seeding.
