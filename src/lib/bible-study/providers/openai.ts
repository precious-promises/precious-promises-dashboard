import { BIBLE_STUDY_SYSTEM_PROMPT, buildBibleStudyPrompt } from "../spec";
import {
  bibleStudyJsonSchema,
  canonicalBibleStudySchema,
  type BibleStudyGenerationResult,
  type BibleStudyProvider,
  type BibleStudyRequest,
} from "../types";

interface OpenAIResponse {
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string };
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

export class OpenAIBibleStudyProvider implements BibleStudyProvider {
  readonly id = "openai" as const;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(
    request: BibleStudyRequest,
  ): Promise<BibleStudyGenerationResult> {
    const started = Date.now();

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
            { role: "system", content: BIBLE_STUDY_SYSTEM_PROMPT },
            { role: "user", content: buildBibleStudyPrompt(request) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "precious_promises_bible_study",
              strict: true,
              schema: bibleStudyJsonSchema(),
            },
          },
        }),
      });
    } catch {
      return {
        ok: false,
        category: "transient",
        detail: "The OpenAI Bible Study request could not be completed.",
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        category: "rate_limited",
        detail: "OpenAI rate limited the Bible Study request.",
      };
    }
    if (response.status >= 500) {
      return {
        ok: false,
        category: "provider_unavailable",
        detail: "OpenAI is currently unavailable.",
      };
    }

    const body = (await response
      .json()
      .catch(() => null)) as OpenAIResponse | null;
    if (!response.ok || !body) {
      return {
        ok: false,
        category: "unknown",
        detail: "OpenAI refused the Bible Study request.",
      };
    }

    const text = outputText(body);
    if (!text) {
      return {
        ok: false,
        category: "invalid_output",
        detail: "OpenAI returned no Bible Study JSON.",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        category: "invalid_output",
        detail: "OpenAI returned malformed Bible Study JSON.",
      };
    }

    const validated = canonicalBibleStudySchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        category: "invalid_output",
        detail:
          "OpenAI output did not satisfy the Precious Promises Bible Study schema.",
      };
    }

    return {
      ok: true,
      study: validated.data,
      provider: this.id,
      model: this.model,
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
