# 0051 – 翻訳APIへの会話コンテキスト付与による主語解決の改善

## 背景 / Context

日本語は主語を省略しやすい言語のため、「実は18位まで上がってるんだよね。」のように主語のない文をそのまま英訳すると、翻訳AIが直前の会話の流れ（例: Bobが日本のFIFAランキングについて話していた）を知らないまま訳出することになり、"They've moved up to 18th place." であるべきところが "I've moved up to 18th place." のように誤った主語で訳されてしまう問題があった。

原因は `translate-to-english` / `translate-to-japanese` の各APIが、翻訳対象の1文のみをOpenAI APIに渡しており、会話履歴を一切考慮していなかったことにある。一方、AI応答生成用の `/api/chat` は既に会話履歴（`messages`）を渡す実装になっており、同様の仕組みが翻訳APIには欠けていた。

---

## 決定 / Decision

`translate-to-english` / `translate-to-japanese` の両APIに、直近の会話履歴を「翻訳対象の主語・代名詞を解決するための参考情報」として任意で受け取れるようにし、フロントエンドから翻訳実行時に直近6件の会話履歴を渡すようにする。

---

## 理由 / Rationale

- 会話履歴自体を翻訳・応答対象にしてしまうと出力が壊れるため、プロンプト上で「参考情報であり翻訳・応答対象ではない」ことを明示する方式を採用
- `context` はオプショナルなパラメータとし、既存の呼び出し（`getTranslation` など）に影響を与えない後方互換性を維持
- `/api/chat` と同様に会話履歴を活用するパターンを踏襲し、アーキテクチャの一貫性を保持
- 直近6件に絞ることで、トークン消費の増加を抑えつつ主語解決に必要な文脈を確保

---

## 実装詳細 / Implementation Notes

### 1. 翻訳APIでのコンテキストブロック生成

```ts
// apps/web/app/api/translate-to-english/route.ts
// apps/web/app/api/translate-to-japanese/route.ts
function buildContextBlock(context: unknown): string {
  if (!Array.isArray(context) || context.length === 0) return "";

  const lines = context
    .filter(
      (m): m is { role: string; content: string } =>
        !!m && typeof m.content === "string" && m.content.trim().length > 0
    )
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`);

  if (lines.length === 0) return "";

  return `Conversation context (for reference only; do not translate or respond to this part):\n${lines.join("\n")}`;
}
```

理由:

- 会話履歴を専用のプロンプトブロックとして分離し、翻訳対象の本文と明確に区別
- システムプロンプト側でも「主語・代名詞の解決にのみ使用し、翻訳・応答はしない」ことを明示し、誤動作を防止

### 2. フロントエンドでの直近会話履歴の組み立て

```ts
// apps/web/app/page.tsx
const CONTEXT_MESSAGE_LIMIT = 6;
const buildTranslationContext = (
  history: Message[]
): { role: "user" | "assistant"; content: string }[] => {
  return history.slice(-CONTEXT_MESSAGE_LIMIT).map((m) => ({
    role: m.role,
    content: m.translatedContent || m.content,
  }));
};
```

理由:

- ユーザーの過去発言は、日本語の生テキストより英訳済みテキスト（`translatedContent`）の方が翻訳AIにとって文脈把握しやすいため優先的に使用
- 直近6件に制限し、無関係に古い文脈による誤訳や無駄なトークン消費を抑制

### 3. 各呼び出し箇所へのコンテキスト付与

```ts
// テキスト入力（handleSend）・音声入力（transcribeAudio）どちらも同様に対応
translatedContent =
  (await translateToEnglish(
    userInput,
    buildTranslationContext(messages)
  )) || undefined;

// AIメッセージの日本語訳表示（handleTranslateMessage）
const messageIndex = messages.findIndex((m) => m.id === messageId);
const context =
  messageIndex >= 0
    ? buildTranslationContext(messages.slice(0, messageIndex))
    : undefined;
```

理由:

- 日本語→英訳・英語→日本語訳の両方向で対称的に文脈を活用できるようにする
- `handleTranslateMessage` では対象メッセージより前の履歴のみを渡し、未来の情報を混入させない

---

## 影響 / Consequences

- 日本語入力時の英訳精度が向上し、主語省略文でも会話の流れに沿った自然な訳出が期待できる
- 会話履歴を含める分、翻訳APIのリクエストサイズ・トークン消費がわずかに増加する
- ハイライト選択翻訳（`getTranslation`）は対象文が短く独立していることが多いため、今回はスコープ外とし変更していない

---

## 言語的・技術的なポイント

- OpenAI Chat Completions APIの`user`メッセージ内でコンテキストと翻訳対象を明確に区切ることで、単一のAPI呼び出し構成を維持したまま文脈情報を追加できる
- `context`をオプショナルにすることで、既存の呼び出し元を変更せずに段階的に適用できる設計とした

---

## 参考 / References

- 既存実装: `/apps/web/app/api/chat/route.ts`（会話履歴を渡すパターン）
- 関連ADR: `apps/docs/adr/0008-japanese-to-english-translation.md`
- 関連ADR: `apps/docs/adr/0016-openai-translation-implementation.md`

---
