"use client";

import React, { useState, useCallback } from "react";
import { useBookmark } from "@/lib/bookmark-context";
import { ttsPlayer } from "@/lib/audio-player";
import { Button } from "@/components/ui/button";
import { Trash2, Copy, Volume2, VolumeX, Bookmark, Plus, X } from "lucide-react";

export default function SavedPhrasesPage() {
  const { savedPhrases, addBookmark, removeBookmark } = useBookmark();
  const [isPlaying, setIsPlaying] = useState<Record<string, boolean>>({});
  const [playbackSpeed] = useState(1.0); // 固定速度で実装
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPhraseEnglish, setNewPhraseEnglish] = useState("");
  const [newPhraseJapanese, setNewPhraseJapanese] = useState("");

  // ブックマーク関連のフレーズを取得（過去の修正・翻訳も含む）
  const bookmarkedPhrases = savedPhrases;

  const handleDelete = (id: string) => {
    removeBookmark(id);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleCloseAddForm = () => {
    setShowAddForm(false);
    setNewPhraseEnglish("");
    setNewPhraseJapanese("");
  };

  const handleAddPhrase = () => {
    const englishContent = newPhraseEnglish.trim();
    if (!englishContent) return;

    addBookmark({
      id: `manual-${Date.now()}`,
      content: englishContent,
      category: "bookmark",
      timestamp: new Date().toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      originalContent: newPhraseJapanese.trim() || undefined,
    });

    handleCloseAddForm();
  };

  const handleTextToSpeech = useCallback(
    async (phraseId: string, text: string) => {
      // iOSはfetch等の非同期処理を挟むと再生がブロックされることがあるため、
      // タップ直後（awaitの前）に同期的に再生許可を確保しておく
      ttsPlayer.primeMobilePlayback();

      try {
        setIsPlaying((prev) => ({ ...prev, [phraseId]: true }));

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
                  {/* Category, Timestamp and Action Buttons */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bookmark className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <span className="text-xs text-gray-500">
                        {phrase.timestamp}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新規フレーズ追加ボタン */}
      <div className="fixed bottom-6 right-6 z-20">
        <div className="relative">
          {showAddForm && (
            <div className="absolute bottom-16 right-0 mb-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg w-80">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    フレーズを追加
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={handleCloseAddForm}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">
                    日本語（任意）
                  </label>
                  <input
                    type="text"
                    value={newPhraseJapanese}
                    onChange={(e) => setNewPhraseJapanese(e.target.value)}
                    placeholder="でも、かろうじてポテチ買ってある。"
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">英語フレーズ</label>
                  <textarea
                    value={newPhraseEnglish}
                    onChange={(e) => setNewPhraseEnglish(e.target.value)}
                    placeholder="But I barely managed to buy some potato chips."
                    className="w-full p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    rows={2}
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCloseAddForm}
                  >
                    キャンセル
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddPhrase}
                    disabled={!newPhraseEnglish.trim()}
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    保存
                  </Button>
                </div>
              </div>
              {/* Arrow pointing down */}
              <div className="absolute -bottom-2 right-4 w-4 h-4 bg-white border-r border-b border-gray-200 transform rotate-45"></div>
            </div>
          )}

          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            size="lg"
            className="h-14 w-14 rounded-full p-0 shadow-lg bg-blue-500 hover:bg-blue-600"
          >
            <Plus className="h-6 w-6 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
}
