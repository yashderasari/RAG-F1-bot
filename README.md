# RAG-F1 Bot

An AI-powered Formula 1 chatbot built on Next.js 15 with an MCP-orchestrated architecture. GPT-4o-mini receives tool definitions at query time and decides whether to pull from a vector store (historical knowledge) or call the OpenF1 REST API (live race data) — or both.

---

## Architecture

```
Browser
  │
  ▼
app/api/chat/route.ts
  │
  ├── getMcpTools()  [mcp/client.ts]
  │     │
  │     ├── mcp/servers/openf1/        ← live race data (6 tools)
  │     └── mcp/servers/vector-store/  ← Astra DB semantic search (1 tool)
  │
  └── streamText(gpt-4o-mini, tools)
        ← model decides which tools to call →
        ← streams answer to browser
```

Both MCP servers spawn as stdio child processes on the first request and are reused via `globalThis` across Next.js HMR cycles.

---

## Tools

### OpenF1 MCP Server (`mcp/servers/openf1/`)
Wraps the [OpenF1 REST API](https://openf1.org) with in-memory TTL caching:

| Tool | Description | Cache TTL |
|---|---|---|
| `get_race_results` | Race results for a given session | 1 hour |
| `get_standings` | Driver/constructor championship standings | 24 hours |
| `get_lap_times` | Lap-by-lap timing for a driver | indefinite (completed laps) |
| `get_weather` | Track weather conditions | 5 min (live) / 1 hr (after) |
| `get_session_info` | Session metadata (circuit, date, type) | 24 hours |
| `get_driver_info` | Driver profile and team info | 24 hours |

### Vector Store MCP Server (`mcp/servers/vector-store/`)

| Tool | Description |
|---|---|
| `search_f1_knowledge` | Semantic search over scraped F1 content (Wikipedia, Formula1.com, Sky Sports) |

Embeddings: `text-embedding-3-small` (1536 dims) stored in Astra DB.

Optional two-stage retrieval: set `RERANK_ENABLED=true` to overfetch top-25 from Astra, then rerank with Cohere `rerank-v3.5` and return top-5. Adds ~150–300ms and ~$0.002/query; falls back to bi-encoder on Cohere failure.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript |
| AI model | GPT-4o-mini via Vercel AI SDK (`streamText`) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Tool orchestration | MCP (stdio transport), two child-process servers |
| Vector database | Astra DB (DataStax) |
| Live data | OpenF1 REST API |
| Optional reranker | Cohere `rerank-v3.5` |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Astra DB account with a collection created
- OpenAI API key
- (Optional) Cohere API key for reranking

### Environment Variables

Create `f1bot/.env`:

```env
ASTRA_DB_NAMESPACE=default_keyspace
ASTRA_DB_COLLECTION=f1bot
ASTRA_DB_API_ENDPOINT=https://...
ASTRA_DB_APPLICATION_TOKEN=AstraCS:...
OPENAI_API_KEY=sk-...
COHERE_API_KEY=...        # optional — required when RERANK_ENABLED=true
RERANK_ENABLED=false      # set true to enable two-stage retrieval
```

### Install & Run

```bash
cd f1bot
npm install
npm run dev        # starts dev server at localhost:3000
```

MCP servers start automatically on the first chat request — no manual startup needed.

### Seed the Vector Store

```bash
npm run seed       # scrape F1 sources → chunk → embed → upsert to Astra DB
```

Re-running requires manually dropping the Astra DB collection first (the script calls `createCollection`, which errors if the collection already exists).

---

## Commands

All commands run from `f1bot/`:

```bash
npm run dev            # dev server with Turbopack
npm run build          # production build
npm run start          # serve production build
npm run seed           # scrape + embed + load Astra DB
npm run mcp:openf1     # run OpenF1 MCP server standalone (debugging)
npm run mcp:vector     # run vector-store MCP server standalone (debugging)
npm run eval:baseline  # retrieval eval — bi-encoder only
npm run eval:rerank    # retrieval eval — with Cohere reranker
npm run lint           # ESLint
```

### Retrieval Evaluation

`scripts/evalRetrieval.ts` runs 15 golden queries from `scripts/eval/golden.json` and reports hit-rate@5 and MRR. Results are written to `scripts/eval/results-{timestamp}-{mode}.json`.

```bash
npm run eval:baseline   # measure bi-encoder retrieval quality
npm run eval:rerank     # measure lift from Cohere reranking
```

---

## Key Design Decisions

- **No query rewriting**: GPT-4o-mini crafts the `search_f1_knowledge` query argument itself — a dedicated rewrite step is redundant when the model controls tool inputs.
- **stdio transport + singleton**: MCP servers are spawned once and stored on `globalThis` to avoid per-request startup overhead.
- **gpt-4o-mini for cost**: ~$0.001/question. `get_standings` is the most expensive tool call (24 OpenF1 API calls/season) and is aggressively cached.
- **`get_standings` caveat**: Does not include the +1 fastest-lap bonus point; final standings may differ by ≤1 point per driver from official F1 totals.
- **Embedding model lock-in**: Changing from `text-embedding-3-small` requires a full reseed of Astra DB.
