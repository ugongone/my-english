# 0045 – OpenAIモデルのgpt-5系移行とTTSモデル更新

## 背景 / Context

chat / correct-english / translate-to-english / translate-to-japanese は`gpt-4.1`、newsは`gpt-4.1-mini`を使用していたが、OpenAIの新世代モデル`gpt-5-mini` / `gpt-5-nano`への更新を検討した。あわせてTTSも`tts-1-hd`から後継の`gpt-4o-mini-tts`への移行を検討した。

transcribeについては過去に[0004](./0004-gpt-4o-transcribe-migration.md)で`gpt-4o-transcribe`へ移行した後、`verbose_json`非対応により言語検出が壊れたため[0031](./0031-whisper-1-revert-for-language-detection.md)で`whisper-1`へ差し戻した経緯がある。今回、この据え置き判断が現在も妥当かを改めて検証した。

---

## 決定 / Decision

- LLM系5ルート(chat, correct-english, translate-to-english, translate-to-japanese, news)を`gpt-5-mini` / `gpt-5-nano`に移行する
- TTSを`tts-1-hd`から`gpt-4o-mini-tts`に移行する
- transcribeは`whisper-1`を継続使用する(変更なし)

---

## 理由 / Rationale

- `gpt-5-mini` / `gpt-5-nano`は旧世代`gpt-4.1`系より大幅に低コスト(gpt-5-mini: $0.25/$2.00 per 1M tokens vs gpt-4.1: $2/$8)
- `gpt-4o-mini-tts`の「speedパラメータ非対応」は2025年5月時点でOpenAI公式コミュニティに報告されていた既知の不具合だが、実地検証の結果、現在は解消され正常動作を確認できた(speed 0.5〜2.0で音声長が理論通りに変化)
- `whisper-1`のみが`verbose_json`で`language`フィールドを提供でき、[page.tsx](../../apps/web/app/page.tsx)の非対応言語(日英以外)警告機能に必須。`gpt-4o-transcribe`は同一価格帯かつ性能改善も英語で5〜15%程度と不確実なため、移行するメリットがない

---

## 実装詳細 / Implementation Notes

### 1. gpt-5系reasoning modelへのパラメータ対応

```ts
// 変更前
model: "gpt-4.1",
temperature: 0.7,
max_tokens: 1000,

// 変更後
model: "gpt-5-mini",
max_completion_tokens: 1000,
reasoning_effort: "minimal",
```

理由:

- gpt-5系はreasoning modelのため`temperature`パラメータ非対応(渡すとエラーになる)
- `max_tokens`は非推奨のため`max_completion_tokens`に統一
- 会話/翻訳/添削/要約は深い推論を必要としないため`reasoning_effort: "minimal"`を指定

対象ファイル: [chat/route.ts](../../apps/web/app/api/chat/route.ts), [correct-english/route.ts](../../apps/web/app/api/correct-english/route.ts), [translate-to-english/route.ts](../../apps/web/app/api/translate-to-english/route.ts), [translate-to-japanese/route.ts](../../apps/web/app/api/translate-to-japanese/route.ts)（`gpt-5-mini`）、[news/route.ts](../../apps/web/app/api/news/route.ts)（`gpt-5-nano`）

### 2. TTSモデル更新

```ts
// 変更前
model: 'tts-1-hd',
// 変更後
model: 'gpt-4o-mini-tts',
```

理由:

- speedパラメータ対応が2025年6月頃に解消されたことを実地検証(speed違いでの音声長比較)で確認済み
- `voice` / `speed`パラメータはそのまま流用可能で、フロントエンド側([audio-player.ts](../../apps/web/lib/audio-player.ts))の変更は不要

### 3. OpenAI SDK更新

- `openai`パッケージを`^5.8.2` → `^5.23.2`に更新
- 理由: 旧バージョンの`ReasoningEffort`型に`'minimal'`が定義されておらず型エラーになるため

### 4. OpenAIプロジェクトのモデルアクセス権限追加

- Project Settings > Limits > Model usage の Allowed models に `gpt-5-mini` / `gpt-5-nano` / `gpt-4o-mini-tts` を追加
- 理由: プロジェクト側の許可リスト(allowlist)に含まれないモデルは`model_not_found`(HTTP 403)で呼び出し自体が失敗するため。これはOpenAIのクォータ(課金)不足とは別問題であり、両方の解決が必要だった

---

## 影響 / Consequences

- LLM呼び出しコストの削減(gpt-5-mini/nanoは旧gpt-4.1系より大幅に安価)
- `reasoning_effort: "minimal"`により、深い推論が不要な用途でのレイテンシ増加を抑制
- transcribeは変更なしのため、既存の非対応言語警告機能は維持される
- 技術的負債: OpenAIプロジェクトのAllowed modelsは許可リスト方式のため、今後新モデルを使う際は都度ダッシュボードでの許可設定が必要

---

## Q&A / 技術理解のためのポイント

### Q1: なぜtranscribeだけ移行しなかったのか?

**Q: LLM系・TTS系は移行したのに、transcribeだけwhisper-1のまま据え置いた理由は?**

**A: `gpt-4o-transcribe` / `gpt-4o-mini-transcribe`は`response_format`が`json`/`text`のみで`verbose_json`非対応。`json`形式のレスポンスには`language`フィールドが含まれないため、[page.tsx:306](../../apps/web/app/page.tsx)の非対応言語警告機能が壊れる。実際に日本語音声をgpt-4o-transcribeへ投げて検証したが、`language`は一切返らなかった。加えて価格はwhisper-1と同額(共に$0.006/分)で、性能面の改善も英語で5〜15%程度と不確実なため、積極的に移行するメリットがない。これは[0031](./0031-whisper-1-revert-for-language-detection.md)で一度gpt-4o-transcribeへ移行して問題が発覚し差し戻した経緯とも整合する判断である。**

### Q2: なぜgpt-4o-mini-ttsのspeed非対応という過去の判断が覆ったのか?

**Q: 以前「speed非対応」としていた根拠は何だったのか?**

**A: OpenAI公式コミュニティで2025年5月に「speedパラメータが無視される」不具合が報告されていたが、これはドキュメントの誤りで後日修正されている。実際にAPIでspeed=0.5/1.0/1.5/2.0を送って生成音声の長さを比較したところ、10.9秒→5.0秒→3.6秒→2.6秒と理論通りに単調変化することを確認できたため、現在は正常に対応していると判断した。**

---

## 参考 / References

- [0004-gpt-4o-transcribe-migration.md](./0004-gpt-4o-transcribe-migration.md)
- [0031-whisper-1-revert-for-language-detection.md](./0031-whisper-1-revert-for-language-detection.md)
- [0017-ai-response-optimization-tts-speed-control.md](./0017-ai-response-optimization-tts-speed-control.md)

---
