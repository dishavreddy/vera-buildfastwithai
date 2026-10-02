import { useCallback, useEffect, useRef, useState } from 'react';

export const KOKORO_VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah'] as const;
export type KokoroVoice = typeof KOKORO_VOICES[number];
export type VoiceEngine = 'kokoro' | 'browser';
export type VoiceOption = { value: string; label: string; female: boolean; engine: VoiceEngine };
const VOICE_STORAGE_KEY = 'vera-voice-choice';
const FEMALE_NAMES = /\b(samantha|zira|hazel|susan|karen|moira|tessa)\b/i;
const NATURAL_FEMALE = /\b(aria|jenny|sonia|libby|natasha)\b/i;
const MALE_NAMES = /\b(david|mark|guy|ryan|daniel|george|alex|fred)\b/i;

function maleSuggested(voice: SpeechSynthesisVoice) {
  return MALE_NAMES.test(voice.name)
    || (/google us english/i.test(voice.name) && !/female|woman/i.test(voice.name))
    || (/male/i.test(voice.name) && !/female/i.test(voice.name));
}
function femaleBrowserVoice(voice: SpeechSynthesisVoice) {
  return !maleSuggested(voice)
    && (/female|woman/i.test(voice.name) || NATURAL_FEMALE.test(voice.name) || /google uk english female/i.test(voice.name) || FEMALE_NAMES.test(voice.name));
}
function rankBrowserVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((voice) => /^en[-_]/i.test(voice.lang));
  const females = english.filter(femaleBrowserVoice);
  const female = females.find((voice) => NATURAL_FEMALE.test(voice.name) && /natural|online/i.test(voice.name))
    || females.find((voice) => /google uk english female/i.test(voice.name))
    || females.find((voice) => FEMALE_NAMES.test(voice.name))
    || females.find((voice) => /female|woman/i.test(voice.name));
  return { voice: female || english.find((voice) => !maleSuggested(voice)) || voices.find((voice) => !maleSuggested(voice)) || english[0] || voices[0], hasFemale: Boolean(female) };
}

export function useTTS() {
  const [selectedVoiceName, setSelectedVoiceNameState] = useState(() => {
    try {
      const saved = localStorage.getItem(VOICE_STORAGE_KEY);
      return saved && (saved.startsWith('kokoro:') || saved.startsWith('browser:')) ? saved : 'kokoro:af_heart';
    } catch { return 'kokoro:af_heart'; }
  });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [engine, setEngine] = useState<VoiceEngine>('kokoro');
  const [actualVoice, setActualVoice] = useState('af_heart');
  const [lastPlayedLabel, setLastPlayedLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [fallbackReason, setFallbackReason] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const pendingRef = useRef(new Map<number, { resolve: (value: Blob | void) => void; reject: (error: Error) => void }>());
  const warmPromiseRef = useRef<Promise<void> | null>(null);
  const browserReadyRef = useRef(false);
  const selectedRef = useRef(selectedVoiceName);
  selectedRef.current = selectedVoiceName;

  const setSelectedVoiceName = useCallback((value: string) => {
    setSelectedVoiceNameState(value);
    try { localStorage.setItem(VOICE_STORAGE_KEY, value); } catch { /* storage unavailable */ }
    if (value.startsWith('kokoro:')) { if (!workerRef.current) warmPromiseRef.current = null; setEngine('kokoro'); setActualVoice(value.slice(7)); setFallback(false); }
    else {
      const voice = voices.find((item) => `browser:${item.name}|${item.lang}` === value);
      if (voice) { setEngine('browser'); setActualVoice(`${voice.name} (${voice.lang})`); setFallback(false); }
    }
  }, [voices]);

  const chooseBrowserVoice = useCallback(() => {
    if (!browserReadyRef.current || !('speechSynthesis' in window)) return null;
    const list = window.speechSynthesis.getVoices();
    setVoices(list.filter((voice) => /^en[-_]/i.test(voice.lang)));
    const english = list.filter((voice) => /^en[-_]/i.test(voice.lang));
    const selected = selectedRef.current.startsWith('browser:')
      ? english.find((voice) => `browser:${voice.name}|${voice.lang}` === selectedRef.current && femaleBrowserVoice(voice))
      : undefined;
    const ranked = rankBrowserVoice(list);
    const chosen = selected || ranked.voice;
    if (chosen) {
      setEngine('browser'); setActualVoice(`${chosen.name} (${chosen.lang})`);
      setFallback(!selectedRef.current.startsWith('browser:'));
      return { voice: chosen, hasFemale: selected ? femaleBrowserVoice(selected) : ranked.hasFemale };
    }
    return null;
  }, []);
  const waitForBrowserVoice = useCallback(() => new Promise<SpeechSynthesisVoice | null>((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(null); return; }
    const finish = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list.length) return false;
      browserReadyRef.current = true;
      setVoices(list.filter((voice) => /^en[-_]/i.test(voice.lang)));
      const selected = selectedRef.current.startsWith('browser:')
        ? list.find((voice) => `browser:${voice.name}|${voice.lang}` === selectedRef.current && femaleBrowserVoice(voice))
        : undefined;
      resolve(selected || rankBrowserVoice(list).voice || null);
      return true;
    };
    if (finish()) return;
    const onChanged = () => { if (finish()) { window.speechSynthesis.removeEventListener('voiceschanged', onChanged); window.clearTimeout(timeout); } };
    const timeout = window.setTimeout(() => { window.speechSynthesis.removeEventListener('voiceschanged', onChanged); resolve(null); }, 5000);
    window.speechSynthesis.addEventListener('voiceschanged', onChanged);
  }), []);

  const requestWorker = useCallback((type: 'load' | 'synthesize', text = '', voice: KokoroVoice = 'af_heart') => new Promise<Blob | void>((resolve, reject) => {
    const worker = workerRef.current;
    if (!worker) { reject(new Error('Kokoro worker is unavailable')); return; }
    const id = ++idRef.current; pendingRef.current.set(id, { resolve, reject });
    worker.postMessage({ id, type, text, voice });
  }), []);
  const cancelPending = useCallback((terminateWorker = false) => {
    for (const [id, pending] of pendingRef.current) {
      workerRef.current?.postMessage({ id, type: 'cancel' });
      pending.reject(new DOMException('TTS job cancelled', 'AbortError'));
    }
    pendingRef.current.clear();
    if (terminateWorker && workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      warmPromiseRef.current = null;
      setLoading(true);
    }
  }, []);

  const warmup = useCallback(() => {
    if (warmPromiseRef.current) return warmPromiseRef.current;
    if (selectedRef.current.startsWith('browser:')) {
      warmPromiseRef.current = waitForBrowserVoice().then((voice) => {
        if (!voice) throw new Error('No browser speech voice is available');
        setEngine('browser'); setActualVoice(`${voice.name} (${voice.lang})`); setLoading(false);
      });
      return warmPromiseRef.current;
    }
    warmPromiseRef.current = new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL('../workers/kokoro.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent) => {
        if (event.data.type === 'progress') {
          const value = event.data.progress?.progress;
          if (typeof value === 'number') setProgress((old) => Math.max(old, Math.round(value * 0.9)));
          else setProgress((old) => Math.max(old, 4));
          return;
        }
        const pending = pendingRef.current.get(event.data.id);
        if (!pending) return;
        pendingRef.current.delete(event.data.id);
        if (event.data.type === 'error') pending.reject(new Error(event.data.error));
        else pending.resolve(event.data.blob);
      };
      worker.onerror = (event) => {
        const error = new Error(event.message || 'Kokoro worker failed');
        pendingRef.current.forEach((pending) => pending.reject(error));
        pendingRef.current.clear();
      };
      void requestWorker('load').then(async () => {
        setProgress(96);
        const start = performance.now();
        await requestWorker('synthesize', 'Hello, it is lovely to meet you.', 'af_heart');
        const duration = performance.now() - start;
        if (duration > 2500) throw new Error(`Kokoro voice test took ${Math.round(duration)}ms`);
        setEngine('kokoro'); setActualVoice(selectedRef.current.startsWith('kokoro:') ? selectedRef.current.slice(7) : 'af_heart');
        setFallback(false); setProgress(100); setLoading(false);
        console.info('[Vera] voice engine selected:', { engine: 'Kokoro', voice: selectedRef.current.slice(7) || 'af_heart', lang: 'en-US', testMs: Math.round(duration) });
        console.info('[Vera timing] TTS model loaded and warmed', { at: performance.now(), testSynthesisMs: Math.round(duration) });
        resolve();
      }).catch((error) => {
        worker.terminate(); workerRef.current = null; warmPromiseRef.current = null;
        void waitForBrowserVoice().then((voice) => {
          if (!voice) { setLoading(false); reject(error); return; }
          const reason = error instanceof Error ? error.message : String(error);
          setEngine('browser'); setActualVoice(`${voice.name} (${voice.lang})`); setFallback(true); setFallbackReason(reason); setLoading(false);
          console.warn('[Vera] Kokoro unavailable; selected browser voice:', { reason, voice: voice.name, lang: voice.lang });
          resolve();
        });
      });
    });
    return warmPromiseRef.current;
  }, [chooseBrowserVoice, requestWorker, waitForBrowserVoice]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list.length) return;
      browserReadyRef.current = true;
      setVoices(list.filter((voice) => /^en[-_]/i.test(voice.lang)));
      if (engine === 'browser') chooseBrowserVoice();
    };
    window.speechSynthesis.addEventListener('voiceschanged', update);
    update();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, [chooseBrowserVoice, engine]);

  useEffect(() => {
    const schedule = () => void warmup();
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(schedule, { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(schedule, 1500);
    return () => window.clearTimeout(handle);
  }, [warmup]);

  useEffect(() => () => { workerRef.current?.terminate(); pendingRef.current.forEach((pending) => pending.reject(new Error('TTS worker disposed'))); }, []);

  const synthesize = useCallback(async (text: string): Promise<Blob> => {
    await warmup();
    if (engine === 'kokoro' && workerRef.current) {
      const voice = selectedRef.current.startsWith('kokoro:') ? selectedRef.current.slice(7) as KokoroVoice : 'af_heart';
      const result = await requestWorker('synthesize', text, voice);
      if (result instanceof Blob) return result;
      throw new Error('Kokoro returned no audio');
    }
    throw new Error('Browser voices use speech synthesis directly');
  }, [engine, requestWorker, warmup]);

  const speakBrowser = useCallback((text: string, voice: SpeechSynthesisVoice | null, onStart: () => void, onEnd: () => void, onError: (error: string) => void, onWord: () => void) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98; utterance.pitch = 1; utterance.volume = 1;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      const voiceName = utterance.voice?.name || voice?.name || 'Browser voice';
      const lang = utterance.voice?.lang || voice?.lang || 'en';
      setLastPlayedLabel(`Browser - ${voiceName} (${lang})`);
      onStart();
    };
    utterance.onend = onEnd;
    utterance.onboundary = (event) => { if (event.name === 'word') onWord(); };
    utterance.onerror = (event) => onError(event.error);
    window.speechSynthesis.speak(utterance);
  }, []);

  const getBrowserVoice = useCallback(() => chooseBrowserVoice()?.voice || null, [chooseBrowserVoice]);
  const markKokoroPlayed = useCallback((voice: string, lang = 'en-US') => setLastPlayedLabel(`Kokoro - ${voice} (${lang})`), []);
  const useBrowserFallback = useCallback(async (reason: string) => {
    const voice = await waitForBrowserVoice();
    setEngine('browser'); setActualVoice(`${voice?.name || 'Browser voice'} (${voice?.lang || 'en'})`);
    setFallback(true); setFallbackReason(reason);
    console.warn('[Vera] using browser voice fallback:', { reason, voice: voice?.name, lang: voice?.lang });
    return voice || null;
  }, [waitForBrowserVoice]);
  const options: VoiceOption[] = [
    ...KOKORO_VOICES.map((voice) => ({ value: `kokoro:${voice}`, label: `Kokoro · ${voice}`, female: true, engine: 'kokoro' as const })),
    ...voices.map((voice) => ({ value: `browser:${voice.name}|${voice.lang}`, label: `${voice.name} (${voice.lang})${femaleBrowserVoice(voice) ? ' · female' : ''}`, female: femaleBrowserVoice(voice), engine: 'browser' as const })),
  ];
  const hasFemaleBrowserVoice = voices.some(femaleBrowserVoice);
  const noFemaleVoice = engine === 'browser' && voices.length > 0 && !hasFemaleBrowserVoice;
  const actualVoiceLabel = lastPlayedLabel || 'No voice played yet';

  return { engine, actualVoice, actualVoiceLabel, selectedVoiceName, setSelectedVoiceName, options, voices, hasFemaleBrowserVoice, noFemaleVoice, loading, progress, fallback, fallbackReason, synthesize, speakBrowser, getBrowserVoice, useBrowserFallback, markKokoroPlayed, cancelPending, warmup };
}
