/**
 * Smart placeholder generator - uses LLM to generate natural reactions.
 */

import { complete, getModel, type Api, type Context, type Model } from "@mariozechner/pi-ai";
import fs from "node:fs/promises";
import path from "node:path";
import type { SmartPlaceholderConfig } from "../../config/types.telegram.js";

const SOUL_MAX_CHARS = 800; // Only use first ~800 chars of SOUL.md

async function loadSoulPersonality(agentDir?: string): Promise<string | undefined> {
  if (!agentDir) return undefined;
  try {
    const soulPath = path.join(agentDir, "SOUL.md");
    const content = await fs.readFile(soulPath, "utf-8");
    // Take first N chars, try to break at a sentence/paragraph
    if (content.length <= SOUL_MAX_CHARS) {
      return content.trim();
    }
    const truncated = content.slice(0, SOUL_MAX_CHARS);
    // Try to break at last newline or period
    const lastBreak = Math.max(
      truncated.lastIndexOf("\n\n"),
      truncated.lastIndexOf("。"),
      truncated.lastIndexOf(". "),
    );
    if (lastBreak > SOUL_MAX_CHARS / 2) {
      return truncated.slice(0, lastBreak).trim();
    }
    return truncated.trim() + "...";
  } catch {
    return undefined;
  }
}

const DEFAULT_SYSTEM_PROMPT = `You are generating a brief, natural reaction to show while processing a user's message.
Your response should be casual, like a friend acknowledging they heard you.
Keep it SHORT (under 10 words). Use emoji sparingly.
Examples: "嗯让我看看...", "哦这个啊", "稍等 我查查", "有点意思"
DO NOT answer the question - just acknowledge it naturally.`;

function buildReactionSystemPrompt(personality?: string): string {
  if (personality) {
    return `You are generating a brief, natural reaction while processing a user's message.

Your personality: ${personality}

Rules:
- Keep it SHORT (under 10 words)
- Stay in character
- Use emoji sparingly
- DO NOT answer the question - just acknowledge it naturally
- React like you would in a casual chat`;
  }
  return DEFAULT_SYSTEM_PROMPT;
}

const DEFAULT_TOOL_SYSTEM_PROMPT = `You are generating a brief status message while using a tool.
Describe what you're doing naturally, like telling a friend.
Keep it SHORT (under 15 words). Use emoji sparingly.
Examples: "翻翻文件...", "让我搜一下", "看看日历", "查查天气"
DO NOT explain the tool technically - describe the action naturally.`;

export type HistoryMessage = {
  sender: string;
  body: string;
};

export type SmartPlaceholderGenerator = {
  generateReaction: (
    userMessage: string,
    history?: HistoryMessage[],
  ) => Promise<string | undefined>;
  generateToolDescription: (
    toolName: string,
    args?: Record<string, unknown>,
  ) => Promise<string | undefined>;
};

export async function createSmartPlaceholderGenerator(params: {
  config: SmartPlaceholderConfig;
  agentDir?: string;
  getApiKey?: (provider: string) => Promise<string | undefined>;
  log?: (message: string) => void;
}): Promise<SmartPlaceholderGenerator | null> {
  const { config, agentDir, getApiKey, log } = params;

  if (!config.enabled) {
    return null;
  }

  const provider = config.provider ?? "openai";
  const modelId = config.model ?? "gpt-4o-mini";
  const maxTokens = config.maxTokens ?? 60;
  const timeoutMs = config.timeoutMs ?? 3000;

  // Load personality: config.personality > config.systemPrompt > SOUL.md > default
  let personality = config.personality;
  if (!personality && !config.systemPrompt) {
    personality = await loadSoulPersonality(agentDir);
    if (personality) {
      log?.(`Loaded personality from SOUL.md (${personality.length} chars)`);
    }
  }

  let model: Model<Api>;
  try {
    // Use type assertion since we're passing dynamic provider/model strings
    model = getModel(provider as "openai", modelId as "gpt-4o-mini");
  } catch (err) {
    log?.(`Failed to get model for smart placeholder: ${err}`);
    return null;
  }

  // Rough estimate: 1 token ≈ 4 chars for mixed content
  const MAX_HISTORY_CHARS = 1500; // ~375 tokens for history

  const generateReaction = async (
    userMessage: string,
    history?: HistoryMessage[],
  ): Promise<string | undefined> => {
    const systemPrompt = config.systemPrompt ?? buildReactionSystemPrompt(personality);

    // Build context with history - give as much as fits
    let userContent = userMessage;
    if (history && history.length > 0) {
      // Start from most recent, add until we hit char limit
      let historyText = "";
      let chars = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        const line = `${history[i].sender}: ${history[i].body}\n`;
        if (chars + line.length > MAX_HISTORY_CHARS) break;
        historyText = line + historyText;
        chars += line.length;
      }
      if (historyText) {
        userContent = `[Conversation so far]\n${historyText}\n[Now they say]\n${userMessage}`;
      }
    }

    const context: Context = {
      systemPrompt,
      messages: [
        {
          role: "user",
          content: userContent,
          timestamp: Date.now(),
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await complete(model, context, {
        maxTokens,
        signal: controller.signal,
        getApiKey,
      });

      clearTimeout(timeout);

      if (result.content && result.content.length > 0) {
        const text = result.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("")
          .trim();
        return text || undefined;
      }
      return undefined;
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") {
        log?.(`Smart reaction generation timed out after ${timeoutMs}ms`);
      } else {
        log?.(`Smart reaction generation failed: ${err}`);
      }
      return undefined;
    }
  };

  const generateToolDescription = async (
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<string | undefined> => {
    const systemPrompt = DEFAULT_TOOL_SYSTEM_PROMPT;

    // Build a simple description of what the tool is doing
    const argsStr = args ? JSON.stringify(args, null, 0) : "";
    const userPrompt = `Tool: ${toolName}\nArgs: ${argsStr}`;

    const context: Context = {
      systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
          timestamp: Date.now(),
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await complete(model, context, {
        maxTokens,
        signal: controller.signal,
        getApiKey,
      });

      clearTimeout(timeout);

      if (result.content && result.content.length > 0) {
        const text = result.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("")
          .trim();
        return text || undefined;
      }
      return undefined;
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") {
        log?.(`Smart tool description generation timed out after ${timeoutMs}ms`);
      } else {
        log?.(`Smart tool description generation failed: ${err}`);
      }
      return undefined;
    }
  };

  return {
    generateReaction,
    generateToolDescription,
  };
}
