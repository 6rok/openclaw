/**
 * Smart placeholder generator - uses LLM to generate natural reactions.
 *
 * TODO: Port to current `src/llm/stream.js` complete() API.
 * Currently returns a no-op generator; static emoji placeholders work fine.
 */

import type { SmartPlaceholderConfig } from "../../config/types.telegram.js";

export type SmartPlaceholderGenerator = {
  generateReaction: (userMessage: string, history?: Array<{ sender: string; body: string }>) => Promise<string>;
  generateToolDescription: (toolName: string, args?: string) => Promise<string>;
};

export async function createSmartPlaceholderGenerator(_opts: {
  config: SmartPlaceholderConfig;
  agentDir?: string;
  log?: (msg: string) => void;
}): Promise<SmartPlaceholderGenerator | null> {
  _opts.log?.("[smart-placeholder] LLM-generated reactions not yet ported to current API; using static fallback");
  return null;
}
