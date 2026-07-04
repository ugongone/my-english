# 0050 – iOS Safariで読み上げ音声が再生されない不具合の修正

## 背景 / Context

- ユーザーからスマホのSafariで個別の読み上げボタンをタップしても音が聞こえない、かつ挙動が不規則（鳴るときと鳴らないときがある）という報告があった。
- Vercelの本番ログ（`get_runtime_logs`/`get_runtime_errors`）を確認したところ、`/api/tts`へのリクエストは`200`で正常に返っており、サーバー側・OpenAI側の問題ではないことが確認できた。問題はクライアント側（音声データ受信後の再生処理）にあると判断した。
- モバイル専用の再生ロジック（`mobileAudioPlay`）自体はADR 0032以来変更しておらず、今回の一連の変更（PWAアイコン刷新・デスクトップ向けストリーミング再生の追加）はモバイルのコードパスに一切触れていなかった。
- 挙動が不規則である点から、iOS Safari特有の「ユーザー操作（タップ）から離れた`audio.play()`呼び出しはブロックされることがある」という既知の制約を疑った。`handleTextToSpeech`は`await import('@/lib/audio-player')`や`/api/tts`へのネットワークフェッチという非同期処理を経てから初めて`audio.play()`を呼んでおり、フェッチが遅い（回線が不安定、TTS生成に時間がかかる等）ときほどタップの瞬間から離れてしまい、iOSにブロックされる可能性が高くなる。これが「速いときは鳴る、遅いときは鳴らない」という不規則な挙動と一致する。

---

## 決定 / Decision

タップ直後・非同期処理より前に無音を再生してユーザー操作起点の再生許可をひとつの`<audio>`要素に固定し（`primeMobilePlayback`）、実際の音声取得後はその同じ要素を使い回して再生する（`mobileAudioPlay`の改修）。これに伴い、この改修に必要な`ttsPlayer`の静的importを可能にするため、`DeviceDetector`をSSRセーフに修正した。

---

## 理由 / Rationale

- iOSのHTMLMediaElementに対する自動再生ポリシーは、「ユーザー操作から呼ばれた`play()`」を許可する一方、非同期処理を挟んで呼ばれた`play()`をブロックすることがある。挙動の不規則さの原因として最も辻褄が合う。
- この制約はブラウザ側の挙動であり、サーバーやAPIモデルを変更しても解決できない。タップの瞬間に同期的に`play()`を一度成功させ、その後は同じ要素の`src`を差し替えて再生を続ける「オーディオアンロック」は、この種の問題に対する一般的な対処法。
- `ttsPlayer`を`handleTextToSpeech`内で動的import（`await import(...)`）していたのは、`TTSPlayer`のコンストラクタが`DeviceDetector.isMobile()`を呼び出しており、`navigator`/`window`に依存するためSSR時にエラーになるのを避ける目的だったと考えられる。今回、`primeMobilePlayback()`をタップ直後・非同期処理より前に同期的に呼ぶ必要があり、動的importのままだと呼び出し自体が非同期になってしまい目的を果たせない。そのため`DeviceDetector`の各判定メソッドに`typeof window === 'undefined'`等のガードを入れてSSRセーフにし、静的importに切り替えた。

---

## 実装詳細 / Implementation Notes

### 1. DeviceDetectorのSSRガード

```ts
// apps/web/lib/audio-player.ts
class DeviceDetector {
  static isMobile(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
           window.innerWidth < 768
  }
  // isIOS / isAndroid も同様にガード
}
```

理由:

- `export const ttsPlayer = new TTSPlayer()`はモジュール評価時にコンストラクタを実行し、その中で`DeviceDetector.isMobile()`を呼ぶ。静的importに切り替えるとNext.jsのSSR時にもこのモジュールが評価されるため、`navigator`/`window`未定義環境でも安全に`false`を返すようにした。

### 2. タップ直後に無音を再生してユーザー操作を紐付ける

```ts
primeMobilePlayback(): void {
  if (!DeviceDetector.isMobile()) return

  if (!this.mobileAudioEl) {
    this.mobileAudioEl = new Audio()
    if (DeviceDetector.isIOS()) {
      (this.mobileAudioEl as any).playsInline = true
    }
  }

  this.mobileAudioEl.src = SILENT_AUDIO_SRC
  this.mobileAudioEl.play().catch(() => {})
}
```

理由:

- ごく短い無音WAVをタップの瞬間に同期的に再生することで、この`<audio>`要素に「ユーザー操作起点で再生された」実績を持たせる。以後、この同じ要素へ`src`を差し替えて`play()`する分には、たとえ非同期処理を挟んでいてもiOSに許可されやすくなる。

### 3. `mobileAudioPlay`で同じ要素を使い回す

```ts
const audio = this.mobileAudioEl ?? new Audio()
this.mobileAudioEl = audio
// ...
audio.addEventListener('canplaythrough', ..., { once: true })
audio.addEventListener('ended', ..., { once: true })
audio.addEventListener('error', ..., { once: true })
audio.src = audioUrl
audio.load()
```

理由:

- 毎回`new Audio()`していた従来実装だと、`primeMobilePlayback`で得た許可が新しい要素に引き継がれない。同一要素の`src`を無音→実音声に差し替えることで許可を維持する。
- 要素を使い回すためイベントリスナーが積み重なると2回目以降の再生で古いリスナーが誤発火するので、`{ once: true }`を付けて都度自動解除されるようにした。

### 4. 呼び出し側（`page.tsx` / `saved-phrases/page.tsx`）

```ts
// タップハンドラの非同期処理より前（同期的な範囲）で呼ぶ
ttsPlayer.primeMobilePlayback();

try {
  setIsPlaying(...);
  await ttsPlayer.speak(text, playbackSpeed, { ... });
} catch (error) { ... }
```

理由:

- `handleTextToSpeech`はasync関数だが、最初の`await`に到達するまでは呼び出し元のクリック処理と同じ同期的なコールスタックで実行される。`primeMobilePlayback()`をその範囲内（最初の行）に置くことで、確実にユーザー操作の文脈で無音再生を実行できる。

---

## 検証 / Verification

- `pnpm --filter web check-types` / `pnpm --filter web build`: エラーなし（既存の警告のみ）。
- Playwright（Chromium, iPhone 13エミュレーション、Service Worker無効化）で `/api/chat` `/api/tts` をモックし、実際にテキスト送信→AI応答表示→読み上げボタンタップの一連の流れを2回連続で実行。`Prime Mobile Playback → Speak Start → TTS Fetch Success → Mobile Audio Play Start → Audio Can Play Through → Audio Play Success → Audio Ended`の順で例外なく完了し、2回目のタップでもイベントリスナーの二重発火が起きないことを確認した。
- **未検証**: PlaywrightのChromiumは「iPhone」の見た目（UA・画面サイズ）を再現するだけで、実際のWebKit/iOS Safariの自動再生ポリシーそのものは再現していない。したがって、今回の修正が実機のiOS Safariで実際に問題を解消するかどうかは、このサンドボックス環境では確認できていない。実機での再検証が必要。

---

## 影響 / Consequences

- モバイルでのTTS再生開始前に、ごく短い無音（1秒未満）が一瞬再生される。ユーザーに聞こえるほどの音量・長さではないが、`<audio>`要素の状態が一瞬変化する。
- `ttsPlayer`が動的importから静的importに変わったことで、`page.tsx`・`saved-phrases/page.tsx`の初期バンドルサイズがわずかに増加する（ビルドログ上は誤差程度）。
- 実機での検証待ちのため、改善しない場合は追加のログ収集（画面上へのエラー表示など）が必要になる可能性がある。

---

## 参考 / References

- [0032-mobile-audio-playback-fix.md](0032-mobile-audio-playback-fix.md)
- [0049-tts-streaming-playback-experiment.md](0049-tts-streaming-playback-experiment.md)
