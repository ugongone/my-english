"use client";

import React, { createContext, useContext, useEffect, useReducer, useState } from "react";

// チャット画面で使用するメッセージ型（page.tsxと共通で使用する）
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  correctedContent?: string;
  translatedContent?: string;
  timestamp: string;
  type?: "news" | "chat";
  currentIndex?: number;
  totalStories?: number;
  originalContent?: string;
}

// 会話1件分のデータ
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

type ConversationAction =
  | { type: "LOAD_CONVERSATIONS"; payload: Conversation[] }
  | { type: "UPSERT_CONVERSATION"; payload: Conversation }
  | { type: "DELETE_CONVERSATION"; payload: string };

interface ConversationState {
  conversations: Conversation[];
  // LocalStorageからの初期読み込みが完了したかどうか
  // （SSRとの水和ミスマッチを避けるため、初期状態は必ず空配列にしている）
  isLoaded: boolean;
}

interface ConversationContextType extends ConversationState {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  createConversation: (messages: Message[]) => Conversation;
  saveMessages: (id: string, messages: Message[]) => void;
  deleteConversation: (id: string) => void;
  getConversation: (id: string) => Conversation | undefined;
}

function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case "LOAD_CONVERSATIONS":
      return { conversations: action.payload, isLoaded: true };
    case "UPSERT_CONVERSATION": {
      const exists = state.conversations.some(
        (conversation) => conversation.id === action.payload.id
      );
      return {
        ...state,
        conversations: exists
          ? state.conversations.map((conversation) =>
              conversation.id === action.payload.id
                ? action.payload
                : conversation
            )
          : [action.payload, ...state.conversations],
      };
    }
    case "DELETE_CONVERSATION":
      return {
        ...state,
        conversations: state.conversations.filter(
          (conversation) => conversation.id !== action.payload
        ),
      };
    default:
      return state;
  }
}

const STORAGE_KEY = "lingua-chat-conversations";
const ACTIVE_ID_STORAGE_KEY = "lingua-chat-active-conversation-id";
const DEFAULT_TITLE = "新しい会話";

const loadFromLocalStorage = (): Conversation[] => {
  if (typeof window === "undefined") return [];

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error("LocalStorageからの会話履歴読み込みエラー:", error);
    return [];
  }
};

const saveToLocalStorage = (conversations: Conversation[]): void => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (error) {
    console.error("LocalStorageへの会話履歴保存エラー:", error);
  }
};

const loadActiveIdFromLocalStorage = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_ID_STORAGE_KEY);
};

// タイトル未設定の会話用に、最初のユーザー発言からタイトルを生成する
const buildTitleFromMessages = (messages: Message[]): string => {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const source = firstUserMessage?.content.trim() || DEFAULT_TITLE;
  return source.length > 20 ? `${source.slice(0, 20)}…` : source;
};

const ConversationContext = createContext<ConversationContextType | undefined>(
  undefined
);

export function ConversationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // 初期状態はSSRと同じ空配列にしておき、マウント後にLocalStorageから読み込む
  // （水和ミスマッチを避けるため。bookmark-context.tsxと同じ方針）
  const [state, dispatch] = useReducer(conversationReducer, {
    conversations: [],
    isLoaded: false,
  });
  const [activeConversationId, setActiveConversationIdState] = useState<
    string | null
  >(loadActiveIdFromLocalStorage);

  useEffect(() => {
    dispatch({ type: "LOAD_CONVERSATIONS", payload: loadFromLocalStorage() });
  }, []);

  // 読み込み完了後、会話一覧が変わるたびにLocalStorageへ保存する
  useEffect(() => {
    if (!state.isLoaded) return;
    saveToLocalStorage(state.conversations);
  }, [state.isLoaded, state.conversations]);

  const setActiveConversationId = (id: string | null) => {
    setActiveConversationIdState(id);
    if (typeof window === "undefined") return;
    if (id) {
      localStorage.setItem(ACTIVE_ID_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_ID_STORAGE_KEY);
    }
  };

  const contextValue: ConversationContextType = {
    ...state,
    activeConversationId,
    setActiveConversationId,
    createConversation: (messages: Message[]) => {
      const now = new Date().toISOString();
      const conversation: Conversation = {
        id: `conversation-${Date.now()}`,
        title: buildTitleFromMessages(messages),
        messages,
        createdAt: now,
        updatedAt: now,
      };
      dispatch({ type: "UPSERT_CONVERSATION", payload: conversation });
      return conversation;
    },
    saveMessages: (id: string, messages: Message[]) => {
      const existing = state.conversations.find(
        (conversation) => conversation.id === id
      );
      const now = new Date().toISOString();
      const conversation: Conversation = {
        id,
        title:
          existing?.title && existing.title !== DEFAULT_TITLE
            ? existing.title
            : buildTitleFromMessages(messages),
        messages,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      dispatch({ type: "UPSERT_CONVERSATION", payload: conversation });
    },
    deleteConversation: (id: string) => {
      dispatch({ type: "DELETE_CONVERSATION", payload: id });
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
    },
    getConversation: (id: string) =>
      state.conversations.find((conversation) => conversation.id === id),
  };

  return (
    <ConversationContext.Provider value={contextValue}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation() {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error("useConversationはConversationProvider内で使用してください");
  }
  return context;
}
