import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface HackerNewsItem {
  id: number;
  title: string;
  url?: string;
  text?: string;
  score: number;
  time: number;
  by: string;
  type: string;
}

export async function GET(request: Request) {
  try {
    // URLからインデックスパラメータを取得
    const { searchParams } = new URL(request.url);
    const indexParam = searchParams.get('index');
    const index = indexParam ? parseInt(indexParam, 10) : 0;

    // インデックスが負の場合は0にリセット
    const storyIndex = Math.max(0, index);

    // Hacker News Top Stories を取得
    const topStoriesResponse = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json"
    );
    
    if (!topStoriesResponse.ok) {
      throw new Error("Failed to fetch top stories");
    }

    const topStoryIds: number[] = await topStoriesResponse.json();
    
    if (!topStoryIds || topStoryIds.length === 0) {
      throw new Error("No stories found");
    }

    // インデックスが範囲外の場合は最初に戻る
    const actualIndex = storyIndex >= topStoryIds.length ? 0 : storyIndex;
    
    // 指定されたインデックスのストーリーの詳細を取得
    const topStoryId = topStoryIds[actualIndex];
    const storyResponse = await fetch(
      `https://hacker-news.firebaseio.com/v0/item/${topStoryId}.json`
    );

    if (!storyResponse.ok) {
      throw new Error("Failed to fetch story details");
    }

    const story: HackerNewsItem = await storyResponse.json();

    if (!story || story.type !== "story") {
      throw new Error("Invalid story data");
    }

    // GPT-5-nano で要約とタイトル生成
    const summaryPrompt = `Hey! I found this interesting tech story. Here's what I came across:

Title: ${story.title}
${story.text ? `Content: ${story.text.substring(0, 500)}` : ""}

Please give me:
1. A catchy, specific title that captures the main point (like "Google Launches New AI Tool" instead of "Latest Tech News")
2. A friendly 2-3 sentence summary that explains what happened and why it's cool for developers

Make it sound like you're telling a friend about something interesting you just discovered!`;

    const completion = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content: "You're a tech-savvy friend who loves sharing cool discoveries! Write in a casual, friendly tone. Start with 'TITLE:' followed by a specific headline, then 'SUMMARY:' with your explanation.",
        },
        {
          role: "user",
          content: summaryPrompt,
        },
      ],
      max_completion_tokens: 500,
      reasoning_effort: "minimal",
    });

    const summary = completion.choices[0]?.message?.content;

    if (!summary) {
      throw new Error("No summary generated");
    }

    // タイトルとサマリーを分離
    const titleMatch = summary.match(/TITLE:\s*(.+?)(?:\n|SUMMARY:)/i);
    const summaryMatch = summary.match(/SUMMARY:\s*(.+)/is);
    
    const title = titleMatch?.[1]?.trim() || "📰 Latest Tech News";
    const content = summaryMatch?.[1]?.trim() || summary;

    // 既存チャット形式でレスポンス（現在のインデックス情報も含める）
    return NextResponse.json({
      id: Date.now().toString(),
      role: "assistant",
      content: `${title}\n\n${content}`,
      type: "news",
      currentIndex: actualIndex,
      totalStories: topStoryIds.length,
      timestamp: new Date().toLocaleTimeString('ja-JP', {
        hour: "2-digit",
        minute: "2-digit", 
        hour12: false,
        timeZone: 'Asia/Tokyo'
      }),
    });

  } catch (error) {
    console.error("News API error:", error);

    return NextResponse.json({
      id: Date.now().toString(),
      role: "assistant", 
      content: "申し訳ございません。最新ニュースの取得中にエラーが発生しました。しばらく時間をおいてから再度お試しください。",
      type: "chat",
      timestamp: new Date().toLocaleTimeString('ja-JP', {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: 'Asia/Tokyo'
      }),
    });
  }
}