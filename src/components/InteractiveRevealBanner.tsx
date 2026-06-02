import React, { useRef, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export default function InteractiveRevealBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  
  // Interactive coordinates and values using Ref for 60fps performance (zero react render lag)
  const targetX = useRef(0);
  const targetY = useRef(0);
  const currentZebraX = useRef(0);
  const currentZebraY = useRef(0);
  const currentUnicornX = useRef(0);
  const currentUnicornY = useRef(0);
  const unicornDistortion = useRef(0);
  
  const maskGlobalOpacity = useRef(0);
  const firstHover = useRef(true);
  const animationFrameId = useRef<number | null>(null);

  // Fallback state in case the local images 1.jpg, 2.jpg, 3.jpg are missed or loading
  const [imageErrors, setImageErrors] = useState({ horse: false, zebra: false, unicorn: false });

  // Parameter configuration requested by user
  const ZEBRA_RADIUS = 204;
  const ZEBRA_SOFTNESS = 0; // %
  const UNICORN_RADIUS = 330;
  const UNICORN_LAG = 0.04; // smooth elastic trailing weight (100x delay)
  const MIN_VISIBLE_CIRCLE_FRACTION = 0.1;
  const REVEAL_OUTSET = UNICORN_RADIUS * (1 - MIN_VISIBLE_CIRCLE_FRACTION);
  const UNICORN_EDGE_CONTACT_DISTANCE = UNICORN_RADIUS - ZEBRA_RADIUS;
  const UNICORN_DISTORTION_BAND = ZEBRA_RADIUS * 0.9;
  const UNICORN_RELEASE_DISTANCE = UNICORN_RADIUS + ZEBRA_RADIUS;
  const UNICORN_SHAPE_POINTS = 72;

  // Reset firstHover on leave
  useEffect(() => {
    if (!isHovered) {
      firstHover.current = true;
    }
  }, [isHovered]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const isInsideRevealArea =
        e.clientX >= rect.left - REVEAL_OUTSET &&
        e.clientX <= rect.right + REVEAL_OUTSET &&
        e.clientY >= rect.top - REVEAL_OUTSET &&
        e.clientY <= rect.bottom + REVEAL_OUTSET;

      setIsHovered(isInsideRevealArea);

      if (!isInsideRevealArea) return;

      targetX.current = x;
      targetY.current = y;

      if (firstHover.current) {
        currentZebraX.current = x;
        currentZebraY.current = y;
        currentUnicornX.current = x;
        currentUnicornY.current = y;
        firstHover.current = false;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [REVEAL_OUTSET]);

  // Main 60fps Animation Tick
  useEffect(() => {
    const tick = () => {
      if (!containerRef.current) {
        animationFrameId.current = requestAnimationFrame(tick);
        return;
      }

      const container = containerRef.current;

      // Exponential fade for mask entry/exit
      const targetGlobalOpacity = isHovered ? 1 : 0;
      maskGlobalOpacity.current += (targetGlobalOpacity - maskGlobalOpacity.current) * 0.15;

      // Zebra follows instantly
      currentZebraX.current = targetX.current;
      currentZebraY.current = targetY.current;

      // Unicorn trails behind beautifully with elastic lag magic
      currentUnicornX.current += (targetX.current - currentUnicornX.current) * UNICORN_LAG;
      currentUnicornY.current += (targetY.current - currentUnicornY.current) * UNICORN_LAG;

      const dx = currentZebraX.current - currentUnicornX.current;
      const dy = currentZebraY.current - currentUnicornY.current;
      const distance = Math.hypot(dx, dy) || 1;
      const directionX = dx / distance;
      const directionY = dy / distance;
      const edgePressure = Math.min(
        1,
        Math.max(0, (distance - UNICORN_EDGE_CONTACT_DISTANCE) / UNICORN_DISTORTION_BAND)
      );
      const separationFade = Math.min(
        1,
        Math.max(0, (UNICORN_RELEASE_DISTANCE - distance) / (ZEBRA_RADIUS * 0.5))
      );
      const targetDistortion = isHovered ? edgePressure * separationFade : 0;
      unicornDistortion.current += (targetDistortion - unicornDistortion.current) * 0.16;

      const wobble = Math.sin(performance.now() * 0.04) * unicornDistortion.current;
      const pull = unicornDistortion.current * 34 + wobble * 8;
      const unicornClipCenterX = currentUnicornX.current + directionX * pull;
      const unicornClipCenterY = currentUnicornY.current + directionY * pull;
      const rippleTime = performance.now() * 0.035;
      const unicornShapePoints = Array.from({ length: UNICORN_SHAPE_POINTS }, (_, index) => {
        const angle = (index / UNICORN_SHAPE_POINTS) * Math.PI * 2;
        const pointX = Math.cos(angle);
        const pointY = Math.sin(angle);
        const alignment = pointX * directionX + pointY * directionY;
        const cross = Math.abs(pointX * directionY - pointY * directionX);
        const contactStretch = Math.exp(-((alignment - 1) ** 2) / 0.18);
        const sideFlatten = Math.exp(-(alignment ** 2) / 0.18) * cross;
        const backTension = Math.max(0, -alignment);
        const contourWave = Math.sin(angle * 4 - rippleTime) * (0.35 + contactStretch);
        const radius =
          UNICORN_RADIUS +
          unicornDistortion.current *
            (contactStretch * 92 - sideFlatten * 68 - backTension * 24 + contourWave * 10);

        return `${unicornClipCenterX + pointX * Math.max(UNICORN_RADIUS * 0.72, radius)}px ${
          unicornClipCenterY + pointY * Math.max(UNICORN_RADIUS * 0.72, radius)
        }px`;
      }).join(', ');

      // Apply coordinates directly to component DOM properties
      container.style.setProperty('--zx', `${currentZebraX.current}px`);
      container.style.setProperty('--zy', `${currentZebraY.current}px`);
      container.style.setProperty('--ux', `${currentUnicornX.current}px`);
      container.style.setProperty('--uy', `${currentUnicornY.current}px`);
      container.style.setProperty('--unicorn-clip', `polygon(${unicornShapePoints})`);
      container.style.setProperty('--mo', `${maskGlobalOpacity.current}`);

      animationFrameId.current = requestAnimationFrame(tick);
    };

    animationFrameId.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isHovered]);

  // Mask string formatting with custom feather values
  const zebraMaskString = `radial-gradient(circle ${ZEBRA_RADIUS}px at var(--zx) var(--zy), rgba(0,0,0,1) ${100 - ZEBRA_SOFTNESS}%, rgba(0,0,0,0) 100%)`;
  const unicornClipPath = `var(--unicorn-clip, circle(${UNICORN_RADIUS}px at var(--ux) var(--uy)))`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden select-none"
    >
      {/* Layer 0: HORSE (Underneath base) */}
      <div className="absolute inset-0 z-10 w-full h-full">
        {!imageErrors.horse ? (
          <img
            src={assetPath('1.jpg')}
            alt="Tier 1: Brown Horse"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover select-none pointer-events-none transition duration-500 brightness-[0.75] contrast-[1.05]"
            onError={() => setImageErrors(prev => ({ ...prev, horse: true }))}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-950/40 via-black to-slate-950 flex flex-col items-center justify-center text-center p-6">
            <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
            <p className="text-sm text-amber-500 font-mono">1.jpg failed to load</p>
          </div>
        )}
      </div>

      {/* Layer 15: Giant Luxury "EQUINE" Typography (Layered above base horse image, but below mask layers) */}
      <div className="absolute inset-x-0 top-[46%] -translate-y-1/2 z-[15] text-center select-none pointer-events-none px-4">
        <h2 className="font-display font-black tracking-[0.24em] text-[13vw] text-slate-100 uppercase mix-blend-difference leading-none select-none drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
          EQUINE
        </h2>
      </div>

      {/* Layer 2: UNICORN (Smooth trailing overlay, behind the zebra reveal) */}
      <div
        className="absolute inset-0 z-20 w-full h-full transition-opacity duration-150"
        style={{
          WebkitClipPath: unicornClipPath,
          clipPath: unicornClipPath,
          opacity: 'var(--mo)',
          pointerEvents: 'none'
        }}
      >
        {!imageErrors.unicorn ? (
          <img
            src={assetPath('3.jpg')}
            alt="Tier 3: Unicorn Lag Reveal"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover select-none pointer-events-none brightness-[0.75] contrast-[1.05]"
            onError={() => setImageErrors(prev => ({ ...prev, unicorn: true }))}
          />
        ) : (
          <div className="w-full h-full bg-purple-950/20 flex flex-col items-center justify-center">
            <p className="text-xs text-slate-500 font-mono">3.jpg not found</p>
          </div>
        )}
      </div>

      {/* Layer 1: ZEBRA (Overlay tracking cursor instantly, above the unicorn reveal) */}
      <div
        className="absolute inset-0 z-30 w-full h-full transition-opacity duration-150"
        style={{
          WebkitMaskImage: zebraMaskString,
          maskImage: zebraMaskString,
          opacity: 'var(--mo)',
          pointerEvents: 'none'
        }}
      >
        {!imageErrors.zebra ? (
          <img
            src={assetPath('2.jpg')}
            alt="Tier 2: Zebra Reveal"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover select-none pointer-events-none brightness-[0.75] contrast-[1.05]"
            onError={() => setImageErrors(prev => ({ ...prev, zebra: true }))}
          />
        ) : (
          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center">
            <p className="text-xs text-slate-500 font-mono">2.jpg not found</p>
          </div>
        )}
      </div>

      {/* Interactive glow ring highlights to define mask boundary */}
      {isHovered && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          {/* Smooth glowing ring for Zebra */}
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 border border-amber-500/10 rounded-full bg-amber-500/[0.012]"
            style={{
              left: 'var(--zx)',
              top: 'var(--zy)',
              width: `${ZEBRA_RADIUS * 2}px`,
              height: `${ZEBRA_RADIUS * 2}px`,
              opacity: 'var(--mo)',
              boxShadow: '0 0 35px rgba(245,158,11,0.03)'
            }}
          />

          {/* Slow trailing glow ring for Unicorn */}
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 border border-purple-500/[0.06] rounded-full bg-purple-500/[0.008]"
            style={{
              left: 'var(--ux)',
              top: 'var(--uy)',
              width: `${UNICORN_RADIUS * 2}px`,
              height: `${UNICORN_RADIUS * 2}px`,
              opacity: 'var(--mo)',
              boxShadow: '0 0 50px rgba(168,85,247,0.04)'
            }}
          />
        </div>
      )}
    </div>
  );
}
