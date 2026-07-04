"use client";

import { useRouter } from "next/navigation";
import { useConversation } from "@/lib/conversation-context";
import { Button } from "@/components/ui/button";
import { MessageCircle, Trash2 } from "lucide-react";

export default function HistoryPage() {
  const { conversations, deleteConversation } = useConversation();
  const router = useRouter();

  // 直近に更新された会話が上に来るように並び替える
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const formatTimestamp = (isoString: string) =>
    new Date(isoString).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const handleOpen = (id: string) => {
    router.push(`/?conversation=${id}`);
  };

  const handleDelete = (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    deleteConversation(id);
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {sortedConversations.length === 0 ? (
          <div className="text-center py-8 sm:py-12 px-4">
            <div className="text-gray-400 mb-4">
              <MessageCircle className="h-10 w-10 sm:h-12 sm:w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              チャット履歴がありません
            </h3>
            <p className="text-gray-500 text-sm sm:text-base">
              チャットを開始すると、ここに履歴が表示されます
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedConversations.map((conversation) => {
              const lastMessage =
                conversation.messages[conversation.messages.length - 1];
              return (
                <div
                  key={conversation.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5 transition-all duration-200 hover:shadow-md hover:border-blue-300 cursor-pointer"
                  onClick={() => handleOpen(conversation.id)}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {conversation.title}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 flex-shrink-0 hover:bg-red-100 text-red-600 touch-manipulation"
                        onClick={(event) => handleDelete(event, conversation.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {lastMessage && (
                      <p className="text-sm text-gray-600 truncate">
                        {lastMessage.content}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatTimestamp(conversation.updatedAt)}</span>
                      <span>{conversation.messages.length}件のメッセージ</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
