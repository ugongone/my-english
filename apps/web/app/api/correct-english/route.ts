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

    console.log(`Correcting English text: "${text}"`);

    const response = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You will be provided with statements, and your task is to convert them to standard English. Only return the corrected text without any additional explanation.",
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_completion_tokens: 256,
      reasoning_effort: "minimal",
    });

    const correctedText = response.choices[0]?.message?.content?.trim();

    if (!correctedText) {
      throw new Error("No correction received from OpenAI");
    }

    console.log(
      `Correction completed. Original: "${text}" -> Corrected: "${correctedText}"`
    );

    return NextResponse.json({
      originalText: text,
      correctedText: correctedText,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("English correction error:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: "English correction failed",
          details: error.message,
          type: "correction_api_error",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Unknown correction error",
        type: "unknown_error",
      },
      { status: 500 }
    );
  }
}
