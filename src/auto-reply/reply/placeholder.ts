/**
 * Placeholder message controller for chat platforms.
 *
 * Sends a temporary "thinking" message when processing starts,
 * then deletes or edits it when the actual response is ready.
 */

export type ToolDisplayConfig = {
  emoji?: string;
  label?: string;
};

export type PlaceholderConfig = {
  /** Enable placeholder messages. Default: false. */
  enabled?: boolean;
  /** Custom messages to show while thinking. Randomly selected. */
  messages?: string[];
  /** Delete placeholder when response is ready. Default: true. */
  deleteOnResponse?: boolean;
  /** Tool display overrides. Key is tool name. */
  toolDisplay?: Record<string, ToolDisplayConfig>;
  /**
   * Optional async function to generate a smart placeholder reaction.
   * Called with the user's message and recent history.
   * If provided, the placeholder will be updated with this text after initial send.
   */
  generateReaction?: (
    userMessage: string,
    history?: Array<{ sender: string; body: string }>,
  ) => Promise<string | undefined>;
  /**
   * Optional async function to generate a natural tool description.
   * Called with tool name and args, should return a natural description.
   */
  generateToolDescription?: (
    toolName: string,
    args?: Record<string, unknown>,
  ) => Promise<string | undefined>;
};

export type PlaceholderSender = {
  send: (text: string) => Promise<{ messageId: string; chatId: string }>;
  edit: (messageId: string, text: string) => Promise<void>;
  delete: (messageId: string) => Promise<void>;
};

export type PlaceholderController = {
  /** Send initial placeholder message. Optionally pass user message and history for smart reaction. */
  start: (userMessage?: string, history?: Array<{ sender: string; body: string }>) => Promise<void>;
  /** Update placeholder with tool usage info. */
  onTool: (toolName: string, args?: Record<string, unknown>) => Promise<void>;
  /** Clean up placeholder (delete or leave as-is). */
  cleanup: () => Promise<void>;
  /** Check if placeholder is active. */
  isActive: () => boolean;
};

const DEFAULT_MESSAGES = ["🤔 Thinking...", "💭 Processing...", "🧠 Working on it..."];

const DEFAULT_TOOL_FORMAT = "{emoji} {label}...";

export function createPlaceholderController(params: {
  config: PlaceholderConfig;
  sender: PlaceholderSender;
  log?: (message: string) => void;
}): PlaceholderController {
  const { config, sender, log } = params;

  let placeholderMessageId: string | undefined;
  let active = false;
  let currentToolText = "";
  let currentDisplayText = ""; // Track what's currently displayed to avoid duplicate edits

  const messages = config.messages?.length ? config.messages : DEFAULT_MESSAGES;

  const getRandomMessage = () => {
    const idx = Math.floor(Math.random() * messages.length);
    return messages[idx] ?? messages[0] ?? DEFAULT_MESSAGES[0];
  };

  const getToolDisplay = (toolName: string) => {
    const override = config.toolDisplay?.[toolName];
    return {
      emoji: override?.emoji ?? "🔧",
      label: override?.label ?? toolName,
    };
  };

  const start = async (userMessage?: string, history?: Array<{ sender: string; body: string }>) => {
    if (!config.enabled) return;
    if (active) return;

    try {
      const text = getRandomMessage();
      const result = await sender.send(text);
      placeholderMessageId = result.messageId;
      active = true;
      currentDisplayText = text;
      log?.(`Placeholder sent: ${result.messageId}`);

      // If generateReaction is provided and we have a user message,
      // fire off smart generation in parallel (don't await)
      if (config.generateReaction && userMessage && placeholderMessageId) {
        const msgId = placeholderMessageId;
        config
          .generateReaction(userMessage, history)
          .then(async (smartText) => {
            if (
              smartText &&
              active &&
              placeholderMessageId === msgId &&
              smartText !== currentDisplayText
            ) {
              try {
                await sender.edit(msgId, smartText);
                currentDisplayText = smartText;
                log?.(`Placeholder updated with smart reaction: ${smartText}`);
              } catch (editErr) {
                log?.(`Failed to update placeholder with smart reaction: ${editErr}`);
              }
            }
          })
          .catch((err) => {
            log?.(`Smart reaction generation failed: ${err}`);
          });
      }
    } catch (err) {
      log?.(`Failed to send placeholder: ${err}`);
    }
  };

  const onTool = async (toolName: string, args?: Record<string, unknown>) => {
    if (!config.enabled) return;
    if (!active || !placeholderMessageId) return;

    try {
      // Special handling for reaction tool: display the message directly
      if (toolName === "reaction" && args?.message && typeof args.message === "string") {
        currentToolText = `💭 ${args.message}`;
        if (currentToolText === currentDisplayText) {
          log?.(`Placeholder skip (same content): ${currentToolText}`);
          return;
        }
        await sender.edit(placeholderMessageId, currentToolText);
        currentDisplayText = currentToolText;
        log?.(`Placeholder updated with reaction: ${currentToolText}`);
        return; // Don't run smart generation for reaction tool
      }

      const display = getToolDisplay(toolName);
      currentToolText = `${display.emoji} ${display.label}...`;

      if (currentToolText === currentDisplayText) {
        log?.(`Placeholder skip (same content): ${currentToolText}`);
        return;
      }
      await sender.edit(placeholderMessageId, currentToolText);
      currentDisplayText = currentToolText;
      log?.(`Placeholder updated: ${toolName} -> ${currentToolText}`);

      // If generateToolDescription is provided, fire off smart generation in parallel
      if (config.generateToolDescription && placeholderMessageId) {
        const msgId = placeholderMessageId;
        config
          .generateToolDescription(toolName, args)
          .then(async (smartText) => {
            if (
              smartText &&
              active &&
              placeholderMessageId === msgId &&
              smartText !== currentDisplayText
            ) {
              try {
                await sender.edit(msgId, smartText);
                currentDisplayText = smartText;
                log?.(`Placeholder updated with smart tool description: ${smartText}`);
              } catch (editErr) {
                log?.(`Failed to update placeholder with smart tool description: ${editErr}`);
              }
            }
          })
          .catch((err) => {
            log?.(`Smart tool description generation failed: ${err}`);
          });
      }
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
