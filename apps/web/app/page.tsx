"use client";

import type React from "react";

import { useState, useRef, useCallback, useEffect } from "react";
import { useBookmark, createSavedPhraseFromMessage } from "@/lib/bookmark-context";
import { useConversation, type Message } from "@/lib/conversation-context";
import { ttsPlayer } from "@/lib/audio-player";
import { Button } from "@/components/ui/button";
import { CorrectionDisplay } from "@/components/ui/correction-display";
import { PWAInstall } from "@/components/pwa-install";
import {
  Copy,
  Volume2,
  Mic,
  MicOff,
  VolumeX,
  Eye,
  EyeOff,
  Keyboard,
  Send,
  X,
  Bookmark,
  Languages,
  MessageCircle,
  MessageSquarePlus,
  Briefcase,
  Newspaper,
} from "lucide-react";

const createInitialMessages = (): Message[] => [
  {
    id: "initial",
    role: "assistant",
    content: "Hey! What should we do?",
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  },
];

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>(createInitialMessages);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const hasInitializedConversationRef = useRef(false);
  const {
    isLoaded: isConversationsLoaded,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    saveMessages,
    getConversation,
  } = useConversation();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAIResponding, setIsAIResponding] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string>("");
  const [autoPlayAudio, setAutoPlayAudio] = useState(false);
  const autoPlayedMessagesRef = useRef<Set<string>>(new Set());
  const autoPlayStartTimeRef = useRef<number | null>(null);
  const autoPlayedTranslationsRef = useRef<Set<string>>(new Set());
  const waitingForAIResponseRef = useRef<boolean>(false);
  const messagesRef = useRef<Message[]>(messages);
  // フッターの実際の高さを計測し、メッセージ一覧の下余白に反映する
  // （固定値だと端末のセーフエリアやフォント設定によりボタンがフッターに隠れることがあるため）
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(144);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoBlurText, setAutoBlurText] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [input, setInput] = useState("");
  const [isPlaying, setIsPlaying] = useState<Record<string, boolean>>({});
  const { addBookmark, removeBookmark, isMessageBookmarked } = useBookmark();
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  // テキスト選択・翻訳機能の状態
  const [translationPosition, setTranslationPosition] = useState({
    x: 0,
    y: 0,
  });
  const [showTranslation, setShowTranslation] = useState(false);
  const [translatedText, setTranslatedText] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );
  const [longPressMessageId, setLongPressMessageId] = useState<string | null>(
    null
  );
  // ニュースインデックス管理の状態
  const [currentNewsIndex, setCurrentNewsIndex] = useState(0);
  const [touchStartTime, setTouchStartTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const translationCache = useRef<Map<string, string>>(new Map());
  const speedModalTouchProcessedRef = useRef(false);
  const [translatedMessages, setTranslatedMessages] = useState<Set<string>>(new Set());
  const [messageTranslations, setMessageTranslations] = useState<Map<string, string>>(new Map());
  const [translatingMessages, setTranslatingMessages] = useState<Set<string>>(new Set());
  const [translationErrors, setTranslationErrors] = useState<Map<string, string>>(new Map());

  const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  const initialOptions = [
    {
      id: "news",
      title: "最近のニュースについて教えて",
      icon: Newspaper,
      message: "最近のニュースについて教えてください。",
    },
    {
      id: "interview",
      title: "面接の練習をしてほしい",
      icon: Briefcase,
      message: "面接の練習をお願いします。",
    },
    {
      id: "chat",
      title: "話し相手になって",
      icon: MessageCircle,
      message: "話し相手になってください。",
    },
  ];

  const handleOptionSelect = async (option: (typeof initialOptions)[0]) => {
    if (option.id === "news") {
      // 最新ニュース取得処理（インデックス0をリセット）
      await fetchNewsWithIndex(0);
      setCurrentNewsIndex(0);
    } else {
      // その他の選択肢は従来通り
      console.log("選択肢が押されました:", option.title);
    }
  }

  // ニュース取得の共通処理
  const fetchNewsWithIndex = async (index: number) => {
    try {
      setIsAIResponding(true);

      const response = await fetch(`/api/news?index=${index}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newsMessage = await response.json();

      if (newsMessage.error) {
        throw new Error(newsMessage.error);
      }

      setMessages((prev) => [...prev, newsMessage]);
    } catch (error) {
      console.error("News fetch error:", error);

      const errorMessage = {
        id: Date.now().toString(),
        role: "assistant" as const,
        content: "申し訳ございません。ニュースの取得中にエラーが発生しました。もう一度お試しください。",
        timestamp: new Date().toLocaleTimeString('ja-JP', {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: 'Asia/Tokyo'
        }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsAIResponding(false);
    }
  }

  // 次のニュースを取得する処理
  const handleNextNews = async () => {
    const nextIndex = currentNewsIndex + 1;
    await fetchNewsWithIndex(nextIndex);
    setCurrentNewsIndex(nextIndex);
  }


  const correctEnglish = async (text: string): Promise<string | null> => {
    try {
      const response = await fetch("/api/correct-english", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.error("English correction failed:", response.status);
        return null;
      }

      const result = await response.json();
      return result.correctedText !== text ? result.correctedText : null;
    } catch (error) {
      console.error("English correction error:", error);
      return null;
    }
  };

  // 主語・代名詞の解決に使う直近の会話履歴を組み立てる
  const CONTEXT_MESSAGE_LIMIT = 6;
  const buildTranslationContext = (
    history: Message[]
  ): { role: "user" | "assistant"; content: string }[] => {
    return history.slice(-CONTEXT_MESSAGE_LIMIT).map((m) => ({
      role: m.role,
      content: m.translatedContent || m.content,
    }));
  };

  const translateToEnglish = async (
    text: string,
    context?: { role: "user" | "assistant"; content: string }[]
  ): Promise<string | null> => {
    try {
      const response = await fetch("/api/translate-to-english", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });

      if (!response.ok) {
        console.error(
          "Japanese to English translation failed:",
          response.status
        );
        return null;
      }

      const result = await response.json();
      return result.translatedText || null;
    } catch (error) {
      console.error("Japanese to English translation error:", error);
      return null;
    }
  };

  const isJapanese = (text: string): boolean => {
    return /[ひらがなカタカナ一-龯]/.test(text);
  };

  const isEnglish = (text: string): boolean => {
    return /^[a-zA-Z\s.,!?'"0-9\-()]+$/.test(text);
  };

  const isSupportedLanguage = (detectedLang: string): boolean => {
    return detectedLang === "japanese" || detectedLang === "english";
  };

  // OpenAI API を使った翻訳機能
  const getTranslation = useCallback(async (text: string): Promise<string> => {
    try {
      // キャッシュチェック
      if (translationCache.current.has(text)) {
        return translationCache.current.get(text)!;
      }

      setIsTranslating(true);
      setTranslationError(null);

      const response = await fetch("/api/translate-to-japanese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error("Translation request failed");
      }

      const result = await response.json();
      const translatedText = result.translatedText;

      // キャッシュに保存
      translationCache.current.set(text, translatedText);

      return translatedText;
    } catch (error) {
      console.error("Translation error:", error);
      setTranslationError("翻訳できませんでした");
      return "翻訳エラー";
    } finally {
      setIsTranslating(false);
    }
  }, []);

  const transcribeAudio = async (
    audioBlob: Blob,
    filename: string = "recording.wav"
  ) => {
    try {
      setIsTranscribing(true);

      const formData = new FormData();
      formData.append("audio", audioBlob, filename);

      console.log("Sending audio for transcription, size:", audioBlob.size);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Transcription failed");
      }

      const result = await response.json();

      if (result.text) {
        console.log("Transcription result:", {
          text: result.text,
          language: result.language,
          duration: result.duration,
        });

        // 検出された言語を保存
        setDetectedLanguage(result.language || "");

        // 言語チェック: 日本語・英語以外の場合はエラー表示
        if (result.language && !isSupportedLanguage(result.language)) {
          const errorMessage: Message = {
            id: Date.now().toString(),
            role: "assistant",
            content: `申し訳ございません。現在は日本語と英語のみ対応しています。検出された言語: ${result.language}`,
            timestamp: new Date().toLocaleTimeString('ja-JP', {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: 'Asia/Tokyo'
            }),
          };
          setMessages((prev) => [...prev, errorMessage]);
          return;
        }

        // 修正・翻訳の完了を待たず、認識されたテキストを先に表示する
        const messageId = Date.now().toString();
        const newMessage: Message = {
          id: messageId,
          role: "user",
          content: result.text,
          originalContent: result.text,
          timestamp: new Date().toLocaleTimeString('ja-JP', {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: 'Asia/Tokyo'
          }),
        };

        setMessages((prev) => [...prev, newMessage]);

        // 英語の場合は修正処理、日本語の場合は英訳処理を実行
        let correctedContent: string | undefined;
        let translatedContent: string | undefined;

        if (
          result.language === "english" ||
          isEnglish(result.text)
        ) {
          correctedContent = (await correctEnglish(result.text)) || undefined;
        } else if (isJapanese(result.text)) {
          translatedContent =
            (await translateToEnglish(
              result.text,
              buildTranslationContext(messages)
            )) || undefined;
        }

        // 修正・翻訳結果が揃ったら、表示済みのメッセージに反映する
        if (correctedContent || translatedContent) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, correctedContent, translatedContent }
                : m
            )
          );
        }

        // AI応答を生成（日本語の場合は英訳を使用）
        await generateAIResponse(translatedContent || result.text);
      }
    } catch (error) {
      console.error("Transcription error:", error);

      // エラーメッセージを表示
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content:
          "申し訳ございません。音声の認識中にエラーが発生しました。もう一度お試しください。",
        timestamp: new Date().toLocaleTimeString('ja-JP', {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: 'Asia/Tokyo'
        }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTranscribing(false);
    }
  };

  const generateAIResponse = async (userMessage: string) => {
    try {
      setIsAIResponding(true);

      const conversationHistory: Pick<
        Message,
        "role" | "content" | "translatedContent"
      >[] = [
        ...messages,
        {
          role: "user",
          content: userMessage,
        },
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // 日本語入力のユーザーメッセージは英訳(translatedContent)を使う。
          // ここでcontent（原文の日本語）を送ると会話履歴に日本語が混ざり、
          // AIが英語ではなく日本語で返答してしまう不具合があった
          messages: conversationHistory.map((msg) => ({
            role: msg.role,
            content: msg.translatedContent || msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const aiMessage = await response.json();

      if (aiMessage.error) {
        throw new Error(aiMessage.error);
      }

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("AI response error:", error);

      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content:
          "申し訳ございません。AIの応答生成中にエラーが発生しました。もう一度お試しください。",
        timestamp: new Date().toLocaleTimeString('ja-JP', {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: 'Asia/Tokyo'
        }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsAIResponding(false);
    }
  };

  // Initialize MediaRecorder for voice recording
  const initializeMediaRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      // ブラウザ別の最適な形式を動的検出
      let mimeType = "audio/webm;codecs=opus"; // デフォルト
      let fileExtension = ".webm";

      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
        fileExtension = ".webm";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
        fileExtension = ".ogg";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
        fileExtension = ".mp4";
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        // Stop all tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        if (audioBlob.size > 0) {
          await transcribeAudio(audioBlob, `recording${fileExtension}`);
        }
      };

      return mediaRecorder;
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert(
        "マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。"
      );
      return null;
    }
  };

  const handleVoiceInput = async () => {
    if (isRecording) {
      // Stop recording
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // Start recording
      const mediaRecorder = await initializeMediaRecorder();
      if (mediaRecorder) {
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        mediaRecorder.start();
        setIsRecording(true);
      }
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleTextToSpeech = useCallback(async (
    messageId: string, 
    text: string, 
    customOptions?: { onEnd?: () => void; onStart?: () => void; onError?: (error: Error) => void }
  ) => {
    // iOSはfetch等の非同期処理を挟むと再生がブロックされることがあるため、
    // タップ直後（awaitの前）に同期的に再生許可を確保しておく
    ttsPlayer.primeMobilePlayback();

    try {
      setIsPlaying((prev) => ({ ...prev, [messageId]: true }));

      await ttsPlayer.speak(text, playbackSpeed, {
        onStart: () => {
          setIsPlaying((prev) => ({ ...prev, [messageId]: true }));
          customOptions?.onStart?.();
        },
        onEnd: () => {
          setIsPlaying((prev) => ({ ...prev, [messageId]: false }));
          customOptions?.onEnd?.();
        },
        onError: (error) => {
          console.error("TTS error:", error);
          setIsPlaying((prev) => ({ ...prev, [messageId]: false }));
          customOptions?.onError?.(error);
        }
      });
    } catch (error) {
      console.error("TTS error:", error);
      setIsPlaying((prev) => ({ ...prev, [messageId]: false }));
    }
  }, [playbackSpeed]);

  // Track when auto-play is enabled
  useEffect(() => {
    if (autoPlayAudio && autoPlayStartTimeRef.current === null) {
      autoPlayStartTimeRef.current = Date.now();
    } else if (!autoPlayAudio) {
      autoPlayStartTimeRef.current = null;
      autoPlayedMessagesRef.current.clear();
      autoPlayedTranslationsRef.current.clear();
      waitingForAIResponseRef.current = false;
    }
  }, [autoPlayAudio]);

  // Auto-play TTS for AI responses when autoPlayAudio is enabled
  useEffect(() => {
    if (
      !autoPlayAudio ||
      messages.length === 0 ||
      autoPlayStartTimeRef.current === null
    )
      return;

    const lastMessage = messages[messages.length - 1];

    // Check if the last message is from assistant, not already playing, and not already auto-played
    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      !isPlaying[lastMessage.id] &&
      !autoPlayedMessagesRef.current.has(lastMessage.id)
    ) {
      // Since message ID is Date.now().toString(), we can compare numerically
      const messageId = Number.parseInt(lastMessage.id);
      const autoPlayStartTime = autoPlayStartTimeRef.current;

      // Only auto-play if message was created after auto-play was enabled
      if (messageId >= autoPlayStartTime) {
        // Check if we need to wait for user translation to finish
        const shouldWaitForTranslation = waitingForAIResponseRef.current;
        
        if (shouldWaitForTranslation) {
          // Don't auto-play yet, let the translation callback handle it
          return;
        }

        // Mark this message as auto-played to prevent duplicate playback
        autoPlayedMessagesRef.current.add(lastMessage.id);

        // Add a small delay to ensure message is rendered
        const timer = setTimeout(() => {
          handleTextToSpeech(lastMessage.id, lastMessage.content);
        }, 500);

        return () => clearTimeout(timer);
      }
    }
  }, [messages, autoPlayAudio, isPlaying, handleTextToSpeech]);

  // Keep messagesRef up to date
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // フッターの高さ変化（セーフエリアや表示状態の違い）を監視し、
  // メッセージ一覧の下余白がフッターと常に一致するようにする
  useEffect(() => {
    const footerEl = footerRef.current;
    if (!footerEl) return;

    const updateHeight = () => setFooterHeight(footerEl.offsetHeight);
    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(footerEl);
    return () => resizeObserver.disconnect();
  }, []);

  // 会話履歴の初期化: LocalStorageの読み込み完了を待ってから、
  // URLの?conversation=<id>、なければ直前に開いていた会話、
  // どちらもなければ新規会話を復元・作成する（一度だけ実行）
  useEffect(() => {
    if (!isConversationsLoaded || hasInitializedConversationRef.current) return;
    hasInitializedConversationRef.current = true;

    const requestedId = new URLSearchParams(window.location.search).get(
      "conversation"
    );
    const idToLoad = requestedId || activeConversationId;
    const existing = idToLoad ? getConversation(idToLoad) : undefined;

    if (existing) {
      setMessages(existing.messages);
      setConversationId(existing.id);
      setActiveConversationId(existing.id);
    } else {
      const created = createConversation(messagesRef.current);
      setConversationId(created.id);
      setActiveConversationId(created.id);
    }

    if (requestedId) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [
    isConversationsLoaded,
    activeConversationId,
    getConversation,
    createConversation,
    setActiveConversationId,
  ]);

  // メッセージが変化するたびに現在の会話をLocalStorageへ自動保存する
  useEffect(() => {
    if (!conversationId) return;
    saveMessages(conversationId, messages);
    // saveMessagesはContextの再レンダリングのたびに参照が変わるため、
    // 依存配列に含めると無限ループになる。messages変化時のみ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages]);

  // 現在の会話を保存した上で、新しい会話を開始する
  const handleNewConversation = useCallback(() => {
    const initialMessages = createInitialMessages();
    const created = createConversation(initialMessages);
    setMessages(initialMessages);
    setConversationId(created.id);
    setActiveConversationId(created.id);
    setCurrentNewsIndex(0);
    setDetectedLanguage("");
    setShowSettingsMenu(false);
  }, [createConversation, setActiveConversationId]);

  // Auto-play TTS for user message translations when autoPlayAudio is enabled
  useEffect(() => {
    if (
      !autoPlayAudio ||
      messages.length === 0 ||
      autoPlayStartTimeRef.current === null
    )
      return;

    const lastMessage = messages[messages.length - 1];

    // Check if the last message is from user with translated content or corrected content
    if (
      lastMessage &&
      lastMessage.role === "user" &&
      (lastMessage.translatedContent || lastMessage.correctedContent) &&
      !isPlaying[lastMessage.id] &&
      !autoPlayedTranslationsRef.current.has(lastMessage.id)
    ) {
      // Since message ID is Date.now().toString(), we can compare numerically
      const messageId = Number.parseInt(lastMessage.id);
      const autoPlayStartTime = autoPlayStartTimeRef.current;

      // Only auto-play if message was created after auto-play was enabled
      if (messageId >= autoPlayStartTime) {
        // Mark this translation as auto-played to prevent duplicate playback
        autoPlayedTranslationsRef.current.add(lastMessage.id);
        waitingForAIResponseRef.current = true;

        // Add a small delay to ensure message is rendered
        const timer = setTimeout(() => {
          const textToRead = lastMessage.translatedContent || lastMessage.correctedContent!;
          handleTextToSpeech(lastMessage.id, textToRead, {
            onEnd: () => {
              // After translation playback ends, trigger delayed AI response auto-play
              setTimeout(() => {
                waitingForAIResponseRef.current = false;
                // Force re-evaluation of AI auto-play using latest messages
                const currentMessages = messagesRef.current;
                const lastAIMessage = currentMessages[currentMessages.length - 1];
                if (
                  lastAIMessage &&
                  lastAIMessage.role === "assistant" &&
                  !autoPlayedMessagesRef.current.has(lastAIMessage.id) &&
                  autoPlayStartTimeRef.current !== null
                ) {
                  const messageId = Number.parseInt(lastAIMessage.id);
                  if (messageId >= autoPlayStartTimeRef.current) {
                    autoPlayedMessagesRef.current.add(lastAIMessage.id);
                    handleTextToSpeech(lastAIMessage.id, lastAIMessage.content);
                  }
                }
              }, 300); // Small delay to ensure AI response is available
            }
          });
        }, 500);

        return () => clearTimeout(timer);
      }
    }
  }, [messages, autoPlayAudio, isPlaying, handleTextToSpeech]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userInput = input.trim();

    // 即座にUI更新（フォーム閉じる・入力クリア）
    setInput("");
    setShowTextInput(false);

    // 修正・翻訳の完了を待たず、ユーザーメッセージを先に表示する
    const messageId = Date.now().toString();
    const newMessage: Message = {
      id: messageId,
      role: "user",
      content: userInput,
      originalContent: userInput,
      timestamp: new Date().toLocaleTimeString('ja-JP', {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: 'Asia/Tokyo'
      }),
    };

    setMessages((prev) => [...prev, newMessage]);

    // 英語の場合は修正処理、日本語の場合は英訳処理を実行
    let correctedContent: string | undefined;
    let translatedContent: string | undefined;

    if (isEnglish(userInput)) {
      correctedContent = (await correctEnglish(userInput)) || undefined;
    } else if (isJapanese(userInput)) {
      translatedContent =
        (await translateToEnglish(
          userInput,
          buildTranslationContext(messages)
        )) || undefined;
    }

    // 修正・翻訳結果が揃ったら、表示済みのメッセージに反映する
    if (correctedContent || translatedContent) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, correctedContent, translatedContent } : m
        )
      );
    }

    // AI応答を生成（日本語の場合は英訳を使用）
    await generateAIResponse(translatedContent || userInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Enterキーでの自動送信を無効化（明示的な送信ボタンクリックのみで送信）
    }
  };

  const handleBookmark = (
    messageId: string, 
    content: string, 
    correctedContent?: string, 
    translatedContent?: string, 
    originalContent?: string
  ) => {
    console.log('ブックマーク操作:', { messageId, isBookmarked: isMessageBookmarked(messageId) });
    
    if (isMessageBookmarked(messageId)) {
      // ブックマークを削除
      console.log('ブックマーク削除:', `bookmark-${messageId}`);
      removeBookmark(`bookmark-${messageId}`);
    } else {
      // ブックマークを追加
      const savedPhrase = createSavedPhraseFromMessage(
        messageId,
        content,
        correctedContent,
        translatedContent,
        originalContent,
        true  // 強制的にbookmarkカテゴリーにする
      );
      console.log('ブックマーク追加:', savedPhrase);
      addBookmark(savedPhrase);
    }
  };

  // タッチイベントハンドラー（スマホ用）
  const handleTouchStart = useCallback(
    (messageId: string) => () => {
      setTouchStartTime(Date.now());
      setSelectedMessageId(messageId);
      setShowTranslation(false);
      setTranslatedText("");
      setTranslationError(null);
      setIsTranslating(false);
      setLongPressMessageId(null);

      // 長押し検知のタイマーを設定（500msに短縮）
      longPressTimeoutRef.current = setTimeout(() => {
        setLongPressMessageId(messageId);
      }, 500);
    },
    []
  );

  const handleTouchMove = useCallback(() => {
    // 移動中は長押しタイマーをクリア
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (messageId: string) => () => {
      const touchDuration = Date.now() - touchStartTime;

      // 長押しタイマーをクリア
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }

      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        const selectedText = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // スマホの選択ツールを避けるため、適度に上に表示
        setTranslationPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 30, // 適切な位置に調整
        });

        // 長押しまたは一定時間選択していた場合に翻訳を表示
        if (longPressMessageId === messageId || touchDuration > 800) {
          setShowTranslation(true);
          // 翻訳を実行
          getTranslation(selectedText).then(setTranslatedText);
        }
      }

      setSelectedMessageId(null);
      setLongPressMessageId(null);
    },
    [touchStartTime, longPressMessageId, getTranslation]
  );

  // マウスイベント（PC用）
  const handleMouseDown = useCallback(
    (messageId: string) => () => {
      setSelectedMessageId(messageId);
      setShowTranslation(false);
      setTranslatedText("");
      setTranslationError(null);
      setIsTranslating(false);
    },
    []
  );

  const handleMouseUp = useCallback(
    () => () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        const selectedText = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // PC用も同様に適度に上に表示
        setTranslationPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 30, // 適切な位置に調整
        });
        setShowTranslation(true);
        // 翻訳を実行
        getTranslation(selectedText).then(setTranslatedText);
      }
      setSelectedMessageId(null);
    },
    [getTranslation]
  );

  // 翻訳吹き出しが固定フッターの背後に隠れないよう、必要な分だけスクロールする
  const scrollTranslationIntoView = (messageId: string) => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      const box = container?.querySelector<HTMLElement>(
        `[data-translation-box="${messageId}"]`
      );
      if (!container || !box) return;

      const containerRect = container.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      const visibleBottom = containerRect.bottom - footerHeight - 16;
      const overflow = boxRect.bottom - visibleBottom;

      if (overflow > 0) {
        container.scrollTop += overflow;
      }
    });
  };

  const handleTranslateMessage = async (messageId: string, content: string) => {
    // 翻訳を非表示にする場合
    if (translatedMessages.has(messageId)) {
      setTranslatedMessages((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
      return;
    }

    // 既に翻訳済みの場合は表示切り替えのみ
    if (messageTranslations.has(messageId)) {
      setTranslatedMessages((prev) => {
        const newSet = new Set(prev);
        newSet.add(messageId);
        return newSet;
      });
      scrollTranslationIntoView(messageId);
      return;
    }

    // 新規翻訳を実行
    try {
      setTranslatingMessages((prev) => new Set(prev).add(messageId));
      setTranslationErrors((prev) => {
        const newMap = new Map(prev);
        newMap.delete(messageId);
        return newMap;
      });

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      const context =
        messageIndex >= 0
          ? buildTranslationContext(messages.slice(0, messageIndex))
          : undefined;

      const response = await fetch("/api/translate-to-japanese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, context }),
      });

      if (!response.ok) {
        throw new Error("翻訳リクエストが失敗しました");
      }

      const result = await response.json();
      const translatedText = result.translatedText;

      if (!translatedText) {
        throw new Error("翻訳結果が取得できませんでした");
      }

      // 翻訳結果を保存
      setMessageTranslations((prev) => {
        const newMap = new Map(prev);
        newMap.set(messageId, translatedText);
        return newMap;
      });

      // 翻訳表示状態を有効化
      setTranslatedMessages((prev) => {
        const newSet = new Set(prev);
        newSet.add(messageId);
        return newSet;
      });
      scrollTranslationIntoView(messageId);
    } catch (error) {
      console.error("Translation error:", error);
      
      // エラーメッセージを設定
      const errorMessage = error instanceof Error ? error.message : "翻訳中にエラーが発生しました";
      setTranslationErrors((prev) => {
        const newMap = new Map(prev);
        newMap.set(messageId, errorMessage);
        return newMap;
      });
      
      // エラーでも表示状態にして、エラーメッセージを見せる
      setTranslatedMessages((prev) => {
        const newSet = new Set(prev);
        newSet.add(messageId);
        return newSet;
      });
      scrollTranslationIntoView(messageId);
    } finally {
      setTranslatingMessages((prev) => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  };

  const handleBackgroundClick = useCallback(() => {
    setShowTranslation(false);
    setTranslatedText("");
    setTranslationError(null);
    setIsTranslating(false);
  }, []);

  return (
    <>
      <div
        className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto bg-white"
        onClick={handleBackgroundClick}
      >
        <style>{`
          .message-content::selection {
            background-color: rgba(59, 130, 246, 0.3);
            color: inherit;
          }

          .message-content::-moz-selection {
            background-color: rgba(59, 130, 246, 0.3);
            color: inherit;
          }

          .ai-message-content::selection {
            background-color: rgba(16, 185, 129, 0.3);
            color: inherit;
          }

          .ai-message-content::-moz-selection {
            background-color: rgba(16, 185, 129, 0.3);
            color: inherit;
          }

          .correction-content::selection {
            background-color: rgba(245, 158, 11, 0.3);
            color: inherit;
          }

          .correction-content::-moz-selection {
            background-color: rgba(245, 158, 11, 0.3);
            color: inherit;
          }

          .selectable-text {
            cursor: text;
            transition: all 0.2s ease;
            -webkit-user-select: text;
            -moz-user-select: text;
            -ms-user-select: text;
            user-select: text;
            -webkit-touch-callout: none;
          }

          .selectable-text:hover {
            background-color: rgba(59, 130, 246, 0.05);
          }

          .selecting {
            background-color: rgba(59, 130, 246, 0.1);
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
            transition: all 0.2s ease;
          }

          .long-press-feedback {
            background-color: rgba(59, 130, 246, 0.2);
            transform: scale(1.02);
            transition: all 0.3s ease;
          }

          .translation-popup {
            animation: fadeInUp 0.3s ease-out;
          }

          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translate(-50%, -90%);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -100%);
            }
          }

          /* モバイル向けのタッチ最適化 */
          @media (max-width: 768px) {
            .selectable-text {
              -webkit-tap-highlight-color: rgba(59, 130, 246, 0.2);
              tap-highlight-color: rgba(59, 130, 246, 0.2);
            }
          }

          .slider::-webkit-slider-thumb {
            appearance: none;
            height: 20px;
            width: 20px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          }

          .slider::-moz-range-thumb {
            height: 20px;
            width: 20px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          }

          .slider::-webkit-slider-track {
            height: 8px;
            border-radius: 4px;
            background: #e5e7eb;
          }

          .slider::-moz-range-track {
            height: 8px;
            border-radius: 4px;
            background: #e5e7eb;
            border: none;
          }

          .animate-slide-up {
            animation: slideUp 0.3s ease-out;
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
        {/* Chat Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-6 space-y-6"
          style={{ paddingBottom: footerHeight + 24 }}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {message.role === "assistant" && null}

                <div
                  className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      {message.role === "assistant" ? "Bob" : "ぼく"}
                    </span>
                    <span className="text-sm text-gray-500">
                      {message.timestamp}
                    </span>
                  </div>

                  <div
                    className={`rounded-lg p-4 ${message.role === "assistant" ? "selectable-text" : ""} ${
                      message.role === "user"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-50 text-gray-900"
                    } ${message.role === "assistant" && autoBlurText ? "blur-sm hover:blur-none transition-all duration-200" : ""}
                    ${message.role === "assistant" && selectedMessageId === message.id ? "selecting" : ""} ${message.role === "assistant" && longPressMessageId === message.id ? "long-press-feedback" : ""}`}
                    onTouchStart={
                      message.role === "assistant"
                        ? handleTouchStart(message.id)
                        : undefined
                    }
                    onTouchMove={
                      message.role === "assistant" ? handleTouchMove : undefined
                    }
                    onTouchEnd={
                      message.role === "assistant"
                        ? handleTouchEnd(message.id)
                        : undefined
                    }
                    onMouseDown={
                      message.role === "assistant"
                        ? handleMouseDown(message.id)
                        : undefined
                    }
                    onMouseUp={
                      message.role === "assistant"
                        ? handleMouseUp()
                        : undefined
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className={`whitespace-pre-line select-text ${
                        message.role === "user"
                          ? "message-content"
                          : "ai-message-content"
                      }`}
                    >
                      {/* ニュース記事の特別なレンダリング */}
                      {message.role === "assistant" &&
                      message.type === "news" ? (
                        <div className="space-y-4">
                          {/* ニュースヘッダー */}
                          <div className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 rounded-r-lg">
                            <div className="flex items-start">
                              <div>
                                <div className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">
                                  Breaking News
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 leading-tight">
                                  {message.content.split("\n\n")[0] || ""}
                                </h3>
                              </div>
                            </div>
                          </div>

                          {/* ニュース本文 */}
                          <div className="text-gray-700 leading-relaxed">
                            {message.content.split("\n\n").slice(1).join("\n\n")}
                          </div>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>

                  {/* 修正された英語の表示 */}
                  {message.role === "user" && message.correctedContent && (
                    <>
                      <CorrectionDisplay
                        content={message.correctedContent}
                        type="correction"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100"
                          onClick={() => handleCopy(message.correctedContent!)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100"
                          onClick={() =>
                            handleTextToSpeech(
                              message.id,
                              message.correctedContent!
                            )
                          }
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100"
                          onClick={() =>
                            handleBookmark(
                              message.id, 
                              message.translatedContent || "",
                              message.translatedContent,
                              message.originalContent,
                              message.originalContent
                            )
                          }
                        >
                          <Bookmark
                            className={`h-4 w-4 ${isMessageBookmarked(message.id) ? "text-red-500 fill-red-500" : ""}`}
                          />
                        </Button>
                      </div>
                    </>
                  )}

                  {/* 日本語の英訳表示 */}
                  {message.role === "user" && message.translatedContent && (
                    <>
                      <CorrectionDisplay
                        content={message.translatedContent}
                        type="translation"
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100"
                          onClick={() => handleCopy(message.translatedContent!)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100"
                          onClick={() =>
                            handleTextToSpeech(
                              message.id,
                              message.translatedContent!
                            )
                          }
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100"
                          onClick={() =>
                            handleBookmark(
                              message.id,
                              message.content,
                              undefined,
                              message.translatedContent,
                              message.originalContent
                            )
                          }
                        >
                          <Bookmark
                            className={`h-4 w-4 ${isMessageBookmarked(message.id) ? "text-red-500 fill-red-500" : ""}`}
                          />
                        </Button>
                      </div>
                    </>
                  )}

                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                        onClick={() => handleCopy(message.content)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                        onClick={() =>
                          handleTextToSpeech(message.id, message.content)
                        }
                        disabled={isPlaying[message.id]}
                      >
                        {isPlaying[message.id] ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-8 w-8 p-0 hover:bg-gray-100 ${translatedMessages.has(message.id) ? "bg-blue-100 text-blue-600" : ""}`}
                        onClick={() => handleTranslateMessage(message.id, message.content)}
                        disabled={translatingMessages.has(message.id)}
                      >
                        {translatingMessages.has(message.id) ? (
                          <div className="animate-spin h-4 w-4 border border-blue-500 border-t-transparent rounded-full" />
                        ) : (
                          <Languages className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}

                  {/* 翻訳されたコンテンツの表示 */}
                  {message.role === "assistant" && translatedMessages.has(message.id) && (
                    <div
                      data-translation-box={message.id}
                      className="mt-2 rounded-lg p-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm max-w-full"
                    >
                      <div className="flex items-start gap-2">
                        <Languages className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="whitespace-pre-line flex-1">
                          {translationErrors.has(message.id) ? (
                            <span className="text-red-600">{translationErrors.get(message.id)}</span>
                          ) : (
                            messageTranslations.get(message.id) || "翻訳中..."
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ニュースメッセージの場合の「他のニュースも知りたい」ボタン */}
                  {message.role === "assistant" && message.type === "news" && (
                    <div className="mt-3 w-full max-w-sm">
                      <Button
                        onClick={handleNextNews}
                        disabled={isAIResponding}
                        variant="outline"
                        className="w-full h-12 p-3 text-left hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 justify-start"
                      >
                        <div className="flex items-center gap-3">
                          <Newspaper className="h-5 w-5 text-blue-600 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900">他のニュースも知りたい</span>
                        </div>
                      </Button>
                    </div>
                  )}

                  {/* 初期選択肢の表示 */}
                  {message.id === "initial" && (
                    <div className="mt-4 space-y-3 w-full max-w-sm">
                      {initialOptions.map((option) => {
                        const IconComponent = option.icon
                        return (
                          <Button
                            key={option.id}
                            onClick={() => handleOptionSelect(option)}
                            variant="outline"
                            className="w-full h-12 p-3 text-left hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 justify-start"
                          >
                            <div className="flex items-center gap-3">
                              <IconComponent className="h-5 w-5 text-blue-600 flex-shrink-0" />
                              <span className="text-sm font-medium text-gray-900">{option.title}</span>
                            </div>
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {message.role === "user" && null}
              </div>
            </div>
          ))}

          {/* AI応答生成中のタイピングインジケーター（フッターの高さを変えないよう吹き出しで表現） */}
          {isAIResponding && (
            <div className="flex justify-start">
              <div className="flex max-w-[80%] flex-row">
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">Bob</span>
                  </div>
                  <div className="rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Voice Input Area - 独立したコンテナ */}
      <div
        ref={footerRef}
        className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-4xl border-t bg-white p-6 pb-safe z-20"
      >
        <div className="flex justify-center items-center">
          {/* Left side - Text input button */}
          <div className="absolute left-6">
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="h-12 w-12 p-0 bg-transparent"
                onClick={() => setShowTextInput(!showTextInput)}
              >
                <Keyboard className="h-5 w-5" />
              </Button>
              {showTextInput && (
                <div className="absolute bottom-20 left-0 mb-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg w-80 z-25">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        テキスト入力
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setShowTextInput(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="メッセージを入力してください..."
                      className="w-full p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTextInput(false)}
                      >
                        キャンセル
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className="bg-blue-500 hover:bg-blue-600"
                      >
                        <Send className="h-4 w-4 mr-1" />
                        送信
                      </Button>
                    </div>
                  </div>
                  {/* Arrow pointing down */}
                  <div className="absolute -bottom-2 left-4 w-4 h-4 bg-white border-r border-b border-gray-200 transform rotate-45"></div>
                </div>
              )}
            </div>
          </div>

          {/* Center - Mic button */}
          <Button
            onClick={handleVoiceInput}
            variant={isRecording ? "destructive" : "default"}
            size="lg"
            className={`h-20 w-20 rounded-full p-0 shadow-lg transition-all duration-200 ${
              isRecording
                ? "animate-pulse bg-red-500 hover:bg-red-600 scale-110"
                : "bg-blue-500 hover:bg-blue-600 hover:scale-105"
            }`}
          >
            {isRecording ? (
              <MicOff className="h-10 w-10 text-white" />
            ) : (
              <Mic className="h-10 w-10 text-white" />
            )}
          </Button>

          {/* Right side - Settings menu */}
          <div className="absolute right-6 flex items-center">
            <div className="relative">
              {/* Settings menu items - slide up animation */}
              {showSettingsMenu && (
                <div className="absolute bottom-16 right-0 flex flex-col gap-2 animate-slide-up">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-12 w-12 p-0 shadow-md"
                    onClick={handleNewConversation}
                  >
                    <MessageSquarePlus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant={autoPlayAudio ? "default" : "outline"}
                    size="sm"
                    className="h-12 w-12 p-0 shadow-md"
                    onClick={() => setAutoPlayAudio(!autoPlayAudio)}
                  >
                    {autoPlayAudio ? (
                      <Volume2 className="h-5 w-5" />
                    ) : (
                      <VolumeX className="h-5 w-5" />
                    )}
                  </Button>
                  <Button
                    variant={autoBlurText ? "default" : "outline"}
                    size="sm"
                    className="h-12 w-12 p-0 shadow-md"
                    onClick={() => setAutoBlurText(!autoBlurText)}
                  >
                    {autoBlurText ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-12 w-12 p-0 bg-white shadow-md mb-3"
                    onClick={() => setShowSpeedControl(!showSpeedControl)}
                  >
                    <span className="text-sm font-medium">
                      {playbackSpeed}x
                    </span>
                  </Button>
                </div>
              )}

              {/* Main menu button */}
              <Button
                variant="outline"
                size="sm"
                className="h-12 w-12 p-0 bg-white"
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              >
                <span className="text-xl font-bold">⋯</span>
              </Button>
            </div>
          </div>
        </div>
        {/* 状態表示は高さ固定のスロットにまとめ、表示/非表示でフッターの高さが変わらないようにする */}
        <div className="mt-3 flex items-center justify-center h-5">
          {isTranscribing ? (
            <p className="text-sm text-blue-600 animate-pulse">
              Analyzing voice... / 音声を解析中...
            </p>
          ) : detectedLanguage && !isRecording && !isAIResponding ? (
            <p className="text-xs text-gray-500">
              Detected:{" "}
              {detectedLanguage === "japanese"
                ? "日本語"
                : detectedLanguage === "english"
                  ? "English"
                  : detectedLanguage}
            </p>
          ) : null}
        </div>
      </div>

      {showSpeedControl && (
        <div 
          className="fixed inset-0 z-30"
          onClick={() => {
            if (!speedModalTouchProcessedRef.current) {
              setShowSpeedControl(false);
            }
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            speedModalTouchProcessedRef.current = true;
            setShowSpeedControl(false);
            // クリックイベントの重複を防ぐため、短時間フラグを立てる
            setTimeout(() => {
              speedModalTouchProcessedRef.current = false;
            }, 300);
          }}
        >
          <div 
            className="absolute bottom-40 right-20 mb-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg w-64"
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  読み上げ速度
                </span>
                <span className="text-sm text-blue-600 font-medium">
                  {playbackSpeed}x
                </span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  value={speedOptions.indexOf(playbackSpeed)}
                  onChange={(e) =>
                    setPlaybackSpeed(
                      speedOptions[Number.parseInt(e.target.value)] || 1.0
                    )
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>
            </div>
            {/* Arrow pointing down - 右端に配置 */}
            <div className="absolute -bottom-2 right-4 w-4 h-4 bg-white border-r border-b border-gray-200 rotate-45"></div>
          </div>
        </div>
      )}

      {/* Translation Popup */}
      {showTranslation && (
        <div
          className="fixed bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-xl z-40 pointer-events-none translation-popup max-w-xs"
          style={{
            left: translationPosition.x,
            top: translationPosition.y,
            transform: "translate(-50%, -100%)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-medium text-center">
            {isTranslating ? (
              <span className="animate-pulse">翻訳中...</span>
            ) : translationError ? (
              <span className="text-red-300">{translationError}</span>
            ) : (
              translatedText || "翻訳結果が表示されます"
            )}
          </div>
          {/* Arrow pointing down */}
          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
        </div>
      )}

      {/* PWA Install Prompt */}
      <PWAInstall />
    </>
  );
}
