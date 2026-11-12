import { createGroq } from "@ai-sdk/groq";
import type { LanguageModelV1 } from "ai";

/**
 * The one place that picks the LLMs. Groq (free plan) today; everything else
 * goes through the AI SDK, so swapping providers is a change here plus env vars.
 *
 * Two models, because Groq's free-plan limits are per model:
 *   vision -> reads bills (text or photo)
 *   agent  -> runs the PayPal agent (tool calling)
 * Model ids live in env because providers retire them.
 */
export type ModelRole = "vision" | "agent";

const MODEL_ENV: Record<ModelRole, string> = {
  vision: "GROQ_VISION_MODEL",
  agent: "GROQ_AGENT_MODEL",
};

export function getModel(role: ModelRole): LanguageModelV1 {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const modelId = process.env[MODEL_ENV[role]]?.trim();
  if (!apiKey || !modelId) {
    throw new Error(
      `GROQ_API_KEY and ${MODEL_ENV[role]} must be set in .env.local (see .env.example)`,
    );
  }
  return createGroq({ apiKey })(modelId);
}

/** Qwen on Groq "thinks" before answering; hide that so structured output stays clean JSON. */
export const VISION_PROVIDER_OPTIONS: Record<string, Record<string, string>> = {
  groq: { reasoningFormat: "hidden" },
};
