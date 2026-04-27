import { streamText } from "ai"
import { openai } from "@ai-sdk/openai"
import { getMcpTools } from "@/mcp/client"

const SYSTEM_PROMPT = `You are an expert Formula One assistant.
- For race data from 2023 onwards (results, lap times, weather, standings, session schedules, driver rosters): use the OpenF1 tools — get_race_results, get_standings, get_lap_times, get_weather, get_session_info, get_driver_info.
- OpenF1 only covers 2023 and later. For any season before 2023, do NOT call OpenF1 tools — use search_f1_knowledge or your own knowledge instead.
- For historical context, regulations, team/driver biographies, circuit history, and analysis: use search_f1_knowledge.
- For comparative questions spanning history and recent seasons (e.g. "Compare X's 2024 to Schumacher's 2004"): use OpenF1 for the recent year and search_f1_knowledge or your own knowledge for the historical year.
Format responses with markdown where appropriate. Do not return images.`

export async function POST(req: Request) {
  const { messages } = await req.json()
  const tools = await getMcpTools()

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    maxSteps: 5,
  })

  return result.toDataStreamResponse()
}
