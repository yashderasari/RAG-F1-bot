import { z } from "zod"

export const schemas = {
  search_f1_knowledge: z.object({
    query: z.string().describe("Natural language search query"),
    top_k: z.number().optional().default(5).describe("Number of chunks to retrieve"),
  }),
  get_session_info: z.object({
    year: z.number().describe("Season year"),
    country: z.string().optional().describe("Country name (e.g. 'Monaco', 'Belgium')"),
  }),
  get_driver_info: z.object({
    driver_number: z.number().optional().describe("Driver's race number"),
    session_key: z.number().optional().describe("Session identifier to scope the query"),
  }),
  get_lap_times: z.object({
    session_key: z.number().describe("Session identifier (from get_session_info)"),
    driver_number: z.number().optional().describe("Driver's race number"),
    lap_number: z.number().optional().describe("Specific lap number"),
  }),
  get_weather: z.object({
    session_key: z.number().describe("Session identifier (from get_session_info)"),
  }),
  get_race_results: z.object({
    year: z.number().describe("Season year"),
    meeting_name: z.string().optional().describe("GP name filter (e.g. 'Monaco', 'British')"),
  }),
  get_standings: z.object({
    year: z.number().describe("Season year"),
    type: z.enum(["driver", "constructor"]).describe("'driver' or 'constructor'"),
  }),
}
