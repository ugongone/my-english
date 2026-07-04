# 0049 – 音声読み上げの「届いた分から再生」試験実装（デスクトップ限定）

## 背景 / Context

- 現状のTTS再生（`lib/audio-player.ts`）は、`/api/tts`のレスポンスを`await response.blob()`で**全部ダウンロードし終わってから**再生を開始していた。サーバー側（`app/api/tts/route.ts`）はOpenAIからのレスポンスをストリーミングでそのまま返しているにもかかわらず、クライアント側で全待ちしていたため、読み上げボタンを押してから再生開始までの体感速度が悪化していた。
- モデル自体（`gpt-4o-mini-tts`）はOpenAIの中でも高速な部類であり、モデル変更より「クライアントが全部待ってから再生する」実装の方が改善余地が大きいと判断した。
- 一方で、このリポジトリには過去にiOS Safariでの音声再生バグを修正したADRが複数あり（例: `0032-mobile-audio-playback-fix`）、モバイルは既に「Web Audio APIを避けて`<audio>`要素にフォールバックする」専用実装になっている。ストリーミング再生に使う`MediaSource`はiOS Safariでの対応が不安定なため、モバイル側に手を入れるのはリスクが高いと判断し、まずデスクトップのみで試すこととした。
- ユーザーから「一回試しに実装してみてから考える」という方針の合意を得たため、影響範囲をデスクトップに限定した実験的な実装として着手した。

---

## 決定 / Decision

デスクトップ（`DeviceDetector.isMobile()`が`false`のとき）に限り、`MediaSource`を使って`/api/tts`のレスポンスを届いたチャンクから順に再生する`desktopStreamPlay`を追加する。`MediaSource`非対応ブラウザ、またはストリーミング中に何らかのエラーが起きた場合は、既存の「全部待ってから再生」処理に自動フォールバックする。モバイルの再生ロジックは一切変更しない。

---

## 理由 / Rationale

- モデルやAPIエンドポイントを変えずに、クライアント側の待ち方だけを変えることで、体感速度改善とリスクを両立できる。
- 既存のキャッシュ機構（速度別音声キャッシュ）と両立させるため、ストリーミング再生中も受信したチャンクを蓄積しておき、再生完了後に1本の`Blob`として組み立てて`audioCache`に保存する。2回目以降の再生は従来通りキャッシュヒットで即再生される。
- ストリーミングに失敗しても例外を握りつぶして旧来の再生方式にフォールバックするため、最悪でも「これまで通りの体験」に留まり、機能が完全に壊れることはない。

---

## 実装詳細 / Implementation Notes

### 1. MediaSource対応判定とSourceBufferユーティリティ

```ts
// apps/web/lib/audio-player.ts
function canStreamAudio(): boolean {
  return (
    typeof MediaSource !== 'undefined' &&
    MediaSource.isTypeSupported('audio/mpeg')
  )
}

function appendChunk(sourceBuffer: SourceBuffer, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onUpdateEnd = () => { /* ... */ resolve() }
    const onError = () => { /* ... */ reject(new Error('SourceBuffer append failed')) }
    sourceBuffer.addEventListener('updateend', onUpdateEnd)
    sourceBuffer.addEventListener('error', onError)
    sourceBuffer.appendBuffer(chunk)
  })
}
```

理由:

- `SourceBuffer.appendBuffer()`は呼び出し中（`updating === true`）に再度呼ぶと例外になるため、1チャンクごとに`updateend`を待ってから次のチャンクを追加する直列処理にした。
- 非対応ブラウザでは`canStreamAudio()`が`false`を返し、ストリーミング処理自体を試みずに従来経路へ進む。

### 2. `TTSPlayer.speak()`の分岐変更

```ts
// キャッシュ済みならこれまで通り即再生
const cachedBlob = audioCache.get(text, playbackRate)
if (cachedBlob) {
  await this.desktopAudioPlay(cachedBlob, options)
  return
}

// 未キャッシュの場合は「届いた分から再生」を試し、非対応/失敗時のみ従来の全部待ち方式にフォールバック
if (canStreamAudio()) {
  try {
    await this.desktopStreamPlay(text, playbackRate, options)
    return
  } catch (streamError) {
    MobileAudioLogger.log('Stream Play Failed, Fallback to Buffered Play', streamError, true)
  }
}

const audioBlob = await this.fetchTTS(text, playbackRate)
await this.desktopAudioPlay(audioBlob, options)
```

理由:

- モバイル分岐はこれまで通り`fetchTTS`→`mobileAudioPlay`のみを通るようにし、変更の影響範囲をデスクトップに閉じ込めた。
- キャッシュヒット時はストリーミングを試みる必要がないため、従来通り`desktopAudioPlay`に直行させ、無駄な分岐を避けた。

### 3. `desktopStreamPlay`：最初のチャンクで再生開始

```ts
const pump = (): Promise<void> =>
  reader.read().then(async ({ done, value }) => {
    if (done) {
      await waitForUpdateEnd(sourceBuffer)
      if (mediaSource.readyState === 'open') mediaSource.endOfStream()
      return
    }
    chunks.push(value)
    await appendChunk(sourceBuffer, value)
    if (!playbackStarted) {
      playbackStarted = true
      audio.play().catch((playError) => settleOnce(() => reject(playError)))
    }
    return pump()
  })
```

理由:

- 全チャンクを待たず、最初のチャンクがSourceBufferに積まれた時点で`audio.play()`を呼ぶことで「届いた分から再生」を実現している。
- 受信済みチャンクは`chunks`配列に蓄積し、ストリーム完了後にキャッシュ用の`Blob`を組み立てる（`Promise`本体には含めず、`desktopStreamPlay`の最後でまとめて`audioCache.set`する）。

### 4. `stop()`にストリーミング再生の停止を追加

```ts
stop(): void {
  if (!DeviceDetector.isMobile()) {
    this.audioPlayer.stop()
    if (this.currentStreamAudio) {
      this.currentStreamAudio.pause()
      this.currentStreamAudio = null
    }
  }
}
```

理由:

- ストリーミング再生中の`<audio>`要素は`AudioPlayer`（Web Audio API側）とは別物のため、`currentStreamAudio`として個別に保持し、`stop()`から止められるようにした。

---

## 検証 / Verification

- `pnpm --filter web check-types`: 型エラーなし。
- `pnpm --filter web build`: ビルド成功（既存の警告のみ、新規警告・エラーなし）。
- Playwright（Chromium）で実アプリを読み込み、`MediaSource.isTypeSupported('audio/mpeg')`が`true`であること、およびページ読み込み時にコンソールエラーが出ないことを確認済み。
- **未検証**: このサンドボックス環境には`OPENAI_API_KEY`が無く、実際の音声チャンクを使った「届いた分から再生される」体感速度・iOS/Safari以外の実ブラウザでの動作は確認できていない。本番環境またはAPIキーのあるローカル環境での実地確認が必要。

---

## 影響 / Consequences

- デスクトップでのTTS再生開始までの体感速度が改善する見込み（ネットワークが不安定な場合は再生開始後に一時停止が起きる可能性があるため、要観察）。
- モバイル（iOS/Android）の挙動は変更していないため、既存のモバイル音声バグ対応（ADR 0032など）への影響はない。
- ストリーミング再生に失敗した場合は自動的に旧方式へフォールバックするため、機能が完全に使えなくなることはないが、フォールバック発生時は「一度失敗してから通常再生」という分だけ従来よりわずかに遅くなる。
- 効果測定の結果次第で、モバイル対応や文単位分割によるさらなる高速化を別途検討する。

---

## 参考 / References

- [0032-mobile-audio-playback-fix.md](0032-mobile-audio-playback-fix.md)
- [0026-audio-cache-system.md](0026-audio-cache-system.md)
- [0027-speed-specific-audio-cache.md](0027-speed-specific-audio-cache.md)
