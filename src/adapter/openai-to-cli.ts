/**
 * Converts OpenAI chat request format to Claude CLI input
 */

import type { OpenAIChatRequest } from "../types/openai.js";

export type ClaudeModel = "opus" | "sonnet" | "haiku";

export interface CliInput {
  prompt: string;
  systemPrompt: string | null;
  model: ClaudeModel;
  sessionId?: string;
}

const MODEL_MAP: Record<string, ClaudeModel> = {
  // Direct model names
  "claude-opus-4": "opus",
  "claude-sonnet-4": "sonnet",
  "claude-haiku-4": "haiku",
  // With provider prefix
  "claude-code-cli/claude-opus-4": "opus",
  "claude-code-cli/claude-sonnet-4": "sonnet",
  "claude-code-cli/claude-haiku-4": "haiku",
  // Aliases
  "opus": "opus",
  "sonnet": "sonnet",
  "haiku": "haiku",
};

/**
 * Extract Claude model alias from request model string
 */
export function extractModel(model: string): ClaudeModel {
  // Try direct lookup
  if (MODEL_MAP[model]) {
    return MODEL_MAP[model];
  }

  // Try stripping provider prefix
  const stripped = model.replace(/^claude-code-cli\//, "");
  if (MODEL_MAP[stripped]) {
    return MODEL_MAP[stripped];
  }

  // Default to opus (Claude Max subscription)
  return "opus";
}

/**
 * Extract text from message content, handling both string and array formats.
 * OpenAI API allows content to be a string or an array of content blocks
 * like [{"type":"text","text":"..."}].
 */
function extractText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === "text" && block.text)
      .map(block => block.text)
      .join("\n");
  }
  return String(content);
}

/**
 * Convert OpenAI messages array to a prompt string and separate system prompt
 *
 * Claude Code CLI in --print mode expects a single prompt, not a conversation.
 * System messages are extracted and passed via --system-prompt flag instead of
 * being embedded in the user message, which prevents conflicts with Claude
 * Code's own system prompt.
 */
export function messagesToPrompt(messages: OpenAIChatRequest["messages"]): { prompt: string; systemPrompt: string | null } {
  const systemParts: string[] = [];
  const promptParts: string[] = [];

  for (const msg of messages) {
    const text = extractText(msg.content);
    switch (msg.role) {
      case "system":
        // Collect system messages separately
        systemParts.push(text);
        break;

      case "user":
        // User messages are the main prompt
        promptParts.push(text);
        break;

      case "assistant":
        // Previous assistant responses for context
        promptParts.push(`<previous_response>\n${text}\n</previous_response>\n`);
        break;
    }
  }

  return {
    prompt: promptParts.join("\n").trim(),
    systemPrompt: systemParts.length > 0 ? systemParts.join("\n\n") : null,
  };
}

/**
 * Convert OpenAI chat request to CLI input format
 */
export function openaiToCli(request: OpenAIChatRequest): CliInput {
  const { prompt, systemPrompt } = messagesToPrompt(request.messages);
  return {
    prompt,
    systemPrompt,
    model: extractModel(request.model),
    sessionId: request.user, // Use OpenAI's user field for session mapping
  };
}
