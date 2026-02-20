import type {
  SttProvider,
  SttStartOptions,
  TtsProvider,
  TtsSpeakOptions,
} from '../types';

interface SpeechRecognitionAlt {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlt;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getSpeechRecognitionCtor() {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function createBrowserSttProvider(): SttProvider {
  let recognition: SpeechRecognitionLike | null = null;
  let startedAt: number | null = null;
  let finalTranscript = '';

  return {
    kind: 'browser',
    isSupported() {
      if (typeof window === 'undefined') return false;
      return Boolean(getSpeechRecognitionCtor());
    },
    start(options: SttStartOptions) {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        options.onError?.('이 브라우저는 음성 인식(Web Speech API)을 지원하지 않습니다.');
        return;
      }

      finalTranscript = '';
      recognition = new Ctor();
      recognition.lang = options.lang ?? 'ko-KR';
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onstart = () => {
        startedAt = Date.now();
        options.onStart?.();
      };

      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const chunk = result[0]?.transcript ?? '';
          if (result.isFinal) finalText += chunk;
          else interimText += chunk;
        }

        if (finalText) {
          finalTranscript = `${finalTranscript} ${finalText}`.trim();
          options.onFinalTranscript?.(finalTranscript);
        } else if (interimText) {
          options.onPartialTranscript?.(interimText.trim());
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          options.onError?.('마이크 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.');
        } else if (event.error === 'no-speech') {
          options.onError?.('음성이 감지되지 않았습니다. 다시 시도해 주세요.');
        } else {
          options.onError?.('음성 인식 중 오류가 발생했습니다. 다시 시도해 주세요.');
        }
      };

      recognition.onend = () => {
        const durationSec = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
        options.onStop?.(durationSec);
        startedAt = null;
        recognition = null;
      };

      try {
        recognition.start();
      } catch {
        options.onError?.('음성 인식을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      }
    },
    stop() {
      recognition?.stop();
    },
    abort() {
      recognition?.abort();
      recognition = null;
      startedAt = null;
    },
  };
}

export function createBrowserTtsProvider(): TtsProvider {
  return {
    kind: 'browser',
    isSupported() {
      return typeof window !== 'undefined' && 'speechSynthesis' in window;
    },
    speak(text: string, options?: TtsSpeakOptions) {
      if (!this.isSupported()) {
        options?.onError?.('이 브라우저는 음성 합성을 지원하지 않습니다.');
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = options?.lang ?? 'ko-KR';
        utter.onend = () => options?.onEnd?.();
        utter.onerror = () => options?.onError?.('음성 재생 중 오류가 발생했습니다.');
        window.speechSynthesis.speak(utter);
      } catch {
        options?.onError?.('음성 재생을 시작할 수 없습니다.');
      }
    },
    stop() {
      if (!this.isSupported()) return;
      window.speechSynthesis.cancel();
    },
  };
}
