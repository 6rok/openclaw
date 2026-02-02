/**
 * Reaction tool - displays agent's natural reaction in tool status.
 *
 * This tool does nothing except allow the agent to express a brief reaction
 * that will be shown in the placeholder/tool status display.
 *
 * Usage: Agent calls reaction({ message: "让我看看" }) and the tool status
 * will display "💭 让我看看" instead of "🔧 Processing...".
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";

export function createReactionTool(): AnyAgentTool {
  return {
    name: "reaction",
    label: "React",
    description:
      "Express a brief, natural reaction before processing. " +
      "Use this at the start of complex tasks to show the user you're working on it. " +
      "The message will be displayed in the status indicator.",
    parameters: Type.Object({
      message: Type.String({
        description:
          "A brief, natural reaction (under 15 chars). " +
          'Examples: "让我看看", "嗯这个", "查一下"',
      }),
    }),
    execute: async (_toolCallId, _args) => {
      // The tool does nothing - the magic happens in onToolStart
      // where the message is extracted and displayed in the placeholder
      return {
        content: [{ type: "text", text: "ok" }],
        details: {},
      };
    },
  };
}
