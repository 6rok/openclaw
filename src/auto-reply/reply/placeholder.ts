/**
 * Placeholder message controller for chat platforms.
 *
 * Sends a temporary "thinking" message when processing starts,
 * then deletes or edits it when the actual response is ready.
 */

export type PlaceholderConfig = {
  /** Enable placeholder messages. Default: false. */
  enabled?: boolean;
  /** Custom messages to show while thinking. Randomly selected. */
  messages?: string[];
  /** Delete placeholder when response is ready. Default: true. */
  deleteOnResponse?: boolean;
  /** Show tool names as they're called. Default: false. */
  showTools?: boolean;
  /** Tool message format. Default: "🔧 Using {tool}..." */
  toolMessageFormat?: string;
};

export type PlaceholderSender = {
  send: (text: string) => Promise<{ messageId: string; chatId: string }>;
  edit: (messageId: string, text: string) => Promise<void>;
  delete: (messageId: string) => Promise<void>;
};

export type PlaceholderController = {
  /** Send initial placeholder message. */
  start: () => Promise<void>;
  /** Update placeholder with tool usage info. */
  onTool: (toolName: string) => Promise<void>;
  /** Clean up placeholder (delete or leave as-is). */
  cleanup: () => Promise<void>;
  /** Check if placeholder is active. */
  isActive: () => boolean;
};

const DEFAULT_MESSAGES = [
  "😈 Thinking...",
  "🧠 Processing...",
  "💭 Let me think...",
  "⚡ Working on it...",
];

const DEFAULT_TOOL_FORMAT = "🔧 Using {tool}...";

export function createPlaceholderController(params: {
  config: PlaceholderConfig;
  sender: PlaceholderSender;
  log?: (message: string) => void;
}): PlaceholderController {
  const { config, sender, log } = params;

  let placeholderMessageId: string | undefined;
  let active = false;
  let currentToolText = "";

  const messages = config.messages?.length ? config.messages : DEFAULT_MESSAGES;
  const toolFormat = config.toolMessageFormat ?? DEFAULT_TOOL_FORMAT;

  const getRandomMessage = () => {
    const idx = Math.floor(Math.random() * messages.length);
    return messages[idx] ?? messages[0] ?? DEFAULT_MESSAGES[0];
  };

  const start = async () => {
    if (!config.enabled) return;
    if (active) return;

    try {
      const text = getRandomMessage();
      const result = await sender.send(text);
      placeholderMessageId = result.messageId;
      active = true;
      log?.(`Placeholder sent: ${result.messageId}`);
    } catch (err) {
      log?.(`Failed to send placeholder: ${err}`);
    }
  };

  const onTool = async (toolName: string) => {
    if (!config.enabled || !config.showTools) return;
    if (!active || !placeholderMessageId) return;

    try {
      currentToolText = toolFormat.replace("{tool}", toolName);
      await sender.edit(placeholderMessageId, currentToolText);
      log?.(`Placeholder updated: ${toolName}`);
    } catch (err) {
      log?.(`Failed to update placeholder: ${err}`);
    }
  };

  const cleanup = async () => {
    if (!active || !placeholderMessageId) return;

    const shouldDelete = config.deleteOnResponse !== false;

    if (shouldDelete) {
      try {
        await sender.delete(placeholderMessageId);
        log?.(`Placeholder deleted: ${placeholderMessageId}`);
      } catch (err) {
        log?.(`Failed to delete placeholder: ${err}`);
      }
    }

    placeholderMessageId = undefined;
    active = false;
    currentToolText = "";
  };

  const isActive = () => active;

  return {
    start,
    onTool,
    cleanup,
    isActive,
  };
}
