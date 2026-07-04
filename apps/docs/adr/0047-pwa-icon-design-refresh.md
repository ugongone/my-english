# 0047 – PWAアイコンデザインの刷新

## 背景 / Context

- スマートフォンでPWAとしてホーム画面に追加した際に表示されるアイコン（`icon-192x192.png` / `icon-512x512.png` / `apple-touch-icon.png`）を刷新したいという要望があった。
- 従来は `public/icon.svg`（音声波形+マイクのデザイン）と実際に配布されている各PNG（チャット吹き出し+マイクのデザイン）の見た目が一致しておらず、ソースSVGから再生成すると意図しない見た目に戻ってしまう状態だった。
- ユーザーへのヒアリングの結果、「現行デザイン（チャット吹き出し＋マイク）のコンセプトを踏襲しつつ、見た目を洗練させる」方針を採用した。

---

## 決定 / Decision

`public/icon.svg` を新デザイン（グラデーション背景＋チャット吹き出し＋マイク＋音声波形＋リフレッシュバッジ）で作り直し、これを唯一のソースとして `icon-192x192.png` / `icon-512x512.png` / `apple-touch-icon.png` を再生成する。

---

## 理由 / Rationale

- ソースSVGと配布PNGの内容を一致させることで、以後アイコンを再生成する際に意図しないデザイン差分が生まれないようにする。
- 単色の背景から2色グラデーションに変更し、マイク・音声波形もグラデーション＋透過度で立体感を出すことで、既存コンセプトを維持しつつモダンな見た目に更新した。
- `manifest.json` の `icons` エントリ（ファイル名・サイズ・`purpose: "maskable any"`）は変更せず、画像の中身のみ差し替えることで影響範囲を最小化した。

---

## 実装詳細 / Implementation Notes

### 1. アイコンSVGの刷新

```svg
<!-- apps/web/public/icon.svg -->
<linearGradient id="bg" x1="64" y1="32" x2="448" y2="480" gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#60A5FA"/>
  <stop offset="1" stop-color="#2563EB"/>
</linearGradient>
<rect width="512" height="512" rx="112" fill="url(#bg)"/>
```

理由:

- 単色 `#3B82F6` の塗りつぶしから左上→右下のグラデーションに変更し、アイコンに奥行きを持たせた。
- 角丸半径を `rx=64` → `rx=112` に拡大し、iOS/Android双方の最新のアイコン角丸トレンドに近づけた。

### 2. PNGアイコンの再生成

```js
// sharpでicon.svgから各サイズを書き出し
const sizes = [
  ["icon-192x192.png", 192],
  ["icon-512x512.png", 512],
  ["apple-touch-icon.png", 180],
];
sizes.forEach(([name, size]) =>
  sharp("apps/web/public/icon.svg", { density: 384 }).resize(size, size).png().toFile(`apps/web/public/${name}`)
);
```

理由:

- `icon.svg` を単一のソースとして全サイズを機械的に生成することで、デザインの一致とメンテナンス性を担保した。
- `density` を上げてラスタライズすることで、192px/180pxのような小サイズでも輪郭がぼやけないようにした。

---

## 影響 / Consequences

- ホーム画面追加時・タスク切替時などPWAとして表示されるアイコンの見た目が変わる（機能・マニフェスト構成への影響なし）。
- `manifest.json` が参照する `screenshot-wide.png` / `screenshot-narrow.png` は本対応の対象外で、引き続き実体ファイルが存在しない状態が残っている（別途フォローアップが必要）。
- iOS向けのスプラッシュ画面（`apple-touch-startup-image`）も本対応の対象外。

---

## 言語的・技術的なポイント

- PWAの `manifest.json` における `purpose: "maskable"` は、OSが独自にアイコンを丸型・角丸スクエアなどの形状でマスクすることを前提とした指定。マスクされても主要な要素が欠けないよう、中央80%程度の安全領域にコンテンツを収めるのが望ましい。
- Next.js の `public/` 配下のファイルはビルド時に処理されず、静的にそのまま配信されるため、画像差し替えのみであればアプリケーションコードのビルド・型チェックへの影響はない。

---

## 参考 / References

- 特になし
