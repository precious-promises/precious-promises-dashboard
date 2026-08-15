import Anthropic from "@anthropic-ai/sdk";

import { AI_SYSTEM_PROMPT, buildPrompt } from "./prompts";
import {
  jsonSchemaFor,
  validateAiOutput,
  type AiDraftRequest,
  type AiDraftResult,
  type AIProvider,
} from "./types";

/**
 * The Anthropic implementation, and the only file where vendor code lives.
 *
 * Uses the official SDK — never raw HTTP — with the response constrained to
 * the generation type's closed JSON schema via structured outputs
 * (`output_config.format`). The schema has no Scripture field, so the model
 * cannot return one in a slot anything downstream would trust; and the
 * output is validated **again** locally before it is stored, because a
 * safety property should not rest on a single enforcement point.
 *
 * The call is a single request: no tools, no agent loop, no side effects.
 */
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async generateDraft(request: AiDraftRequest): Promise<AiDraftResult> {
    const client = new Anthropic({ apiKey: this.apiKey });

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(request) }],
        output_config: {
          format: {
            type: "json_schema",
            schema: jsonSchemaFor(request.type),
          },
        },
      } as Anthropic.MessageCreateParamsNonStreaming);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return {
          ok: false,
          category: "rate_limited",
          detail: "The AI provider rate limited the request.",
        };
      }
      if (
        error instanceof Anthropic.InternalServerError ||
        error instanceof Anthropic.APIConnectionError
      ) {
        return {
          ok: false,
          category: "provider_unavailable",
          detail: "The AI provider is unavailable.",
        };
      }
      if (error instanceof Anthropic.APIError) {
        return {
          ok: false,
          category: "unknown",
          detail: "The AI provider refused the request.",
        };
      }
      return {
        ok: false,
        category: "transient",
        detail: "The request to the AI provider could not be completed.",
      };
    }

    // Safety classifiers can decline with a normal 200 — that is a refusal,
    // not an output, and it is recorded as one.
    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        category: "refused",
        detail: "The AI provider declined to draft this request.",
      };
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) {
      return {
        ok: false,
        category: "invalid_output",
        detail: "The AI provider returned no draft text.",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return {
        ok: false,
        category: "invalid_output",
        detail: "The AI provider's response was not the required JSON shape.",
      };
    }

    const validated = validateAiOutput(request.type, parsed);
    if (validated === null) {
      // Includes the case the whole design exists for: a response carrying a
      // field outside the closed schema — such as Scripture.
      return {
        ok: false,
        category: "invalid_output",
        detail:
          "The AI provider's response did not match the closed output schema for this generation type, so it was discarded.",
      };
    }

    return {
      ok: true,
      output: validated,
      provider: this.id,
      model: this.model,
    };
  }
}
