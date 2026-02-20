export type VoiceProviderKind = 'browser' | 'backend';

export interface SttStartOptions {
  lang?: string;
  onStart?: () => void;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onStop?: (durationSec: number) => void;
  onError?: (message: string) => void;
}

export interface SttProvider {
  readonly kind: VoiceProviderKind;
  isSupported(): boolean;
  start(options: SttStartOptions): void;
  stop(): void;
  abort(): void;
}

export interface TtsSpeakOptions {
  lang?: string;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export interface TtsProvider {
  readonly kind: VoiceProviderKind;
  isSupported(): boolean;
  speak(text: string, options?: TtsSpeakOptions): void;
  stop(): void;
}

// TODO: Add backend providers (OpenAI Whisper / OpenAI TTS proxy) and switch
// via env/config without changing UI components.
