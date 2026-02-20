import { createBrowserSttProvider, createBrowserTtsProvider } from './providers/browser';
import type { SttProvider, TtsProvider } from './types';

export function createDefaultSttProvider(): SttProvider {
  // TODO: switch to backend STT provider by env when backend Whisper is ready.
  return createBrowserSttProvider();
}

export function createDefaultTtsProvider(): TtsProvider {
  // TODO: switch to backend TTS provider by env when backend TTS is ready.
  return createBrowserTtsProvider();
}

export type { SttProvider, TtsProvider, SttStartOptions, TtsSpeakOptions } from './types';
