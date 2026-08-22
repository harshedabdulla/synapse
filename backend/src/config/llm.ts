import { ENV } from "./env";

export type LLMProviderType = "gemini" | "openai" | "anthropic" | "ollama" | "local";

export interface LLMCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  responseFormatJson?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCompletionResult {
  text: string;
  tokensUsed: number;
  provider: LLMProviderType;
  model: string;
}

class LLMService {
  private activeProvider: LLMProviderType = "local";

  constructor() {
    this.detectProvider();
  }

  private detectProvider() {
    if (ENV.LLM_PROVIDER && ENV.LLM_PROVIDER !== "auto") {
      this.activeProvider = ENV.LLM_PROVIDER as LLMProviderType;
    } else if (ENV.GEMINI_API_KEY) {
      this.activeProvider = "gemini";
    } else if (ENV.OPENAI_API_KEY) {
      this.activeProvider = "openai";
    } else if (ENV.ANTHROPIC_API_KEY) {
      this.activeProvider = "anthropic";
    } else {
      this.activeProvider = "local";
    }

    console.log(`🤖 Active LLM Provider: [${this.activeProvider.toUpperCase()}]`);
  }

  public getProvider(): LLMProviderType {
    return this.activeProvider;
  }

  /**
   * Universal provider-agnostic Chat Completion
   */
  public async generateCompletion(opts: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const { systemPrompt, userPrompt, responseFormatJson = true, temperature = 0.7, maxTokens = 300 } = opts;

    // 1. Google Gemini Provider
    if (this.activeProvider === "gemini" && ENV.GEMINI_API_KEY) {
      return await this.callGemini(systemPrompt, userPrompt, responseFormatJson, temperature, maxTokens);
    }

    // 2. OpenAI Provider
    if (this.activeProvider === "openai" && ENV.OPENAI_API_KEY) {
      return await this.callOpenAI(systemPrompt, userPrompt, responseFormatJson, temperature, maxTokens);
    }

    // 3. Anthropic Claude Provider
    if (this.activeProvider === "anthropic" && ENV.ANTHROPIC_API_KEY) {
      return await this.callAnthropic(systemPrompt, userPrompt, responseFormatJson, temperature, maxTokens);
    }

    // 4. Ollama / Local API
    if (this.activeProvider === "ollama") {
      return await this.callOllama(systemPrompt, userPrompt, responseFormatJson, temperature, maxTokens);
    }

    throw new Error("No external LLM provider configured, using local reasoning engine.");
  }

  /**
   * Google Gemini API implementation via native fetch
   */
  private async callGemini(
    systemPrompt: string,
    userPrompt: string,
    responseFormatJson: boolean,
    temperature: number,
    maxTokens: number
  ): Promise<LLMCompletionResult> {
    const model = ENV.LLM_MODEL || "gemini-flash-latest";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ENV.GEMINI_API_KEY}`;

    const body = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: responseFormatJson ? "application/json" : "text/plain",
        // Gemini 2.5+/3.x are "thinking" models that otherwise spend the whole
        // output budget on hidden reasoning and return empty content — which
        // silently fell back to the template engine. Disable thinking so the
        // tokens produce the actual answer.
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    // Retry on transient rate-limit / overload (429/503) with exponential
    // backoff before giving up to the local fallback. A cascade fires a burst
    // of reasoning calls; free-tier RPM limits are the common failure.
    let res: Response | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) break;
      if (res.status !== 429 && res.status !== 503) {
        throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);
      }
      lastErr = `${res.status}`;
      // 1.2s, 2.4s, then give up. Jittered so parallel workers don't sync up.
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1) + Math.random() * 400));
    }
    if (!res || !res.ok) {
      throw new Error(`Gemini API error (${lastErr || "no response"}) after retries`);
    }

    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const tokensUsed = data.usageMetadata?.totalTokenCount || 150;

    return {
      text,
      tokensUsed,
      provider: "gemini",
      model,
    };
  }

  /**
   * OpenAI API implementation via native fetch
   */
  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    responseFormatJson: boolean,
    temperature: number,
    maxTokens: number
  ): Promise<LLMCompletionResult> {
    const model = ENV.LLM_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: responseFormatJson ? { type: "json_object" } : undefined,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const tokensUsed = data.usage?.total_tokens || 140;

    return {
      text,
      tokensUsed,
      provider: "openai",
      model,
    };
  }

  /**
   * Anthropic Claude Messages API implementation
   */
  private async callAnthropic(
    systemPrompt: string,
    userPrompt: string,
    _responseFormatJson: boolean,
    temperature: number,
    maxTokens: number
  ): Promise<LLMCompletionResult> {
    const model = ENV.LLM_MODEL || "claude-3-haiku-20240307";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ENV.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const text = data.content?.[0]?.text || "{}";
    const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    return {
      text,
      tokensUsed,
      provider: "anthropic",
      model,
    };
  }

  /**
   * Ollama / Local API implementation
   */
  private async callOllama(
    systemPrompt: string,
    userPrompt: string,
    responseFormatJson: boolean,
    temperature: number,
    _maxTokens: number
  ): Promise<LLMCompletionResult> {
    const model = ENV.LLM_MODEL || "llama3";
    const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        format: responseFormatJson ? "json" : undefined,
        stream: false,
        options: { temperature },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama API error (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const text = data.message?.content || "{}";

    return {
      text,
      tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      provider: "ollama",
      model,
    };
  }

  /**
   * Universal provider-agnostic Embedding generator
   */
  public async generateEmbedding(text: string): Promise<number[] | null> {
    // 1. Gemini Embedding
    if (this.activeProvider === "gemini" && ENV.GEMINI_API_KEY) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${ENV.GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: text.slice(0, 2048) }] },
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          return data.embedding?.values || null;
        }
      } catch (e) {
        // fallback
      }
    }

    // 2. OpenAI Embedding
    if (this.activeProvider === "openai" && ENV.OPENAI_API_KEY) {
      try {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text.slice(0, 8000),
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          return data.data?.[0]?.embedding || null;
        }
      } catch (e) {
        // fallback
      }
    }

    return null;
  }
}

export const llmService = new LLMService();
