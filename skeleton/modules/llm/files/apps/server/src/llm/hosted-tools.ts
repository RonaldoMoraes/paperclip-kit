import type { LlmFileSearchTool, LlmWebSearchTool } from "./llm.types";

/**
 * Builders for the OpenAI-hosted tool descriptors (file_search/web_search), so a
 * feature never hand-shapes one. Vector-store ids arrive as arguments — from the
 * feature's own config or a per-user record — never from source. A route that
 * carries these must be `hostedTools: true` in the registry, which pins its whole
 * chain to openai.
 */

export function fileSearchTool(
  vectorStoreId: string,
  options: { name: string; maxNumResults?: number }
): LlmFileSearchTool {
  return {
    type: "file_search",
    name: options.name,
    vectorStoreIds: [vectorStoreId],
    ...(options.maxNumResults !== undefined && { maxNumResults: options.maxNumResults }),
  };
}

export function webSearchTool(
  options: { searchContextSize?: LlmWebSearchTool["searchContextSize"] } = {}
): LlmWebSearchTool {
  return {
    type: "web_search",
    ...(options.searchContextSize !== undefined && { searchContextSize: options.searchContextSize }),
  };
}
