import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid messages format" },
        { status: 400 }
      );
    }

    const completion = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a conversational partner. Focus on continuing natural conversations without correcting English or providing language feedback. Please answer in ≤3 short sentences (≈45 words)",
        },
        ...messages,
      ],
      max_completion_tokens: 1000,
      reasoning_effort: "minimal",
    });

    const assistantMessage = completion.choices[0]?.message;

    if (!assistantMessage) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: Date.now().toString(),
      role: assistantMessage.role,
      content: assistantMessage.content,
      timestamp: new Date().toLocaleTimeString('ja-JP', {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: 'Asia/Tokyo'
      }),
    });
  } catch (error) {
    console.error("OpenAI API error:", error);

    return NextResponse.json(
      {
        error: "AI response generation failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
