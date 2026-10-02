import { AVATAR_MOUTH_SHAPES, AVATAR_TUNING, useAvatarAnimation } from './useAvatarAnimation';
import type { AvatarGesture, AvatarMood, AvatarSmile, AvatarState } from './useAvatarAnimation';

export const SHOW_HANDS = false;

export interface VeraAvatarProps {
  state: AvatarState;
  audioLevel?: number;
  micLevel?: number;
  wordTick?: number;
  interrupted?: boolean;
  size?: number;
  mood?: AvatarMood;
  /** Optional controls used by the development avatar stage. */
  debugGesture?: AvatarGesture;
  debugSmile?: AvatarSmile;
  /** Legacy prop aliases retained for existing call sites. */
  speaking?: boolean;
  isInterrupted?: boolean;
}

export function VeraAvatar({
  state, audioLevel, micLevel = 0, wordTick = 0, interrupted = false,
  size = 560, mood = 'neutral', debugGesture, debugSmile, speaking = false, isInterrupted = false,
}: VeraAvatarProps) {
  const activeState = speaking ? 'speaking' : state;
  const { frame, containerRef } = useAvatarAnimation({
    state: activeState, audioLevel, micLevel, wordTick, interrupted: interrupted || isInterrupted,
    mood, debugGesture, debugSmile,
  });
  const transition = 'transform 280ms cubic-bezier(.22,1,.36,1), opacity 280ms cubic-bezier(.22,1,.36,1)';
  const smile = frame.smile;
  const mouthIndex = frame.surprise > .01 ? 0 : frame.mouthIndex;
  const micActive = activeState === 'speaking' && ((audioLevel ?? 0) > .03 || audioLevel === undefined);

  return (
    <div
      ref={containerRef}
      className="relative isolate select-none overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0d11] shadow-[0_24px_90px_rgba(0,0,0,.5)]"
      style={{ width: size, height: size * .625, contain: 'layout paint' }}
      role="img"
      aria-label={`Vera is ${activeState}`}
    >
      <svg viewBox="55 0 500 312.5" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="tileWall" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#34312e"/><stop offset=".5" stopColor="#242529"/><stop offset="1" stopColor="#11141a"/></linearGradient>
          <linearGradient id="officeWindow" x1="0" y1="0" x2=".9" y2="1"><stop stopColor="#647b82"/><stop offset=".45" stopColor="#29383f"/><stop offset="1" stopColor="#151f28"/></linearGradient>
          <linearGradient id="skinFace" x1=".23" y1=".08" x2=".86" y2=".94"><stop stopColor="#f2c9a8"/><stop offset=".52" stopColor="#dca98b"/><stop offset=".82" stopColor="#bd876d"/><stop offset="1" stopColor="#805a50"/></linearGradient>
          <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#64443c"/><stop offset=".3" stopColor="#302327"/><stop offset=".75" stopColor="#16171d"/><stop offset="1" stopColor="#49302f"/></linearGradient>
          <linearGradient id="hairShine" x1="0" y1="0" x2="1" y2=".2"><stop stopColor="#d5a083" stopOpacity="0"/><stop offset=".5" stopColor="#d5a083" stopOpacity=".55"/><stop offset="1" stopColor="#d5a083" stopOpacity="0"/></linearGradient>
          <linearGradient id="blazer" x1="0" y1="0" x2=".9" y2="1"><stop stopColor="#272a2d"/><stop offset=".45" stopColor="#111419"/><stop offset="1" stopColor="#090b10"/></linearGradient>
          <radialGradient id="lampGlow"><stop stopColor="#e8b56f" stopOpacity=".48"/><stop offset="1" stopColor="#e8b56f" stopOpacity="0"/></radialGradient>
          <radialGradient id="windowLight"><stop stopColor="#ffe0bb" stopOpacity=".28"/><stop offset="1" stopColor="#ffe0bb" stopOpacity="0"/></radialGradient>
          <radialGradient id="vignette"><stop offset=".53" stopColor="#07090d" stopOpacity="0"/><stop offset="1" stopColor="#05070a" stopOpacity=".72"/></radialGradient>
          <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
          <filter id="handSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.5"/></filter>
          <filter id="bokeh"><feGaussianBlur stdDeviation="3"/></filter>
          <filter id="softShadow" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="4"/><feComponentTransfer><feFuncA type="linear" slope=".3"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* Warm office, softened like a video-call camera background. */}
        <rect width="640" height="400" fill="url(#tileWall)"/>
        <g filter="url(#softBlur)" opacity=".93">
          <rect x="25" y="30" width="174" height="193" rx="5" fill="url(#officeWindow)" stroke="#796e62" strokeWidth="7"/>
          <path d="M111 33V220 M28 132H196" stroke="#a89b87" strokeOpacity=".58" strokeWidth="4"/>
          <g filter="url(#bokeh)">
            <circle cx="50" cy="76" r="8" fill="#e4bd84" opacity=".67"/><circle cx="88" cy="98" r="5" fill="#a2c1c3" opacity=".62"/><circle cx="158" cy="68" r="9" fill="#d39a6d" opacity=".54"/>
            <circle cx="73" cy="174" r="7" fill="#c3a878" opacity=".62"/><circle cx="174" cy="159" r="6" fill="#93b2b6" opacity=".55"/><circle cx="132" cy="186" r="5" fill="#f1d3a5" opacity=".47"/>
            <path d="M34 202 L34 155 L49 141 L63 152 L63 130 L82 112 L99 124 L99 203Z M119 210 L119 163 L132 147 L145 161 L145 137 L163 122 L183 144 L183 210Z" fill="#101923" opacity=".84"/>
          </g>
          <path d="M0 0H640V42H0Z" fill="#090c10" opacity=".37"/>
          {/* Shelf, books, framed art, and plant */}
          <path d="M455 92H622 M471 160H626" stroke="#795e47" strokeWidth="7"/>
          <rect x="481" y="51" width="72" height="36" fill="#47413b"/><rect x="489" y="57" width="56" height="24" fill="#718080" opacity=".45"/>
          <path d="M566 89V53H573V89 M577 89V62H585V89 M589 89V47H596V89" fill="#947a5d"/>
          <path d="M535 154V119H579V154Z" fill="#6a5042"/><path d="M541 148V124H573V148Z" fill="#343b3e"/>
          <path d="M589 160V119H600V160 M603 160V130H613V160" fill="#876c50"/>
          <ellipse cx="596" cy="207" rx="28" ry="12" fill="#272321"/><path d="M579 188 Q581 208 590 215H604Q613 205 615 188Z" fill="#55463b"/>
          <path d="M596 188Q580 159 561 145 M596 187Q602 147 619 134 M591 186Q585 145 582 127 M602 186Q622 166 633 159" fill="none" stroke="#66765c" strokeWidth="5" strokeLinecap="round"/>
          <path d="M561 145Q547 130 557 120Q575 128 568 146 M619 134Q629 119 638 127Q635 143 619 142 M582 127Q576 110 587 104Q596 116 588 132 M633 159Q646 147 650 158Q643 172 628 167" fill="#596a53"/>
        </g>
        <ellipse cx="531" cy="227" rx="123" ry="94" fill="url(#lampGlow)"/>
        <g opacity=".88"><path d="M552 193L579 146L605 193Z" fill="#4c4238"/><path d="M577 149L585 115" stroke="#87775f" strokeWidth="5"/><circle cx="585" cy="111" r="5" fill="#e6c083"/><ellipse cx="578" cy="195" rx="34" ry="6" fill="#4c4134"/></g>

        {/* A person-sized seated composition, gently drifting with the camera. */}
        <g transform={`translate(${frame.cameraX}px ${frame.cameraY}px)`}>
          <g transform={`translate(0 ${frame.lean}px)`}>
            {/* torso and jacket */}
            <g style={{ transform: `translateY(${frame.shoulderLift}px) scale(1 ${frame.breath})`, transformOrigin: '320px 312px', transition }}>
              <path d="M221 242Q248 215 281 211L320 231L360 211Q397 216 421 243Q449 273 459 342H181Q191 270 221 242Z" fill="url(#blazer)"/>
              <path d="M276 215Q293 245 320 258Q348 244 365 215L348 206H292Z" fill="#14171b"/>
              <path d="M281 214Q297 244 320 255Q343 244 360 214" fill="none" stroke="#ccff00" strokeOpacity=".4" strokeWidth="1.6" style={{ transform: `translateY(${frame.collarShift}px)`, transition }}/>
              <path d="M240 254Q262 274 278 323 M401 253Q379 275 363 323" fill="none" stroke="#e9e5dd" strokeOpacity=".055" strokeWidth="2"/>
              <path d="M304 259L320 278L336 259" fill="none" stroke="#424247" strokeOpacity=".42" strokeWidth="1.4"/>
            </g>
            {/* neck */}
            <path d="M297 198Q301 222 288 238Q304 257 320 260Q339 255 353 238Q339 219 344 197Z" fill="url(#skinFace)"/>
            <path d="M298 219Q320 235 345 219Q338 244 320 247Q303 242 298 219Z" fill="#835e54" opacity=".19"/>

            {/* face and hair */}
            <g style={{ transform: `translate(${frame.headX}px ${frame.headY}px) rotate(${frame.headRotation}deg)`, transformOrigin: '320px 143px', transition }} filter="url(#softShadow)">
              <path d="M269 115Q259 107 259 124Q260 145 279 150Z" fill="url(#skinFace)"/><path d="M371 115Q381 107 381 124Q380 145 361 150Z" fill="url(#skinFace)"/>
              <path d="M273 101Q277 58 318 54Q361 55 369 101L365 160Q359 198 337 211Q328 216 320 216Q311 216 302 211Q280 197 275 160Z" fill="url(#skinFace)"/>
              <path d="M276 113Q267 68 294 50Q320 29 350 45Q381 61 373 116Q363 94 348 79Q321 92 293 79Q287 99 276 113Z" fill="url(#hair)"/>
              <path d="M274 101Q259 144 274 188Q254 170 256 136Q255 103 270 79Z M369 96Q387 140 370 185Q392 167 385 130Q382 99 374 81Z" fill="url(#hair)"/>
              <path d="M276 92Q294 51 329 45Q356 45 369 73" fill="none" stroke="url(#hairShine)" strokeWidth="7" strokeLinecap="round" opacity=".63"/>
              <path d="M278 131Q274 171 297 195" fill="none" stroke="#ffe3ca" strokeOpacity=".48" strokeWidth="3" strokeLinecap="round"/>
              <path d="M277 113Q265 148 280 183" fill="none" stroke="#ffe5c5" strokeOpacity={.12 + frame.lightFlicker} strokeWidth="4" strokeLinecap="round"/>
              <ellipse cx="311" cy="132" rx="94" ry="92" fill="url(#windowLight)" opacity={.32 + frame.lightFlicker}/>
              <ellipse cx="289" cy="159" rx="11" ry="5.5" fill="#d87678" opacity={.12 + frame.cheekRaise * .1}/><ellipse cx="351" cy="159" rx="11" ry="5.5" fill="#d87678" opacity={.12 + frame.cheekRaise * .1}/>

              {/* brows */}
              <path d="M285 113Q298 105 310 113" fill="none" stroke="#543b35" strokeWidth="3.6" strokeLinecap="round" style={{ transform: `translateY(${frame.leftBrow}px)`, transformOrigin: '297px 112px', transition }}/>
              <path d="M330 113Q344 104 357 113" fill="none" stroke="#543b35" strokeWidth="3.6" strokeLinecap="round" style={{ transform: `translateY(${frame.rightBrow}px)`, transformOrigin: '344px 112px', transition }}/>

              {/* Eye whites, iris, pupil, catchlights and relaxed upper lids. */}
              <g style={{ transform: `translate(${frame.gazeX}px ${frame.gazeY}px)`, transformOrigin: '320px 131px', transition }}>
                {[0, 1].map((i) => {
                  const x = i === 0 ? 299 : 342;
                  return <g key={i} style={{ transform: `scaleY(${frame.blink * (1 + frame.surprise * .28)})`, transformOrigin: `${x}px 132px`, transition: 'transform 110ms cubic-bezier(.22,1,.36,1)' }}>
                    <path d={`M${x - 12} 131Q${x} 122 ${x + 12} 131Q${x + 10} 139 ${x} 140Q${x - 10} 139 ${x - 12} 131Z`} fill="#f4e5d7"/>
                    <ellipse cx={x} cy="132" rx="4.9" ry="6.1" fill="#936b4d"/><ellipse cx={x} cy="132" rx="2.8" ry="4.4" fill="#272126"/>
                    <circle cx={x + 1.1} cy="130" r="1.5" fill="#fff9ec"/><path d={`M${x - 13} 131Q${x} 120 ${x + 13} 131`} fill="none" stroke="#634840" strokeWidth="1.8" strokeLinecap="round"/>
                    {frame.cheekRaise > .1 && <path d={`M${x - 9} 142Q${x} 145 ${x + 9} 142`} fill="none" stroke="#9e7466" strokeOpacity=".4" strokeWidth="1.2"/>}
                  </g>;
                })}
              </g>
              {/* bridge and subtle nostril shadow */}
              <path d="M320 133Q317 149 313 158Q314 162 320 162" fill="none" stroke="#a67764" strokeOpacity=".58" strokeWidth="1.7" strokeLinecap="round"/><path d="M314 164Q320 167 326 163" fill="none" stroke="#986b5e" strokeOpacity=".53" strokeWidth="1.4" strokeLinecap="round"/>
              {/* upper/lower lips and six smoothly blended speech shapes */}
              <g style={{ transform: `translateY(${frame.jaw}px)`, transformOrigin: '320px 176px', transition }}>
                <path d="M282 172Q296 166 307 170Q320 166 333 170Q344 166 358 172Q340 181 320 181Q300 181 282 172Z" fill="#995e5d" opacity=".85"/>
                <path d={AVATAR_MOUTH_SHAPES[mouthIndex]} fill={mouthIndex === 0 || mouthIndex === 5 ? '#552e32' : '#442529'} stroke="#9c5e5d" strokeWidth=".9" strokeLinejoin="round" style={{ transition: `d ${AVATAR_TUNING.mouthSpringMs}ms cubic-bezier(.22,1,.36,1)` }}/>
                {mouthIndex > 0 && mouthIndex < 5 && <path d="M294 174Q320 180 346 174Q337 182 320 184Q303 182 294 174Z" fill="#d5a09a" opacity=".7"/>}
                <path d={`M284 174Q320 ${179 + smile * 5} 356 174`} fill="none" stroke="#ac6667" strokeWidth="1.3" strokeLinecap="round" style={{ transition: `d ${AVATAR_TUNING.smileRampMs}ms cubic-bezier(.22,1,.36,1)` }}/>
                <path d="M292 183Q320 192 348 183" fill="none" stroke="#8b5e55" strokeOpacity={.12 + frame.cheekRaise * .24} strokeWidth="1.5" strokeLinecap="round"/>
              </g>
              {/* front fringe */}
              <path d="M270 113Q268 71 294 53Q311 42 331 47Q317 61 315 79Q299 98 276 107Z" fill="url(#hair)" style={{ transform: `translate(${frame.hairShift}px ${frame.hairShift * .35}px)`, transition }}/><path d="M276 96Q289 64 309 55" fill="none" stroke="url(#hairShine)" strokeWidth="3" opacity=".58"/>
              <path d="M363 90Q379 109 375 145Q367 132 358 125Q353 104 342 91Z" fill="url(#hair)"/>
            </g>
          </g>
        </g>

        {/* Call tile labels, subtle mic state, and soft lens vignette. */}
        <rect width="640" height="400" fill="url(#vignette)" pointerEvents="none"/>
        {SHOW_HANDS || debugGesture === 'wave' ? <g opacity={frame.handOpacity} filter="url(#handSoft)" style={{ transform: `translateY(${frame.handY}px)`, transition }}><path d="M374 356C365 348 369 330 382 322C393 315 408 316 419 322C434 319 450 324 458 335C470 337 477 348 474 358C469 372 447 380 420 379C397 378 381 371 374 356Z" fill="url(#skinFace)"/></g> : null}
        <g transform="translate(91 277)">
          <rect width="156" height="24" rx="12" fill="#090b0d" fillOpacity=".68" stroke="#ffffff" strokeOpacity=".08"/>
          <circle cx="13" cy="12" r="3" fill={frame.ringColor} opacity=".9"/>
          <text x="23" y="16" fill="#f0eee9" fontSize="11" fontFamily="Inter, ui-sans-serif, system-ui" letterSpacing=".25">Vera - Interviewer</text>
        </g>
        <g transform="translate(554 279)" opacity=".76">
          <rect x="-17" y="-10" width="9" height="14" rx="4.5" fill="none" stroke="#e6e7e9" strokeWidth="1.5"/>
          <path d="M-20 -4V-2Q-20 7 -12.5 7Q-5 7 -5 -2V-4M-12.5 7V11M-17 11H-8" fill="none" stroke="#e6e7e9" strokeWidth="1.4" strokeLinecap="round"/>
          {micActive && <circle cx="-12.5" cy="0" r="12" fill="none" stroke="#ccff00" strokeOpacity=".66" strokeWidth="1.5" style={{ transform: `scale(${1 + (audioLevel ?? 0) * .5})`, transformOrigin: '-12px 0', transition: 'transform 100ms ease-out' }}/>}
        </g>
      </svg>
    </div>
  );
}
