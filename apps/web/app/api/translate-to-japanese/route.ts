import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 会話履歴を「翻訳対象の主語・代名詞を解決するための参考情報」としてプロンプトに埋め込む
// （履歴自体を翻訳・応答させないよう、明示的に区別する）
function buildContextBlock(context: unknown): string {
  if (!Array.isArray(context) || context.length === 0) return "";

  const lines = context
    .filter(
      (m): m is { role: string; content: string } =>
        !!m && typeof m.content === "string" && m.content.trim().length > 0
    )
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`);

  if (lines.length === 0) return "";

  return `Conversation context (for reference only; do not translate or respond to this part):\n${lines.join("\n")}`;
}

export async function POST(request: NextRequest) {
  try {
    const { text, context } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    console.log(`Translating English text to Japanese: "${text}"`);

    const contextBlock = buildContextBlock(context);

    const response = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional translator. Translate the given English text to natural Japanese. You may also receive recent conversation context; use it only to resolve ambiguous or omitted subjects and pronouns in the text to translate. Do not translate or respond to the context itself. Only return the translated text without any additional explanation.",
        },
        {
          role: "user",
          content: contextBlock ? `${contextBlock}\n\nText to translate:\n${text}` : text,
        },
      ],
      max_completion_tokens: 512,
      reasoning_effort: "minimal",
    });

    const translatedText = response.choices[0]?.message?.content?.trim();

    if (!translatedText) {
      throw new Error("No translation received from OpenAI");
    }

    console.log(
      `Translation completed. Original: "${text}" -> Translated: "${translatedText}"`
    );

    return NextResponse.json({
      originalText: text,
      translatedText: translatedText,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("English to Japanese translation error:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: "English to Japanese translation failed",
          details: error.message,
          type: "translation_api_error",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Unknown translation error",
        type: "unknown_error",
      },
      { status: 500 }
    );
  }
}