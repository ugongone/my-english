import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    console.log(`Translating English text to Japanese: "${text}"`);

    const response = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional translator. Translate the given English text to natural Japanese. Only return the translated text without any additional explanation.",
        },
        {
          role: "user",
          content: text,
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