import { useState } from 'react';
import { VeraAvatar } from './VeraAvatar';
import type { AvatarGesture, AvatarSmile, AvatarState, AvatarMood } from './useAvatarAnimation';

const states: AvatarState[] = ['idle', 'listening', 'thinking', 'speaking'];

export function AvatarTestRoute() {
  const [state, setState] = useState<AvatarState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [wordTick, setWordTick] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  const [mood, setMood] = useState<AvatarMood>('neutral');
  const [debugGesture, setDebugGesture] = useState<AvatarGesture>();
  const [debugSmile, setDebugSmile] = useState<AvatarSmile>();

  const smiles: AvatarSmile[] = ['neutral', 'warm', 'half', 'laugh', 'focused'];
  const handPreview = debugGesture === 'wave';

  return (
    <main className="min-h-screen bg-[#08090c] text-white flex flex-col items-center justify-center gap-6 p-6">
      <VeraAvatar state={state} audioLevel={audioLevel} micLevel={micLevel} wordTick={wordTick} interrupted={interrupted} mood={mood} debugGesture={debugGesture} debugSmile={debugSmile} size={560} />
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[.04] p-5 space-y-5">
        <div className="flex flex-wrap justify-center gap-2">
          {states.map((item) => (
            <button key={item} type="button" onClick={() => setState(item)} className={`rounded-full border px-4 py-2 text-sm capitalize ${state === item ? 'border-lime-300/60 bg-lime-300/10 text-lime-100' : 'border-white/10 text-slate-300'}`}>
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {(['neutral', 'warm', 'curious'] as const).map((item) => <button key={item} type="button" onClick={() => setMood(item)} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${mood === item ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-100' : 'border-white/10 text-slate-300'}`}>Mood: {item}</button>)}
        </div>
        <div className="space-y-2"><p className="text-center text-xs uppercase tracking-widest text-slate-500">Expression and movement previews</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => { setMood('warm'); setDebugSmile('warm'); }} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300">Smile</button>
            <button type="button" onClick={() => { setMood('curious'); setDebugSmile(undefined); }} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300">Curious</button>
            <button type="button" onClick={() => { setState('thinking'); setDebugSmile('focused'); }} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300">Thinking</button>
            <button type="button" onClick={() => { setState('listening'); setInterrupted(true); window.setTimeout(() => setInterrupted(false), 700); setDebugSmile(undefined); }} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300">Surprised</button>
            <button type="button" aria-pressed={handPreview} onClick={() => setDebugGesture(handPreview ? 'rest' : 'wave')} className={`rounded-full border px-3 py-1.5 text-xs ${handPreview ? 'border-lime-300/50 bg-lime-300/10 text-lime-100' : 'border-white/10 text-slate-300'}`}>Hand emphasis preview</button>
          </div>
        </div>
        <div className="space-y-2"><p className="text-center text-xs uppercase tracking-widest text-slate-500">Expressions</p>
          <div className="flex flex-wrap justify-center gap-2">{smiles.map((smile) => <button key={smile} type="button" onClick={() => setDebugSmile(smile)} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${debugSmile === smile ? 'border-rose-200/40 bg-rose-200/10 text-rose-100' : 'border-white/10 text-slate-300'}`}>{smile}</button>)}</div>
        </div>
        <label className="block text-sm text-slate-300">Audio level: {audioLevel.toFixed(2)}
          <input aria-label="Audio level" className="mt-2 block w-full accent-lime-300" type="range" min="0" max="1" step="0.01" value={audioLevel} onChange={(e) => setAudioLevel(Number(e.target.value))} />
        </label>
        <label className="block text-sm text-slate-300">Mic level: {micLevel.toFixed(2)}
          <input aria-label="Mic level" className="mt-2 block w-full accent-emerald-400" type="range" min="0" max="1" step="0.01" value={micLevel} onChange={(e) => setMicLevel(Number(e.target.value))} />
        </label>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={() => setWordTick((tick) => tick + 1)} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200">Word tick</button>
          <button type="button" onClick={() => { setInterrupted(true); window.setTimeout(() => setInterrupted(false), 700); setState('listening'); }} className="rounded-full border border-rose-300/30 bg-rose-300/10 px-4 py-2 text-sm text-rose-100">Interrupted</button>
        </div>
      </div>
    </main>
  );
}
