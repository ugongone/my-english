# 0053 – スマートフォンのEnterキーによるメッセージ送信の再有効化

## 背景 / Context

0010で意図しない送信を防ぐためにEnterキーでの自動送信を無効化していたが、スマートフォンのソフトウェアキーボードでは「送信」ボタンをタップする一手間が煩わしく、キーボード右下のEnter（改行）キーで直接送信したいという要望があった。

---

## 決定 / Decision

Enterキー単体（Shiftキーを押していない場合）でメッセージを送信するように変更する。ただし、日本語IMEの変換確定時のEnterキー入力では送信しないようにする。Shift+Enterでの改行は0010から引き続き維持する。

---

## 理由 / Rationale

- スマートフォンでの送信操作を1タップ減らし、入力体験を向上させる
- 日本語入力では変換確定にEnterキーを使うため、変換確定と送信を区別しないと変換中に意図せず送信されてしまう
- Shift+Enterによる改行機能は既存ユーザーの操作方法を変えないため維持する

---

## 実装詳細 / Implementation Notes

### 1. キーボードイベントハンドラーの修正

```ts
const handleKeyPress = (e: React.KeyboardEvent) => {
  if (e.key !== "Enter" || e.shiftKey) return;

  // 日本語IME変換確定のEnterでは送信しない（keyCode 229は変換中を示す値）
  if (e.nativeEvent.isComposing || e.keyCode === 229) return;

  e.preventDefault();
  handleSend();
};
```

理由:

- `e.nativeEvent.isComposing`でIME変換中かどうかを判定し、変換確定のEnterキー入力を送信と誤認しないようにした
- Safari等、`isComposing`が正しく反映されない環境向けに、フォールバックとして非推奨の`keyCode === 229`（IME変換中を示す値）も併用した
- `e.preventDefault()`によりEnterキーによる改行挿入を抑止してから`handleSend()`を呼び出す

---

## 影響 / Consequences

- スマートフォンでもPCと同様にEnterキーでメッセージを送信できるようになる
- 日本語IME使用時、変換確定のEnterキーでは送信されず、変換確定後にもう一度Enterキーを押すことで送信される
- 0010の決定（Enterキー送信の無効化）を上書きする形になるため、今後Enterキー挙動を変更する際は本ADRと0010の両方を参照すること

---

## 言語的・技術的なポイント

- `KeyboardEvent.isComposing`はIME変換セッション中かどうかを示す標準プロパティで、日本語・中国語・韓国語など変換を伴う入力方式との共存に必須の判定
- `keyCode === 229`は非推奨だが、IME変換中のキーイベントで多くのブラウザが共通して返す値であり、`isComposing`未対応環境のフォールバックとして広く使われる

---

## 参考 / References

- 0010-disable-enter-key-submission.md - Enterキー送信を無効化した際の決定（本ADRにより一部上書き）

---
