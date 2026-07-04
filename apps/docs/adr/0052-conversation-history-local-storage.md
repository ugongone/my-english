# 0052 – 会話履歴機能の実装（LocalStorage永続化）

## 背景 / Context

これまでチャット画面のメッセージはコンポーネントのuseState内にのみ保持されており、ページを離れたりブラウザを閉じたりすると会話が失われていた。ナビゲーションメニューには「チャット履歴」へのリンク（`/history`）が既に用意されていたが、実体となるページや会話保存の仕組みは未実装だった。

---

## 決定 / Decision

`bookmark-context.tsx`と同じReact Context + LocalStorageのパターンで会話履歴を管理する`ConversationProvider`を新設し、チャット画面のメッセージ変化を自動的に会話単位で永続化する。あわせて`/history`ページを実装し、過去の会話一覧の閲覧・再開・削除を可能にする。

---

## 理由 / Rationale

- 既存のブックマーク機能と同じ設計パターンを踏襲することで、実装コストと学習コストを抑えられる
- 外部データベースや認証機能を追加せずに、要件である「一旦LocalStorageに保存」を満たせる
- チャット画面と履歴画面をContextで疎結合に連携でき、既存のチャットUIへの変更を最小限にできる

---

## 実装詳細 / Implementation Notes

### 1. 会話Context管理システムの構築

```tsx
// lib/conversation-context.tsx
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface ConversationContextType extends ConversationState {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  createConversation: (messages: Message[]) => Conversation;
  saveMessages: (id: string, messages: Message[]) => void;
  deleteConversation: (id: string) => void;
  getConversation: (id: string) => Conversation | undefined;
}
```

理由:
- チャットの`Message`型をこのファイルに集約し、`page.tsx`と`/history`ページで共通利用できるようにした
- `bookmark-context.tsx`と同様にuseReducerでイミュータブルな状態更新を行う

### 2. LocalStorage読み込みタイミングの調整（水和ミスマッチ回避）

```tsx
// 初期状態はSSRと同じ空配列にしておき、マウント後にLocalStorageから読み込む
const [state, dispatch] = useReducer(conversationReducer, {
  conversations: [],
  isLoaded: false,
});

useEffect(() => {
  dispatch({ type: "LOAD_CONVERSATIONS", payload: loadFromLocalStorage() });
}, []);
```

理由:
- useReducerの初期化関数で同期的にLocalStorageを読み込むと、サーバー側でレンダリングされたHTML（常に空配列）とクライアント初回レンダリングの内容が食い違い、`/history`ページで水和（hydration）ミスマッチが発生することを確認した
- `bookmark-context.tsx`と同じ「マウント後にuseEffectで読み込む」方式に統一し、`isLoaded`フラグで読み込み完了を子コンポーネントに伝搬できるようにした

### 3. チャット画面での会話の自動保存・復元

```tsx
// app/page.tsx
useEffect(() => {
  if (!isConversationsLoaded || hasInitializedConversationRef.current) return;
  hasInitializedConversationRef.current = true;

  const requestedId = new URLSearchParams(window.location.search).get("conversation");
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
}, [isConversationsLoaded, activeConversationId, getConversation, createConversation, setActiveConversationId]);

useEffect(() => {
  if (!conversationId) return;
  saveMessages(conversationId, messages);
  // saveMessagesはContextの再レンダリングのたびに参照が変わるため、
  // 依存配列に含めると無限ループになる。messages変化時のみ実行する
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [conversationId, messages]);
```

理由:
- `isConversationsLoaded`（Contextの読み込み完了フラグ）を待ってから初期化することで、LocalStorageの内容が反映される前に新規会話を作成してしまう競合を防止した
- `hasInitializedConversationRef`で初期化処理を一度だけに限定し、Contextの関数参照が変わるたびに再実行されないようにした
- メッセージ変化の自動保存はuseEffectの依存配列を意図的に絞り、Context関数の参照変化による無限ループを回避した

### 4. 履歴一覧ページの実装

```tsx
// app/history/page.tsx
const handleOpen = (id: string) => {
  router.push(`/?conversation=${id}`);
};
```

理由:
- 既存のチャット画面（`/`）をそのまま再利用し、クエリパラメータで会話を指定する方式にすることでルーティングを簡素化した
- `saved-phrases/page.tsx`と同様のカード型リストUIに統一し、タイトル・最終更新日時・メッセージ件数・削除ボタンを表示する

---

## 影響 / Consequences

- チャットを離れても会話が保持され、`/history`から過去の会話を再開できるようになった
- チャット画面に「新しい会話」ボタン（設定メニュー内）を追加したため、現在の会話を保存した状態で新規会話を開始できる
- 将来的にバックエンドへ移行する場合も、Context層のインターフェースを保ったままLocalStorage実装部分のみ差し替え可能な設計にしている

---

## 言語的・技術的なポイント

- LocalStorageを使うClient ComponentをNext.js App Routerで扱う際は、SSR結果と一致させるためマウント後のuseEffectで読み込む必要がある（同期的なuseReducer初期化はhydrationミスマッチの原因になる）
- Context内の関数はレンダリングのたびに新しい参照になるため、それをuseEffectの依存配列に含めると意図しない無限ループを招きやすい

---

## Q&A / 技術理解のためのポイント

### Q1: なぜuseReducerの初期化関数で同期的にLocalStorageを読み込まなかったのか？

**Q: ブックマーク機能より先に会話データを使う必要があるなら、同期的に読み込んだ方が確実では？**

**A: 実際に同期初期化を試したところ、`/history`ページでSSR結果とクライアント初回レンダリングが一致せず、Reactのhydrationミスマッチ警告が発生した。既存の`bookmark-context.tsx`と同じ非同期読み込み方式に合わせ、代わりに`isLoaded`フラグで読み込み完了を子コンポーネントに伝える設計に変更した。**

### Q2: チャット画面の初期化処理はなぜ一度きりのuseEffectでは実装できなかったのか？

**Q: マウント時に1回だけ実行するなら`useEffect(() => {...}, [])`で十分では？**

**A: 空の依存配列だと、ConversationProviderのLocalStorage読み込みが完了する前にチャット画面側の初期化処理が走ってしまい、まだ空の会話一覧を見て新規会話を作成してしまう競合があった。`isLoaded`フラグを依存配列に含め、読み込み完了後に一度だけ実行されるよう`hasInitializedConversationRef`で制御する方式にした。**

---

## 参考 / References

- 0041-bookmark-integration-localstorage-persistence.md - Context + LocalStorageによる永続化パターンの前例
- 0039-bookmark-page-implementation.md - 一覧ページのUIパターンの前例

---
