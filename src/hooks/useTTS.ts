import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceEngine = 'browser';
export type VoiceOption = { value: string; label: string; female: boolean; engine: VoiceEngine };
const VOICE_STORAGE_KEY = 'vera-voice-choice';
const FEMALE_NAMES = /\b(samantha|zira|hazel|susan|karen|moira|tessa)\b/i;
const NATURAL_FEMALE = /\b(aria|jenny|sonia|libby|natasha)\b/i;
const MALE_NAMES = /\b(david|mark|guy|ryan|daniel|george|alex|fred)\b/i;

function femaleBrowserVoice(voice: SpeechSynthesisVoice) {
  return !MALE_NAMES.test(voice.name)
    && (/female|woman/i.test(voice.name) || NATURAL_FEMALE.test(voice.name) || /google uk english female/i.test(voice.name) || FEMALE_NAMES.test(voice.name));
}

function rankBrowserVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((voice) => /^en[-_]/i.test(voice.lang));
  const females = english.filter(femaleBrowserVoice);
  const preferred = females.find((voice) => NATURAL_FEMALE.test(voice.name) && /natural|online/i.test(voice.name))
    || females.find((voice) => /google uk english female/i.test(voice.name))
    || females.find((voice) => FEMALE_NAMES.test(voice.name))
    || females[0];
  return { voice: preferred || english[0] || voices[0], hasFemale: Boolean(preferred) };
}

const voiceValue = (voice: SpeechSynthesisVoice) => `browser:${voice.name}|${voice.lang}`;

export function useTTS() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceNameState] = useState(() => {
    try {
      const saved = localStorage.getItem(VOICE_STORAGE_KEY);
      return saved?.startsWith('browser:') ? saved : '';
    } catch { return ''; }
  });
  const [actualVoice, setActualVoice] = useState('Browser voice');
  const [lastPlayedLabel, setLastPlayedLabel] = useState('No voice played yet');
  const selectedRef = useRef(selectedVoiceName);
  selectedRef.current = selectedVoiceName;

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const refreshVoices = () => {
      const available = window.speechSynthesis.getVoices().filter((voice) => /^en[-_]/i.test(voice.lang));
      if (!available.length) return;
      setVoices(available);
      const selected = available.find((voice) => voiceValue(voice) === selectedRef.current);
      const chosen = selected || rankBrowserVoice(available).voice;
      if (!chosen) return;
      setActualVoice(`${chosen.name} (${chosen.lang})`);
      if (!selected) {
        const value = voiceValue(chosen);
        selectedRef.current = value;
        setSelectedVoiceNameState(value);
        try { localStorage.setItem(VOICE_STORAGE_KEY, value); } catch { /* storage may be unavailable */ }
      }
    };
    refreshVoices();
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
  }, []);

  const setSelectedVoiceName = useCallback((value: string) => {
    selectedRef.current = value;
    setSelectedVoiceNameState(value);
    try { localStorage.setItem(VOICE_STORAGE_KEY, value); } catch { /* storage may be unavailable */ }
    const selected = voices.find((voice) => voiceValue(voice) === value);
    if (selected) setActualVoice(`${selected.name} (${selected.lang})`);
  }, [voices]);

  const getBrowserVoice = useCallback(() => {
    const available = window.speechSynthesis.getVoices().filter((voice) => /^en[-_]/i.test(voice.lang));
    return available.find((voice) => voiceValue(voice) === selectedRef.current) || rankBrowserVoice(available).voice || null;
  }, []);

  const speakBrowser = useCallback((text: string, voice: SpeechSynthesisVoice | null, onStart: () => void, onEnd: () => void, onError: (error: string) => void, onWord: () => void) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      const voiceName = utterance.voice?.name || voice?.name || 'Browser voice';
      const lang = utterance.voice?.lang || voice?.lang || 'en';
      setActualVoice(`${voiceName} (${lang})`);
      setLastPlayedLabel(`Browser - ${voiceName} (${lang})`);
      onStart();
    };
    utterance.onend = onEnd;
    utterance.onboundary = (event) => { if (event.name === 'word') onWord(); };
    utterance.onerror = (event) => onError(event.error);
    window.speechSynthesis.speak(utterance);
  }, []);

  const cancelPending = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const options: VoiceOption[] = voices.map((voice) => ({
    value: voiceValue(voice),
    label: `${voice.name} (${voice.lang})${femaleBrowserVoice(voice) ? ' · female' : ''}`,
    female: femaleBrowserVoice(voice),
    engine: 'browser',
  }));
  const hasFemaleBrowserVoice = voices.some(femaleBrowserVoice);
  const noFemaleVoice = voices.length > 0 && !hasFemaleBrowserVoice;

  return {
    engine: 'browser' as const,
    actualVoice,
    actualVoiceLabel: lastPlayedLabel,
    selectedVoiceName,
    setSelectedVoiceName,
    options,
    voices,
    hasFemaleBrowserVoice,
    noFemaleVoice,
    loading: false,
    progress: 100,
    fallback: false,
    speakBrowser,
    getBrowserVoice,
    cancelPending,
  };
}
