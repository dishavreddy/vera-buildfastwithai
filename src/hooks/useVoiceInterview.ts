import { useCallback, useEffect, useRef, useState } from 'react';

export type InterviewState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface TranscriptEntry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

interface UseVoiceInterviewOptions {
  messagesRef: React.MutableRefObject<{ role: string; content: string }[]>;
}

export function useVoiceInterview({ messagesRef }: UseVoiceInterviewOptions) {
  const [state, setState] = useState<InterviewState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isSpeakingRef = useRef(false);
  const userSpeechRef = useRef('');
  const shouldRestartRef = useRef(false);
  const entryIdRef = useRef(0);
  const stateRef = useRef<InterviewState>('idle');
  const abortRef = useRef(false);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateState = useCallback((s: InterviewState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const addTranscript = useCallback((role: 'user' | 'assistant', text: string) => {
    setTranscript((prev) => [...prev, { id: ++entryIdRef.current, role, text }]);
  }, []);

  const stopSpeaking = useCallback(() => {
    isSpeakingRef.current = false;
    window.speechSynthesis.cancel();
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Speech Recognition is not supported in this browser. Please use Chrome on desktop.');
      setIsSupported(false);
      return;
    }

    // Abort any previous instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    userSpeechRef.current = '';

    recognition.onstart = () => {
      updateState('listening');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      // Interruption: if user speaks while AI is talking, cancel speech immediately
      if (isSpeakingRef.current && (interim.length > 0 || final.length > 0)) {
        stopSpeaking();
      }

      if (final) {
        userSpeechRef.current = final.trim();
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return; // benign — restart will handle
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed') {
        setError('Microphone access was denied. Please allow mic access and try again.');
        updateState('idle');
        shouldRestartRef.current = false;
        return;
      }
      console.error('[Vera] SpeechRecognition error:', event.error);
    };

    recognition.onend = () => {
      // If we were listening and have collected speech, process it
      if (abortRef.current) {
        abortRef.current = false;
        shouldRestartRef.current = false;
        return;
      }

      if (userSpeechRef.current) {
        processUserInput(userSpeechRef.current);
        userSpeechRef.current = '';
        return;
      }

      // Auto-restart for continuous listening (unless we're in thinking/speaking/idle)
      if (shouldRestartRef.current && stateRef.current === 'listening') {
        try {
          recognition.start();
        } catch {
          // Will retry on next cycle
        }
      }
    };

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;

    try {
      recognition.start();
    } catch (err) {
      console.error('[Vera] Failed to start recognition:', err);
    }
  }, [stopSpeaking, updateState]); // eslint-disable-line react-hooks/exhaustive-deps

  const processUserInput = useCallback(
    async (text: string) => {
      if (!text) return;

      addTranscript('user', text);
      messagesRef.current.push({ role: 'user', content: text });

      updateState('thinking');

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesRef.current }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server error ${response.status}`);
        }

        const data = await response.json();
        const reply = data.reply || "I'm sorry, could you repeat that?";

        addTranscript('assistant', reply);
        messagesRef.current.push({ role: 'assistant', content: reply });

        speakReply(reply);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to get AI response: ${msg}`);
        updateState('idle');
      }
    },
    [addTranscript, messagesRef, updateState], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const speakReply = useCallback(
    (text: string) => {
      if (!('speechSynthesis' in window)) {
        setError('Speech Synthesis is not supported in this browser.');
        updateState('idle');
        return;
      }

      // Cancel any ongoing speech first
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to pick a natural-sounding English voice
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => v.name.includes('Google US English')) ||
        voices.find((v) => v.lang === 'en-US' && v.name.includes('Female')) ||
        voices.find((v) => v.lang === 'en-US') ||
        voices.find((v) => v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        isSpeakingRef.current = true;
        updateState('speaking');
      };

      utterance.onend = () => {
        isSpeakingRef.current = false;
        if (abortRef.current) return; // interrupted by user — don't auto-resume
        // Go back to listening after AI finishes
        startListening();
      };

      utterance.onerror = () => {
        isSpeakingRef.current = false;
        if (abortRef.current) {
          abortRef.current = false;
          return;
        }
        updateState('idle');
      };

      window.speechSynthesis.speak(utterance);
    },
    [startListening, updateState],
  );

  const start = useCallback(() => {
    setError(null);
    setTranscript([]);

    // Initial greeting from Vera
    const greeting = "Hi, I'm Vera. Thanks for joining today. To get started, could you tell me a bit about yourself and what role you're interviewing for?";
    addTranscript('assistant', greeting);
    messagesRef.current = [{ role: 'assistant', content: greeting }];
    speakReply(greeting);
  }, [addTranscript, messagesRef, speakReply]);

  const stop = useCallback(() => {
    abortRef.current = true;
    shouldRestartRef.current = false;
    isSpeakingRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    window.speechSynthesis.cancel();
    updateState('idle');
  }, [updateState]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  // Check support on mount
  useEffect(() => {
    const supported =
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition) && 'speechSynthesis' in window;
    setIsSupported(supported);
  }, []);

  return { state, transcript, error, isSupported, start, stop };
}
