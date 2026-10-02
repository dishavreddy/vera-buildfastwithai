import { useEffect, useRef, useState } from 'react';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type AvatarMood = 'neutral' | 'warm' | 'curious';
export type AvatarGesture = 'rest' | 'open-palms' | 'sweep' | 'count' | 'point' | 'chin' | 'note' | 'wave' | 'go-ahead';
export type AvatarSmile = 'neutral' | 'warm' | 'half' | 'laugh' | 'focused';

// Webcam motion tuning. Keep these small; the goal is lived-in, not theatrical.
export const AVATAR_TUNING = {
  blinkMinMs: 2500, blinkMaxMs: 6000, blinkCloseMs: 115, blinkOpenMs: 95,
  doubleBlinkChance: 0.14, doubleBlinkGapMs: 135, reducedMotionBlinkMs: 6500,
  breathCycleMs: 4100, breathScale: 0.009, swayDegrees: 0.55, swayPixels: 0.65,
  gazeCameraRatio: 0.65, gazeMinMs: 1500, gazeMaxMs: 3600, gazeMaxHoldMs: 3200,
  gazeReturnMs: 300, gazeHeadFollowDegrees: 1.1, cursorParallaxPx: 0.6,
  smileRampMs: 400, mouthSpringMs: 92, wordTickDecayMs: 260,
  postureMinMs: 8000, postureMaxMs: 15000, interruptionMs: 220,
  nodMs: 330, nodStrength: 1.1, audioSpikeThreshold: 0.18,
  handMinMs: 12000, handMaxMs: 20000, handRiseMs: 900,
  cameraDriftPx: 1, faceLightFlicker: 0.018, animationIntervalMs: 1000 / 30,
} as const;

export const AVATAR_MOUTH_SHAPES = [
  'M 283 174 Q 320 181 357 174 Q 320 177 283 174 Z', // closed
  'M 290 173 Q 320 169 350 173 Q 348 180 320 182 Q 292 180 290 173 Z', // slightly parted
  'M 287 171 Q 320 163 353 171 Q 351 189 320 193 Q 289 189 287 171 Z', // open
  'M 278 170 Q 320 160 362 170 Q 358 195 320 199 Q 282 195 278 170 Z', // wide
  'M 304 170 Q 320 164 336 170 Q 340 192 320 198 Q 300 192 304 170 Z', // round
  'M 283 174 Q 320 184 357 174 Q 320 180 283 174 Z', // soft smile
] as const;

interface AnimationInput {
  state: AvatarState;
  audioLevel?: number;
  micLevel: number;
  wordTick: number;
  interrupted: boolean;
  mood: AvatarMood;
  debugGesture?: AvatarGesture;
  debugSmile?: AvatarSmile;
}

export interface AvatarFrame {
  time: number; blink: number; headX: number; headY: number; headRotation: number;
  breath: number; shoulderLift: number; gazeX: number; gazeY: number;
  leftBrow: number; rightBrow: number; mouthIndex: number; nod: number;
  surprise: number; ringColor: string; smile: number; cheekRaise: number; jaw: number;
  lean: number; cameraX: number; cameraY: number; hairShift: number;
  collarShift: number; lightFlicker: number; handY: number; handOpacity: number;
  reducedMotion: boolean;
}

const initialFrame: AvatarFrame = {
  time: 0, blink: 1, headX: 0, headY: 0, headRotation: 0, breath: 1,
  shoulderLift: 0, gazeX: 0, gazeY: 0, leftBrow: 0, rightBrow: 0,
  mouthIndex: 0, nod: 0, surprise: 0, ringColor: '#9aa0aa', smile: 0, jaw: 0,
  cheekRaise: 0, lean: 0, cameraX: 0, cameraY: 0, hairShift: 0,
  collarShift: 0, lightFlicker: 0, handY: 0, handOpacity: 0, reducedMotion: false,
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function useAvatarAnimation(input: AnimationInput) {
  const [frame, setFrame] = useState(initialFrame);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    let raf = 0;
    let previousTime = 0;
    let elapsed = 0;
    let lastPaint = -Infinity;
    let blinkAt = randomBetween(AVATAR_TUNING.blinkMinMs, AVATAR_TUNING.blinkMaxMs);
    let blinkStart = -1;
    let doubleBlinkAt = -1;
    let nextGazeAt = randomBetween(AVATAR_TUNING.gazeMinMs, AVATAR_TUNING.gazeMaxMs);
    let gazeStarted = 0;
    let gazeTarget: 'camera' | 'notes' | 'aside' = 'camera';
    let gazeX = 0;
    let gazeY = 0;
    let nextPostureAt = randomBetween(AVATAR_TUNING.postureMinMs, AVATAR_TUNING.postureMaxMs);
    let posture = 0;
    let postureTarget = 0;
    let previousState = inputRef.current.state;
    let greetingAt = -Infinity;
    let previousSmile = 0;
    let smoothedAudio = 0;
    let previousAudio = 0;
    let wordTick = inputRef.current.wordTick;
    let wordPulseAt = -Infinity;
    let nodAt = -Infinity;
    let nodStrength = 0;
    let mouthJitter = 0;
    let micLevel = 0;
    let previousMic = 0;
    let handStarted = -Infinity;
    let nextHandAt = randomBetween(AVATAR_TUNING.handMinMs, AVATAR_TUNING.handMaxMs);
    let interruptedAt = -Infinity;
    let wasInterrupted = inputRef.current.interrupted;
    let cursorX = 0;
    let cursorY = 0;
    let headTilt = 0;
    let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onReduced = () => { reduced = media.matches; };
    media.addEventListener('change', onReduced);

    const container = containerRef.current;
    const onPointerMove = (event: PointerEvent) => {
      const rect = container?.getBoundingClientRect();
      if (!rect) return;
      cursorX = clamp((event.clientX - rect.left) / rect.width) * 2 - 1;
      cursorY = clamp((event.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const onPointerLeave = () => { cursorX = 0; cursorY = 0; };
    container?.addEventListener('pointermove', onPointerMove);
    container?.addEventListener('pointerleave', onPointerLeave);

    const draw = (timestamp: number) => {
      if (document.hidden) { raf = 0; previousTime = 0; return; }
      const dt = previousTime ? Math.min(timestamp - previousTime, 50) : 16;
      previousTime = timestamp;
      elapsed += dt;

      if (elapsed - lastPaint >= AVATAR_TUNING.animationIntervalMs) {
        lastPaint = elapsed;
        const current = inputRef.current;
        const state = current.state;
        if (state === 'speaking' && previousState !== 'speaking') {
          greetingAt = elapsed;
          handStarted = elapsed;
          nextHandAt = elapsed + randomBetween(AVATAR_TUNING.handMinMs, AVATAR_TUNING.handMaxMs);
          nodAt = elapsed;
          nodStrength = AVATAR_TUNING.nodStrength;
        }
        if (current.interrupted && !wasInterrupted) interruptedAt = elapsed;
        wasInterrupted = current.interrupted;

        if (current.wordTick !== wordTick) {
          wordTick = current.wordTick;
          wordPulseAt = elapsed;
          mouthJitter = randomBetween(-0.13, 0.13);
          nodAt = elapsed;
          nodStrength = 0.55;
        }

        const blinkDuration = AVATAR_TUNING.blinkCloseMs + AVATAR_TUNING.blinkOpenMs;
        if (elapsed >= blinkAt && blinkStart < 0) {
          blinkStart = elapsed;
          if (Math.random() < AVATAR_TUNING.doubleBlinkChance) doubleBlinkAt = elapsed + blinkDuration + AVATAR_TUNING.doubleBlinkGapMs;
        }
        if (doubleBlinkAt > 0 && elapsed >= doubleBlinkAt && blinkStart < 0) { blinkStart = elapsed; doubleBlinkAt = -1; }
        let blink = 1;
        if (blinkStart >= 0) {
          const phase = elapsed - blinkStart;
          if (phase < AVATAR_TUNING.blinkCloseMs) blink = Math.max(.04, 1 - phase / AVATAR_TUNING.blinkCloseMs);
          else if (phase < blinkDuration) blink = Math.min(1, .04 + (phase - AVATAR_TUNING.blinkCloseMs) / AVATAR_TUNING.blinkOpenMs);
          else { blinkStart = -1; blinkAt = elapsed + (reduced ? AVATAR_TUNING.reducedMotionBlinkMs : randomBetween(AVATAR_TUNING.blinkMinMs, AVATAR_TUNING.blinkMaxMs)); }
        }

        if (!reduced && elapsed >= nextGazeAt) {
          gazeStarted = elapsed;
          const cameraProbability = AVATAR_TUNING.gazeCameraRatio;
          if (state === 'thinking') gazeTarget = Math.random() < .25 ? 'camera' : 'aside';
          else if (state === 'listening' && Math.random() < .32) gazeTarget = 'notes';
          else gazeTarget = Math.random() < cameraProbability ? 'camera' : Math.random() < .5 ? 'notes' : 'aside';
          nextGazeAt = elapsed + randomBetween(AVATAR_TUNING.gazeMinMs, AVATAR_TUNING.gazeMaxMs);
        }
        if (elapsed - gazeStarted > AVATAR_TUNING.gazeMaxHoldMs && gazeTarget !== 'camera') gazeTarget = 'camera';
        const targetX = reduced ? 0 : (gazeTarget === 'notes' ? -1.7 : gazeTarget === 'aside' ? 2.7 : 0) + cursorX * AVATAR_TUNING.cursorParallaxPx;
        const targetY = reduced ? 0 : (gazeTarget === 'notes' ? 4.2 : gazeTarget === 'aside' ? -2 : 0) + cursorY * .35;
        gazeX = smooth(gazeX, targetX, 1 - Math.exp(-dt / AVATAR_TUNING.gazeReturnMs));
        gazeY = smooth(gazeY, targetY, 1 - Math.exp(-dt / AVATAR_TUNING.gazeReturnMs));
        const tiltTarget = reduced ? 0 : gazeTarget === 'notes' ? -AVATAR_TUNING.gazeHeadFollowDegrees : gazeTarget === 'aside' ? AVATAR_TUNING.gazeHeadFollowDegrees : state === 'thinking' ? AVATAR_TUNING.gazeHeadFollowDegrees * .8 : 0;
        headTilt = smooth(headTilt, tiltTarget, 1 - Math.exp(-dt / 380));

        if (elapsed >= nextPostureAt) {
          postureTarget = randomBetween(-.65, .65);
          nextPostureAt = elapsed + randomBetween(AVATAR_TUNING.postureMinMs, AVATAR_TUNING.postureMaxMs);
        }
        posture = smooth(posture, reduced ? 0 : postureTarget, 1 - Math.exp(-dt / 1500));

        micLevel = smooth(micLevel, clamp(current.micLevel), 1 - Math.exp(-dt / 110));
        if (previousMic > .2 && previousMic - micLevel > .13 && state === 'listening') {
          nodAt = elapsed;
          nodStrength = .45;
        }
        previousMic = micLevel;

        const rawAudio = current.audioLevel === undefined
          ? (elapsed - wordPulseAt < AVATAR_TUNING.wordTickDecayMs ? (1 - (elapsed - wordPulseAt) / AVATAR_TUNING.wordTickDecayMs) * .68 : 0)
          : clamp(current.audioLevel);
        smoothedAudio = smooth(smoothedAudio, state === 'speaking' ? rawAudio : 0, 1 - Math.exp(-dt / AVATAR_TUNING.mouthSpringMs));
        if (state === 'speaking' && (smoothedAudio - previousAudio > AVATAR_TUNING.audioSpikeThreshold || (previousAudio > .16 && smoothedAudio < .055))) {
          nodAt = elapsed;
          nodStrength = .72;
        }
        previousAudio = smoothedAudio;
        const nodPhase = (elapsed - nodAt) / AVATAR_TUNING.nodMs;
        const nod = nodPhase >= 0 && nodPhase <= 1 ? Math.sin(Math.PI * nodPhase) * nodStrength : 0;

        let mouthIndex = state === 'thinking' ? 1 : state === 'speaking' && smoothedAudio > .055
          ? (smoothedAudio + mouthJitter < .2 ? 1 : smoothedAudio + mouthJitter < .43 ? 2 : smoothedAudio + mouthJitter < .67 ? 3 : smoothedAudio + mouthJitter < .84 ? 4 : 2)
          : state === 'speaking' && elapsed - greetingAt < 800 ? 1 : 0;
        if (state === 'speaking' && smoothedAudio > .08 && Math.random() < .025) mouthIndex = 5;
        if (Math.random() < .04) mouthJitter = randomBetween(-.1, .1);

        let targetSmile = state === 'idle' ? .2 : state === 'listening' ? .26 : state === 'thinking' ? -.08 : .12;
        if (current.mood === 'warm') targetSmile = Math.max(targetSmile, .48);
        if (current.mood === 'curious') targetSmile = Math.max(targetSmile, .18);
        if (state === 'speaking' && elapsed - greetingAt < 2400) targetSmile = .72;
        if (current.debugSmile) targetSmile = current.debugSmile === 'warm' ? .8 : current.debugSmile === 'half' ? .38 : current.debugSmile === 'laugh' ? .88 : current.debugSmile === 'focused' ? -.24 : 0;
        const smile = smooth(previousSmile, targetSmile, 1 - Math.exp(-dt / AVATAR_TUNING.smileRampMs));
        previousSmile = smile;

        const greetingWave = state === 'speaking' && elapsed - greetingAt < AVATAR_TUNING.handRiseMs;
        const debugWave = current.debugGesture === 'wave';
        if (state === 'speaking' && !reduced && elapsed >= nextHandAt && smoothedAudio > .55) {
          handStarted = elapsed;
          nextHandAt = elapsed + randomBetween(AVATAR_TUNING.handMinMs, AVATAR_TUNING.handMaxMs);
        }
        const handElapsed = elapsed - (greetingWave ? greetingAt : handStarted);
        const handProgress = handElapsed < AVATAR_TUNING.handRiseMs ? Math.sin(Math.PI * handElapsed / AVATAR_TUNING.handRiseMs) : 0;
        const handVisible = !reduced && (debugWave || handProgress > 0) ? 1 : 0;
        const surprise = Math.max(0, 1 - (elapsed - interruptedAt) / AVATAR_TUNING.interruptionMs);
        const cameraX = reduced ? 0 : Math.sin(elapsed * .00047) * AVATAR_TUNING.cameraDriftPx;
        const cameraY = reduced ? 0 : Math.sin(elapsed * .00061 + .9) * AVATAR_TUNING.cameraDriftPx * .35;
        const sway = reduced ? 0 : Math.sin(elapsed * .00072) * .56 + Math.sin(elapsed * .00119 + 1.3) * .44;
        const breath = reduced ? 1 : 1 + Math.sin(elapsed / AVATAR_TUNING.breathCycleMs * Math.PI * 2) * AVATAR_TUNING.breathScale;

        setFrame({
          time: elapsed, blink,
          headX: reduced ? 0 : Math.sin(elapsed * .00053) * AVATAR_TUNING.swayPixels,
          headY: (reduced ? 0 : Math.sin(elapsed * .00058) * .45) - nod * AVATAR_TUNING.nodStrength,
          headRotation: sway * AVATAR_TUNING.swayDegrees + headTilt + nod * .18,
          breath, shoulderLift: (breath - 1) * 75 + nod * .45,
          gazeX, gazeY,
          leftBrow: (state === 'listening' ? -1 : 0) + (state === 'thinking' ? -1.7 : 0) - surprise * 4 - smoothedAudio * .6 + (current.mood === 'curious' ? -1 : 0),
          rightBrow: (state === 'listening' ? -1 : 0) + (state === 'thinking' ? -2.1 : 0) - surprise * 4.5 - smoothedAudio * .4 + (current.mood === 'curious' ? -1.5 : 0),
          mouthIndex, nod, surprise,
          ringColor: state === 'speaking' ? '#ccff00' : state === 'listening' ? '#10b981' : state === 'thinking' ? '#798391' : '#a3adbd',
          smile,
          cheekRaise: current.debugSmile === 'laugh' ? .75 : Math.max(0, (smile - .32) * 1.6) + smoothedAudio * .08,
          jaw: state === 'speaking' ? smoothedAudio * 1.4 : 0,
          lean: reduced ? 0 : (state === 'listening' ? .55 : state === 'thinking' ? -.5 : 0) + posture * .35,
          cameraX, cameraY,
          hairShift: reduced ? 0 : sway * .8,
          collarShift: reduced ? 0 : nod * .45 + posture * .3,
          lightFlicker: reduced ? 0 : Math.sin(elapsed * .0017) * AVATAR_TUNING.faceLightFlicker,
          handY: debugWave ? -28 : -34 * handProgress,
          handOpacity: handVisible * (debugWave ? .86 : handProgress),
          reducedMotion: reduced,
        });
        previousState = state;
      }
      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; previousTime = 0; }
      else if (!raf) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      media.removeEventListener('change', onReduced);
      container?.removeEventListener('pointermove', onPointerMove);
      container?.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { frame, containerRef };
}
