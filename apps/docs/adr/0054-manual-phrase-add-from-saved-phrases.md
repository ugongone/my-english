# 0054 – 保存したフレーズ画面からの手動フレーズ追加機能

## 背景 / Context

これまでフレーズの保存は、チャット画面でメッセージをブックマークする経路でしか行えなかった。チャットで会話していない単語・表現でも「保存したフレーズ」に直接登録したいというニーズがあり、一覧画面単体で完結する追加手段が求められていた。

---

## 決定 / Decision

`/saved-phrases`画面右下にフローティングの追加ボタン（+）を設置し、タップすると英語フレーズ（必須）と日本語訳（任意）を入力できる小さなフォームを表示する。保存すると`bookmark-context.tsx`の`addBookmark`を通じて既存のブックマークと同じLocalStorageに永続化される。

---

## 理由 / Rationale

- 既存のブックマーク機能（Context + LocalStorage）をそのまま再利用でき、データの持ち方を分岐させずに済む
- チャット画面の「テキスト入力」ポップアップと同じUIパターン（右下のボタン→吹き出し型フォーム）を踏襲し、実装コストと学習コストを抑える
- 日本語訳を任意項目にすることで、英単語だけを素早くメモしたい場合にも対応できる

---

## 実装詳細 / Implementation Notes

### 1. 手動追加用のSavedPhrase生成

```tsx
// app/saved-phrases/page.tsx
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
```

理由:

- IDに`manual-`プレフィックスを付け、チャット由来の`bookmark-${messageId}`と衝突しないようにした
- `category: "bookmark"`固定にすることで、既存の`getBookmarkedPhrases`のフィルタ条件をそのまま満たす
- 日本語訳が未入力の場合は`undefined`にし、表示側の`phrase.originalContent &&`という既存の条件分岐をそのまま利用できるようにした

### 2. フローティングボタンとフォームUI

```tsx
<Button
  onClick={() => setShowAddForm(!showAddForm)}
  size="lg"
  className="h-14 w-14 rounded-full p-0 shadow-lg bg-blue-500 hover:bg-blue-600"
>
  <Plus className="h-6 w-6 text-white" />
</Button>
```

理由:

- チャット画面のテキスト入力ポップアップ（`app/page.tsx`）と同じ吹き出し型フォームのスタイルを流用し、アプリ内での見た目の一貫性を保った
- 英語フレーズが未入力の場合は保存ボタンを無効化し、空データの登録を防止

---

## 影響 / Consequences

- チャットを経由せずに、保存したフレーズ画面から直接フレーズを追加できるようになる
- 既存のブックマークデータ構造・LocalStorageキーは変更していないため、既存データへの影響はない

---

## 言語的・技術的なポイント

- 既存Contextの`addBookmark`をそのまま呼び出すだけで永続化・一覧反映の両方が完結する設計になっているため、新規追加経路を増やす際の変更範囲が最小限で済んだ

---

## 参考 / References

- 0039-bookmark-page-implementation.md - 保存したフレーズ画面の基礎実装
- 0041-bookmark-integration-localstorage-persistence.md - Context + LocalStorageによる永続化パターン

---
