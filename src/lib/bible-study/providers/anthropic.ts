import Anthropic from "@anthropic-ai/sdk";

import {
  BIBLE_STUDY_SYSTEM_PROMPT,
  buildBibleStudyPrompt,
} from "../spec";
import {
  bibleStudyJsonSchema,
  canonicalBibleStudySchema,
  type BibleStudyGenerationResult,
  type BibleStudyProvider,
  type BibleStudyRequest,
} from "../types";

export class AnthropicBibleStudyProvider implements BibleStudyProvider {
  readonly id = "anthropic" as const;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async generate(
    request: BibleStudyRequest,
  ): Promise<BibleStudyGenerationResult> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const started = Date.now();

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: this.model,
        max_tokens: request.depth === "deep" ? 16000 : 10000,
        system: BIBLE_STUDY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildBibleStudyPrompt(request) }],
        output_config: {
          format: {
            type: "json_schema",
            schema: bibleStudyJsonSchema(),
          },
        },
      } as Anthropic.MessageCreateParamsNonStreaming);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return {
          ok: false,
          category: "rate_limited",
          detail: "Anthropic rate limited the Bible Study request.",
        };
      }
      if (
        error instanceof Anthropic.InternalServerError ||
        error instanceof Anthropic.APIConnectionError
      ) {
        return {
          ok: false,
          category: "provider_unavailable",
          detail: "Anthropic is currently unavailable.",
        };
      }
      if (error instanceof Anthropic.APIError) {
        return {
          ok: false,
          category: "unknown",
          detail: "Anthropic refused the Bible Study request.",
        };
      }
      return {
        ok: false,
        category: "transient",
        detail: "The Anthropic Bible Study request could not be completed.",
      };
    }

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        category: "refused",
        detail: "Anthropic declined to generate this Bible Study.",
      };
    }

    const block = response.content.find(
      (item): item is Anthropic.TextBlock => item.type === "text",
    );
    if (!block) {
      return {
        ok: false,
        category: "invalid_output",
        detail: "Anthropic returned no Bible Study JSON.",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(block.text);
    } catch {
      return {
        ok: false,
        category: "invalid_output",
        detail: "Anthropic returned malformed Bible Study JSON.",
      };
    }

    const validated = canonicalBibleStudySchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        category: "invalid_output",
        detail:
          "Anthropic output did not satisfy the Precious Promises Bible Study schema.",
      };
    }

    return {
      ok: true,
      study: validated.data,
      provider: this.id,
      model: this.model,
      inputTokens: response.usage.input_tokens ?? null,
      outputTokens: response.usage.output_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
