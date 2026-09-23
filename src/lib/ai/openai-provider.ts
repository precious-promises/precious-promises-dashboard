import { AI_SYSTEM_PROMPT, buildPrompt } from "./prompts";
import {
  jsonSchemaFor,
  validateAiOutput,
  type AiDraftRequest,
  type AiDraftResult,
  type AIProvider,
} from "./types";

interface OpenAIResponse {
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
}

function outputText(body: OpenAIResponse): string | null {
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateDraft(request: AiDraftRequest): Promise<AiDraftResult> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          input: [
            { role: "system", content: AI_SYSTEM_PROMPT },
            { role: "user", content: buildPrompt(request) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: `precious_promises_${request.type}`,
              strict: true,
              schema: jsonSchemaFor(request.type),
            },
          },
        }),
      });
    } catch {
      return {
        ok: false,
        category: "transient",
        detail: "The request to the AI provider could not be completed.",
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        category: "rate_limited",
        detail: "The AI provider rate limited the request.",
      };
    }
    if (response.status >= 500) {
      return {
        ok: false,
        category: "provider_unavailable",
        detail: "The AI provider is unavailable.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        category: "unknown",
        detail: "The AI provider refused the request.",
      };
    }

    const body = (await response
      .json()
      .catch(() => null)) as OpenAIResponse | null;
    if (!body) {
      return {
        ok: false,
        category: "invalid_output",
        detail: "The AI provider returned no draft data.",
      };
    }

    const text = outputText(body);
    if (!text) {
      return {
        ok: false,
        category: "invalid_output",
        detail: "The AI provider returned no draft text.",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        category: "invalid_output",
        detail: "The AI provider's response was not the required JSON shape.",
      };
    }

    const validated = validateAiOutput(request.type, parsed);
    if (validated === null) {
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
