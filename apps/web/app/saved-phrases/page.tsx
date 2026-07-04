"use client";

import React, { useState, useCallback } from "react";
import { useBookmark } from "@/lib/bookmark-context";
import { Button } from "@/components/ui/button";
import { Trash2, Copy, Volume2, VolumeX, Bookmark } from "lucide-react";

export default function SavedPhrasesPage() {
  const { savedPhrases, removeBookmark } = useBookmark();
  const [isPlaying, setIsPlaying] = useState<Record<string, boolean>>({});
  const [playbackSpeed] = useState(1.0); // 固定速度で実装

  // ブックマーク関連のフレーズを取得（過去の修正・翻訳も含む）
  const bookmarkedPhrases = savedPhrases;

  const handleDelete = (id: string) => {
    removeBookmark(id);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleTextToSpeech = useCallback(
    async (phraseId: string, text: string) => {
      try {
        setIsPlaying((prev) => ({ ...prev, [phraseId]: true }));

        const { ttsPlayer } = await import("@/lib/audio-player");

        await ttsPlayer.speak(text, playbackSpeed, {
          onStart: () => {
            setIsPlaying((prev) => ({ ...prev, [phraseId]: true }));
          },
          onEnd: () => {
            setIsPlaying((prev) => ({ ...prev, [phraseId]: false }));
          },
          onError: (error) => {
            console.error("TTS error:", error);
            setIsPlaying((prev) => ({ ...prev, [phraseId]: false }));
          },
        });
      } catch (error) {
        console.error("TTS error:", error);
        setIsPlaying((prev) => ({ ...prev, [phraseId]: false }));
      }
    },
    [playbackSpeed]
  );

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white">
      {/* Phrases List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {bookmarkedPhrases.length === 0 ? (
          <div className="text-center py-8 sm:py-12 px-4">
            <div className="text-gray-400 mb-4">
              <Bookmark className="h-10 w-10 sm:h-12 sm:w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              ブックマークがありません
            </h3>
            <p className="text-gray-500 text-sm sm:text-base">
              チャットでフレーズをブックマークすると、ここに表示されます
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {bookmarkedPhrases.map((phrase) => (
              <div
                key={phrase.id}
                className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5 transition-all duration-200 hover:shadow-md hover:border-blue-300"
              >
                <div className="space-y-3">
                  {/* Category and Timestamp */}
                  <div className="flex items-center gap-2">
                    <Bookmark className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <span className="text-xs text-gray-500">
                      {phrase.timestamp}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="space-y-3">
                    {/* 日本語を最初に表示 */}
                    {phrase.originalContent && (
                      <div className="text-gray-900 leading-relaxed font-medium text-base sm:text-lg">
                        {phrase.originalContent}
                      </div>
                    )}

                    {/* 英語を次に表示 */}
                    <div className="text-gray-700 leading-relaxed text-sm sm:text-base">
                      {phrase.content}
                    </div>
                  </div>

                  {/* Action Buttons - Mobile optimized */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 hover:bg-gray-100 touch-manipulation"
                      onClick={() => handleCopy(phrase.content)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 hover:bg-gray-100 touch-manipulation"
                      onClick={() =>
                        handleTextToSpeech(phrase.id, phrase.content)
                      }
                      disabled={isPlaying[phrase.id]}
                    >
                      {isPlaying[phrase.id] ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 hover:bg-red-100 text-red-600 touch-manipulation"
                      onClick={() => handleDelete(phrase.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
