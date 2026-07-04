import { audioCache } from './utils'

// デバイス検知ユーティリティ
class DeviceDetector {
  static isMobile(): boolean {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
           window.innerWidth < 768
  }
  
  static isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  }
  
  static isAndroid(): boolean {
    return /Android/i.test(navigator.userAgent)
  }
}

// モバイル専用デバッグログ
class MobileAudioLogger {
  static log(stage: string, data: any, isError: boolean = false) {
    const prefix = `[Mobile Audio ${isError ? 'ERROR' : 'DEBUG'}]`
    console.log(`${prefix} ${stage}:`, data)
    
    // モバイルでの確認用（開発時のみ）
    if (DeviceDetector.isMobile() && isError) {
      console.error(`${prefix} ${stage}:`, JSON.stringify(data, null, 2))
    }
  }
}

export interface AudioPlayerOptions {
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
}

// ブラウザがMediaSourceでのプログレッシブ再生（届いた分から再生）に対応しているか判定
function canStreamAudio(): boolean {
  return (
    typeof MediaSource !== 'undefined' &&
    MediaSource.isTypeSupported('audio/mpeg')
  )
}

// SourceBufferへのチャンク追加が完了するまで待つ（updating中に追加するとエラーになるため直列化する）
function appendChunk(sourceBuffer: SourceBuffer, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onUpdateEnd = () => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd)
      sourceBuffer.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd)
      sourceBuffer.removeEventListener('error', onError)
      reject(new Error('SourceBuffer append failed'))
    }
    sourceBuffer.addEventListener('updateend', onUpdateEnd)
    sourceBuffer.addEventListener('error', onError)
    sourceBuffer.appendBuffer(chunk)
  })
}

// SourceBufferが更新中の場合のみ完了を待つ
function waitForUpdateEnd(sourceBuffer: SourceBuffer): Promise<void> {
  if (!sourceBuffer.updating) return Promise.resolve()
  return new Promise((resolve) => {
    sourceBuffer.addEventListener('updateend', () => resolve(), { once: true })
  })
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private isPlaying = false

  constructor() {
    // AudioContextは初回使用時に作成（ユーザー操作後）
  }

  // AudioContextを初期化（初回使用時）
  private async initAudioContext(): Promise<AudioContext> {
    // モバイルでは初期化を試行しない
    if (DeviceDetector.isMobile()) {
      throw new Error('Web Audio API not recommended for mobile devices')
    }

    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        
        MobileAudioLogger.log('AudioContext Created', {
          state: this.audioContext.state,
          sampleRate: this.audioContext.sampleRate
        })
        
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume()
          MobileAudioLogger.log('AudioContext Resumed', {
            newState: this.audioContext.state
          })
        }
      } catch (error) {
        MobileAudioLogger.log('AudioContext Init Failed', error, true)
        throw new Error(`AudioContext initialization failed: ${error}`)
      }
    }
    
    return this.audioContext
  }

  // Blobを AudioBuffer に変換
  private async blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
    const audioContext = await this.initAudioContext()
    const arrayBuffer = await blob.arrayBuffer()
    return audioContext.decodeAudioData(arrayBuffer)
  }

  // 音声を再生（速度指定可能）
  async play(blob: Blob, playbackRate = 1.0, options: AudioPlayerOptions = {}): Promise<void> {
    // モバイルでは使用禁止
    if (DeviceDetector.isMobile()) {
      throw new Error('AudioPlayer.play() should not be used on mobile devices')
    }

    try {
      this.stop()

      const audioContext = await this.initAudioContext()
      const audioBuffer = await this.blobToAudioBuffer(blob)
      
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.playbackRate.value = Math.max(0.25, Math.min(4.0, playbackRate))
      
      source.connect(audioContext.destination)
      
      source.onended = () => {
        this.isPlaying = false
        this.currentSource = null
        options.onEnd?.()
      }

      this.currentSource = source
      this.isPlaying = true
      
      options.onStart?.()
      source.start(0)
      
    } catch (error) {
      this.isPlaying = false
      this.currentSource = null
      const audioError = error instanceof Error ? error : new Error('Audio playback failed')
      MobileAudioLogger.log('AudioPlayer Play Error', audioError, true)
      options.onError?.(audioError)
      throw audioError
    }
  }

  // 再生停止
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch (error) {
        // 既に停止済みの場合のエラーは無視
      }
      this.currentSource = null
    }
    this.isPlaying = false
  }

  // 再生状態を取得
  getIsPlaying(): boolean {
    return this.isPlaying
  }

  // リソースクリーンアップ
  dispose(): void {
    this.stop()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

// 従来のAudio APIを使ったフォールバック再生
async function fallbackPlay(
  blob: Blob, 
  playbackRate: number, 
  options: AudioPlayerOptions
): Promise<void> {
  MobileAudioLogger.log('Fallback Play Start', { 
    blobSize: blob.size, 
    playbackRate,
    isMobile: DeviceDetector.isMobile()
  })

  const audioUrl = URL.createObjectURL(blob)
  const audio = new Audio(audioUrl)
  
  if ('playbackRate' in audio) {
    audio.playbackRate = Math.max(0.25, Math.min(4.0, playbackRate))
  }

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl)
      options.onEnd?.()
      resolve()
    }

    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl)
      const error = new Error('Fallback audio playback failed')
      MobileAudioLogger.log('Fallback Play Error', error, true)
      options.onError?.(error)
      reject(error)
    }

    audio.onloadstart = () => {
      options.onStart?.()
    }

    audio.play().catch(reject)
  })
}

// TTS APIから音声を取得してキャッシュ付きで再生
export class TTSPlayer {
  private audioPlayer = new AudioPlayer()
  private isLoading = false
  private useWebAudio = true
  private currentStreamAudio: HTMLAudioElement | null = null

  // デバイス別再生戦略の決定
  constructor() {
    if (DeviceDetector.isMobile()) {
      this.useWebAudio = false
      MobileAudioLogger.log('Constructor', 'Mobile detected - Audio API will be used')
    }
  }

  // TTS APIから音声を取得（キャッシュ優先、速度別対応）
  private async fetchTTS(text: string, speed: number = 1.0): Promise<Blob> {
    // 速度別キャッシュチェック
    const cachedBlob = audioCache.get(text, speed)
    if (cachedBlob) {
      return cachedBlob
    }

    // API呼び出し（常に指定速度で生成）
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speed }),
    })

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status}`)
    }

    const blob = await response.blob()
    
    // 速度別キャッシュに保存
    try {
      audioCache.set(text, speed, blob)
    } catch (cacheError) {
      console.warn('Failed to cache audio:', cacheError)
      // キャッシュエラーは無視して続行
    }
    
    return blob
  }

  // テキストを音声で再生（速度別最適化、キャッシュ対応、フォールバック付き）
  async speak(
    text: string, 
    playbackRate = 1.0, 
    options: AudioPlayerOptions = {}
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error('TTS request already in progress')
    }

    try {
      this.isLoading = true
      MobileAudioLogger.log('Speak Start', {
        text: text.slice(0, 50),
        playbackRate,
        isMobile: DeviceDetector.isMobile(),
        useWebAudio: this.useWebAudio
      })

      // モバイル用とデスクトップ用で完全に分岐
      if (DeviceDetector.isMobile()) {
        const audioBlob = await this.fetchTTS(text, playbackRate)
        MobileAudioLogger.log('TTS Fetch Success', {
          blobSize: audioBlob.size,
          blobType: audioBlob.type
        })
        await this.mobileAudioPlay(audioBlob, options)
        return
      }

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

    } catch (error) {
      MobileAudioLogger.log('Speak Error', error, true)
      const ttsError = error instanceof Error ? error : new Error('TTS failed')
      options.onError?.(ttsError)
      throw ttsError
    } finally {
      this.isLoading = false
    }
  }

  // モバイル専用の音声再生
  private async mobileAudioPlay(blob: Blob, options: AudioPlayerOptions): Promise<void> {
    MobileAudioLogger.log('Mobile Audio Play Start', { blobSize: blob.size })
    
    return new Promise((resolve, reject) => {
      const audioUrl = URL.createObjectURL(blob)
      const audio = new Audio(audioUrl)
      
      // モバイル最適化設定
      audio.preload = 'auto'
      audio.volume = 1.0
      
      // iOSでの追加設定
      if (DeviceDetector.isIOS()) {
        (audio as any).playsInline = true
      }

      audio.addEventListener('canplaythrough', () => {
        MobileAudioLogger.log('Audio Can Play Through', 'Ready to play')
        options.onStart?.()
        
        audio.play()
          .then(() => {
            MobileAudioLogger.log('Audio Play Success', 'Playing started')
          })
          .catch((playError) => {
            MobileAudioLogger.log('Audio Play Error', playError, true)
            this.handleMobileAudioError(audioUrl, playError, options, reject)
          })
      })

      audio.addEventListener('ended', () => {
        MobileAudioLogger.log('Audio Ended', 'Playback completed')
        URL.revokeObjectURL(audioUrl)
        options.onEnd?.()
        resolve()
      })

      audio.addEventListener('error', (errorEvent) => {
        MobileAudioLogger.log('Audio Error Event', errorEvent, true)
        this.handleMobileAudioError(audioUrl, new Error('Audio element error'), options, reject)
      })

      // 読み込み開始
      audio.load()
    })
  }

  // デスクトップ用：MediaSourceで届いたチャンクから順に再生する（試験実装）
  private async desktopStreamPlay(
    text: string,
    speed: number,
    options: AudioPlayerOptions
  ): Promise<void> {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speed }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`TTS API error: ${response.status}`)
    }

    const mimeType = 'audio/mpeg'
    const mediaSource = new MediaSource()
    const audio = new Audio()
    const objectUrl = URL.createObjectURL(mediaSource)
    audio.src = objectUrl
    this.currentStreamAudio = audio

    // 再生と並行してチャンクを蓄積し、完了後にキャッシュ用の1本のBlobを組み立てる
    const chunks: Uint8Array[] = []

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const settleOnce = (fn: () => void) => {
          if (settled) return
          settled = true
          fn()
        }

        audio.addEventListener('playing', () => options.onStart?.(), { once: true })
        audio.addEventListener('ended', () => settleOnce(() => {
          options.onEnd?.()
          resolve()
        }))
        audio.addEventListener('error', () => settleOnce(() => {
          reject(new Error('Streaming audio playback failed'))
        }))

        mediaSource.addEventListener('sourceopen', () => {
          const sourceBuffer = mediaSource.addSourceBuffer(mimeType)
          const reader = response.body!.getReader()
          let playbackStarted = false

          const pump = (): Promise<void> =>
            reader.read().then(async ({ done, value }) => {
              if (done) {
                await waitForUpdateEnd(sourceBuffer)
                if (mediaSource.readyState === 'open') {
                  mediaSource.endOfStream()
                }
                return
              }

              chunks.push(value)
              await appendChunk(sourceBuffer, value)

              // 最初のチャンクがバッファに積まれた時点で再生を開始する
              if (!playbackStarted) {
                playbackStarted = true
                audio.play().catch((playError) => settleOnce(() => reject(playError)))
              }

              return pump()
            })

          pump().catch((err) => settleOnce(() => {
            reject(err instanceof Error ? err : new Error('Streaming setup failed'))
          }))
        }, { once: true })
      })
    } finally {
      URL.revokeObjectURL(objectUrl)
      this.currentStreamAudio = null
    }

    const fullBlob = new Blob(chunks, { type: mimeType })
    try {
      audioCache.set(text, speed, fullBlob)
    } catch (cacheError) {
      console.warn('Failed to cache streamed audio:', cacheError)
    }
  }

  // デスクトップ用の音声再生（既存ロジック改善）
  private async desktopAudioPlay(blob: Blob, options: AudioPlayerOptions): Promise<void> {
    if (this.useWebAudio) {
      try {
        await this.audioPlayer.play(blob, 1.0, options)
      } catch (webAudioError) {
        MobileAudioLogger.log('Web Audio Failed, Fallback to Audio API', webAudioError, true)
        this.useWebAudio = false
        await fallbackPlay(blob, 1.0, options)
      }
    } else {
      await fallbackPlay(blob, 1.0, options)
    }
  }

  // モバイル音声エラーの包括的処理
  private handleMobileAudioError(
    audioUrl: string, 
    error: Error, 
    options: AudioPlayerOptions, 
    reject: (error: Error) => void
  ): void {
    URL.revokeObjectURL(audioUrl)
    
    const detailedError = new Error(`Mobile audio failed: ${error.message}`)
    MobileAudioLogger.log('Mobile Audio Error Handler', {
      originalError: error.message,
      userAgent: navigator.userAgent,
      audioSupport: !!window.Audio
    }, true)
    
    options.onError?.(detailedError)
    reject(detailedError)
  }

  // 再生停止
  stop(): void {
    if (!DeviceDetector.isMobile()) {
      this.audioPlayer.stop()
      if (this.currentStreamAudio) {
        this.currentStreamAudio.pause()
        this.currentStreamAudio = null
      }
    }
    // モバイルでは現在の実装では停止機能なし
  }

  // 再生状態を取得
  getIsPlaying(): boolean {
    if (DeviceDetector.isMobile()) {
      // モバイルではローディング状態を返す
      return this.isLoading
    }
    return this.audioPlayer.getIsPlaying()
  }

  // ローディング状態を取得
  getIsLoading(): boolean {
    return this.isLoading
  }

  // リソースクリーンアップ
  dispose(): void {
    this.audioPlayer.dispose()
  }
}

// グローバルインスタンス（シングルトン）
export const ttsPlayer = new TTSPlayer()