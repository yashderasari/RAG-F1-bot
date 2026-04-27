# RAG-F1 MCP Upgrade — Todo

## Phase 0: Setup
- [x] Create directory structure (`mcp/`, `tasks/`)
- [x] `npm install @modelcontextprotocol/sdk zod`
- [x] Add `mcp:vector` and `mcp:openf1` scripts to `package.json`

## Phase 1: OpenF1 MCP server (`mcp/servers/openf1/`)
- [x] `cache.ts` — TTL Map cache
- [x] `tools.ts` — get_session_info
- [x] `tools.ts` — get_driver_info
- [x] `tools.ts` — get_lap_times
- [x] `tools.ts` — get_weather
- [x] `tools.ts` — get_race_results
- [x] `tools.ts` — get_standings
- [x] `index.ts` — McpServer entry + register all tools
- [x] Smoke test: get_race_results(2024, "Monaco") → Leclerc P1 ✓

## Phase 2: Vector-store MCP server (`mcp/servers/vector-store/`)
- [x] `tools.ts` — search_f1_knowledge (extracted from old route.ts)
- [x] `index.ts` — McpServer entry
- [x] Smoke test: listTools() returns search_f1_knowledge ✓

## Phase 3: MCP client (`mcp/client.ts`)
- [x] Singleton with globalThis HMR guard
- [x] Spawn both servers via StdioClientTransport (node + ts-node bin)
- [x] Hand-write zod schemas in `mcp/types.ts`
- [x] `getMcpTools()` — return AI SDK tool() wrappers for all 7 tools
- [x] Verified: 7 tools registered end-to-end ✓

## Phase 4: Wire `app/api/chat/route.ts`
- [x] Remove: query-rewriting block, manual embed+Astra, docContext template
- [x] Replace with: streamText + getMcpTools() + gpt-4o-mini
- [x] New system prompt for tool selection guidance
- [x] End-to-end: live, historical, mixed, weather chain queries ✓

## Verification
- [x] "Who won the 2024 Monaco GP?" → get_race_results fires → Leclerc P1 ✓
- [x] "Tell me about Silverstone's history" → search_f1_knowledge only, real corpus answer ✓
- [x] "Compare Verstappen 2024 to Schumacher 2004" → get_standings + get_race_results for 2024, model knowledge for 2004 ✓
- [x] "Was it raining at Spa 2024 qualifying?" → get_session_info → get_weather (chained) ✓
- [x] DB seeded: 1000+ records in Astra DB ✓

## Phase 5: Cohere Reranker + Eval Harness
- [x] `tools.ts` — overfetch 25, cohereRerank(), fallback to bi-encoder on failure
- [x] `scripts/eval/golden.json` — 15 queries with expected_keywords
- [x] `scripts/evalRetrieval.ts` — hit-rate @ 5 + MRR runner, JSON results dump
- [x] `package.json` — eval:baseline, eval:rerank scripts
- [ ] Add COHERE_API_KEY + RERANK_ENABLED to f1bot/.env (manual)
- [ ] `npm run eval:baseline` → record baseline hit-rate
- [ ] `npm run eval:rerank` → measure lift (expect ≥10pp improvement)
- [ ] Failure-mode test: COHERE_API_KEY=invalid → confirm graceful fallback
