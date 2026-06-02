import React, { useEffect, useRef, useState } from 'react';
import InteractiveRevealBanner from './components/InteractiveRevealBanner';
import { Search, Menu, Send, X } from 'lucide-react';

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path}`;

type ThrowableItemProps = {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'span';
};

type MotionState = {
  x: number;
  y: number;
  rotation: number;
  isDragging: boolean;
};

type SearchProjectileProps = {
  id: number;
  onExit: () => void;
};

type SearchMotionState = MotionState & {
  shakeX: number;
  shakeY: number;
};

type PointerSample = {
  x: number;
  y: number;
  time: number;
};

type MenuLinkMotion = {
  label: string;
  href: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  exitX: number;
  exitY: number;
  startRotation: number;
  targetRotation: number;
  exitRotation: number;
  delay: number;
};

function ThrowableItem({ children, className = '', as = 'span' }: ThrowableItemProps) {
  const elementRef = useRef<HTMLDivElement | HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const pointerHistoryRef = useRef<PointerSample[]>([]);
  const rotationRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const angularVelocityRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const [motion, setMotion] = useState<MotionState>({ x: 0, y: 0, rotation: 0, isDragging: false });

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const stopInertia = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const getBaseBox = (rotation: number) => {
    const element = elementRef.current;
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const width = element.offsetWidth || rect.width;
    const height = element.offsetHeight || rect.height;
    const radians = (rotation * Math.PI) / 180;
    const aabbWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
    const aabbHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));

    return {
      left: rect.left + aabbWidth / 2 - offsetRef.current.x - width / 2,
      top: rect.top + aabbHeight / 2 - offsetRef.current.y - height / 2,
      width,
      height
    };
  };

  const getRotatedBounds = (nextX: number, nextY: number, rotation: number) => {
    const base = getBaseBox(rotation);
    if (!base) {
      return { x: nextX, y: nextY, hitX: false, hitY: false };
    }

    const centerX = base.left + nextX + base.width / 2;
    const centerY = base.top + nextY + base.height / 2;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const halfWidth = base.width / 2;
    const halfHeight = base.height / 2;
    const corners = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight }
    ].map(point => ({
      x: centerX + point.x * cos - point.y * sin,
      y: centerY + point.x * sin + point.y * cos
    }));
    const minCornerX = Math.min(...corners.map(point => point.x));
    const maxCornerX = Math.max(...corners.map(point => point.x));
    const minCornerY = Math.min(...corners.map(point => point.y));
    const maxCornerY = Math.max(...corners.map(point => point.y));

    let adjustedX = nextX;
    let adjustedY = nextY;
    let hitX = false;
    let hitY = false;

    if (minCornerX < 0) {
      adjustedX += -minCornerX;
      hitX = true;
    } else if (maxCornerX > window.innerWidth) {
      adjustedX -= maxCornerX - window.innerWidth;
      hitX = true;
    }

    if (minCornerY < 0) {
      adjustedY += -minCornerY;
      hitY = true;
    } else if (maxCornerY > window.innerHeight) {
      adjustedY -= maxCornerY - window.innerHeight;
      hitY = true;
    }

    return { x: adjustedX, y: adjustedY, hitX, hitY };
  };

  const applyBounds = (nextX: number, nextY: number, rotation = rotationRef.current) => {
    const bounded = getRotatedBounds(nextX, nextY, rotation);
    return {
      x: bounded.x,
      y: bounded.y
    };
  };

  const rememberPointer = (x: number, y: number, time: number) => {
    pointerHistoryRef.current = [...pointerHistoryRef.current, { x, y, time }].filter(
      point => time - point.time <= 140
    );
  };

  const commitThrowVelocity = () => {
    const history = pointerHistoryRef.current;
    const latest = history[history.length - 1];
    if (!latest) return;

    const earliest =
      [...history].reverse().find(point => latest.time - point.time >= 55) ??
      history[0];
    if (!earliest || latest.time === earliest.time) return;

    const elapsed = Math.max(16, latest.time - earliest.time);
    velocityRef.current = {
      x: Math.max(-30, Math.min(30, ((latest.x - earliest.x) / elapsed) * 16)),
      y: Math.max(-30, Math.min(30, ((latest.y - earliest.y) / elapsed) * 16))
    };
    angularVelocityRef.current = Math.max(
      -26,
      Math.min(26, velocityRef.current.x * 0.7 + velocityRef.current.y * 0.25)
    );
  };

  const startInertia = () => {
    stopInertia();

    const tick = () => {
      const element = elementRef.current;
      if (!element) return;

      let attemptedRotation = rotationRef.current + angularVelocityRef.current;
      let nextX = offsetRef.current.x + velocityRef.current.x;
      let nextY = offsetRef.current.y + velocityRef.current.y;
      const bounded = getRotatedBounds(nextX, nextY, attemptedRotation);
      nextX = bounded.x;
      nextY = bounded.y;

      if (bounded.hitX) {
        velocityRef.current.x *= -0.72 - Math.random() * 0.18;
        velocityRef.current.y += (Math.random() - 0.5) * 3.5;
        angularVelocityRef.current += (Math.random() - 0.5) * 10;
        attemptedRotation += angularVelocityRef.current * 0.12;
      }

      if (bounded.hitY) {
        velocityRef.current.y *= -0.72 - Math.random() * 0.18;
        velocityRef.current.x += (Math.random() - 0.5) * 3.5;
        angularVelocityRef.current += (Math.random() - 0.5) * 10;
        attemptedRotation += angularVelocityRef.current * 0.12;
      }

      velocityRef.current.x *= 0.965;
      velocityRef.current.y *= 0.965;
      angularVelocityRef.current *= 0.94;
      rotationRef.current = attemptedRotation;
      offsetRef.current = { x: nextX, y: nextY };

      setMotion(prev => ({
        x: nextX,
        y: nextY,
        rotation: rotationRef.current,
        isDragging: false
      }));

      const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y);
      if (speed > 0.08 || Math.abs(angularVelocityRef.current) > 0.08) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
  };

  const endDrag = (
    shouldThrow: boolean,
    element?: HTMLDivElement | HTMLSpanElement,
    pointerId?: number
  ) => {
    if (!isDraggingRef.current) return;

    if (element && pointerId !== undefined && element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }

    activePointerIdRef.current = null;
    isDraggingRef.current = false;
    setMotion(prev => ({ ...prev, isDragging: false }));

    if (shouldThrow) {
      commitThrowVelocity();
      startInertia();
    } else {
      velocityRef.current = { x: 0, y: 0 };
      angularVelocityRef.current = 0;
    }
  };

  useEffect(() => {
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      endDrag(true, elementRef.current ?? undefined, event.pointerId);
    };

    const cancelStaleDrag = () => endDrag(false);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelStaleDrag();
      }
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', cancelStaleDrag);
    window.addEventListener('blur', cancelStaleDrag);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', cancelStaleDrag);
      window.removeEventListener('blur', cancelStaleDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement | HTMLSpanElement>) => {
    if (event.button !== 0) return;

    stopInertia();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y
    };
    const now = performance.now();
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now };
    pointerHistoryRef.current = [{ x: event.clientX, y: event.clientY, time: now }];
    velocityRef.current = { x: 0, y: 0 };
    angularVelocityRef.current = 0;
    rotationRef.current = motion.rotation;
    hasDraggedRef.current = false;
    isDraggingRef.current = true;
    activePointerIdRef.current = event.pointerId;
    setMotion(prev => ({ ...prev, isDragging: true }));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement | HTMLSpanElement>) => {
    if (!isDraggingRef.current) return;

    if (event.buttons === 0) {
      endDrag(false, event.currentTarget, event.pointerId);
      return;
    }

    const now = performance.now();
    const elapsed = Math.max(16, now - lastPointerRef.current.time);
    const nextRotation = rotationRef.current + angularVelocityRef.current * 0.18;
    const nextOffset = applyBounds(
      dragStartRef.current.offsetX + event.clientX - dragStartRef.current.x,
      dragStartRef.current.offsetY + event.clientY - dragStartRef.current.y,
      nextRotation
    );
    const dx = event.clientX - lastPointerRef.current.x;
    const dy = event.clientY - lastPointerRef.current.y;
    const totalDragDistance = Math.hypot(
      event.clientX - dragStartRef.current.x,
      event.clientY - dragStartRef.current.y
    );

    velocityRef.current = {
      x: (dx / elapsed) * 16,
      y: (dy / elapsed) * 16
    };
    rememberPointer(event.clientX, event.clientY, now);
    hasDraggedRef.current = hasDraggedRef.current || totalDragDistance > 6;
    angularVelocityRef.current = Math.max(-18, Math.min(18, velocityRef.current.x * 0.7 + velocityRef.current.y * 0.25));
    rotationRef.current = nextRotation;
    offsetRef.current = nextOffset;
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now };

    setMotion(prev => ({
      x: nextOffset.x,
      y: nextOffset.y,
      rotation: rotationRef.current,
      isDragging: true
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement | HTMLSpanElement>) => {
    endDrag(true, event.currentTarget, event.pointerId);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement | HTMLSpanElement>) => {
    endDrag(false, event.currentTarget, event.pointerId);
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement | HTMLSpanElement>) => {
    if (!hasDraggedRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    hasDraggedRef.current = false;
  };

  const Component = as;

  return (
    <Component
      ref={elementRef as never}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={handleClickCapture}
      onDragStartCapture={event => event.preventDefault()}
      className={`relative inline-flex touch-none will-change-transform ${motion.isDragging ? 'z-[80] cursor-grabbing' : 'cursor-grab'} ${className}`}
      style={{
        transform: `translate3d(${motion.x}px, ${motion.y}px, 0) rotate(${motion.rotation}deg)`,
        transformOrigin: 'center',
        transition: motion.isDragging ? 'none' : undefined
      }}
    >
      {children}
    </Component>
  );
}

function SearchProjectile({ id, onExit }: SearchProjectileProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const pointerHistoryRef = useRef<PointerSample[]>([]);
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const angularVelocityRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const isFleeingRef = useRef(false);
  const fleeChargeRef = useRef(0);
  const errorShakeRef = useRef(0);
  const [query, setQuery] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'error' | 'success'>('idle');
  const [motion, setMotion] = useState<SearchMotionState>({
    x: window.innerWidth / 2 - 150,
    y: window.innerHeight + 90,
    rotation: 0,
    isDragging: false,
    shakeX: 0,
    shakeY: 0
  });

  const stopAnimation = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const getBounds = () => {
    const rect = elementRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 300;
    const height = rect?.height ?? 48;
    const visibleFraction = 0.28;

    return {
      minX: -width * (1 - visibleFraction),
      minY: -height * (1 - visibleFraction),
      maxX: window.innerWidth - width * visibleFraction,
      maxY: window.innerHeight - height * visibleFraction,
      width,
      height
    };
  };

  const rememberPointer = (x: number, y: number, time: number) => {
    pointerHistoryRef.current = [...pointerHistoryRef.current, { x, y, time }].filter(
      point => time - point.time <= 140
    );
  };

  const commitThrowVelocity = () => {
    const history = pointerHistoryRef.current;
    const latest = history[history.length - 1];
    if (!latest) return;

    const earliest =
      [...history].reverse().find(point => latest.time - point.time >= 55) ??
      history[0];
    if (!earliest || latest.time === earliest.time) return;

    const elapsed = Math.max(16, latest.time - earliest.time);
    velocityRef.current = {
      x: Math.max(-30, Math.min(30, ((latest.x - earliest.x) / elapsed) * 16)),
      y: Math.max(-30, Math.min(30, ((latest.y - earliest.y) / elapsed)  * 16))
    };
    angularVelocityRef.current = Math.max(
      -24,
      Math.min(24, velocityRef.current.x * 0.55 + velocityRef.current.y * 0.2)
    );
  };

  const startMotion = (allowBounce: boolean) => {
    stopAnimation();

    const tick = () => {
      const bounds = getBounds();
      let nextX = offsetRef.current.x + velocityRef.current.x;
      let nextY = offsetRef.current.y + velocityRef.current.y;
      let shakeX = 0;
      let shakeY = 0;

      if (fleeChargeRef.current > 0) {
        fleeChargeRef.current -= 1;
        shakeX = (Math.random() - 0.5) * 10;
        shakeY = (Math.random() - 0.5) * 6;
        angularVelocityRef.current += (Math.random() - 0.5) * 5;

        if (fleeChargeRef.current === 0) {
          const exitSide = Math.random() > 0.5 ? 1 : -1;
          velocityRef.current = {
            x: exitSide * (22 + Math.random() * 14),
            y: -8 - Math.random() * 10
          };
          angularVelocityRef.current = exitSide * (14 + Math.random() * 12);
        }
      } else if (isFleeingRef.current) {
        velocityRef.current.x *= 1.018;
        velocityRef.current.y *= 1.012;
      } else if (errorShakeRef.current > 0) {
        errorShakeRef.current -= 1;
        shakeX = (Math.random() - 0.5) * 12;
        shakeY = (Math.random() - 0.5) * 6;
        velocityRef.current = { x: 0, y: 0 };
        angularVelocityRef.current = 0;

        if (errorShakeRef.current === 0) {
          setSubmitState('idle');
        }
      } else if (allowBounce) {
        if (nextX < bounds.minX || nextX > bounds.maxX) {
          nextX = Math.min(bounds.maxX, Math.max(bounds.minX, nextX));
          velocityRef.current.x *= -0.72 - Math.random() * 0.2;
          velocityRef.current.y += (Math.random() - 0.5) * 4;
          angularVelocityRef.current += (Math.random() - 0.5) * 12;
        }

        if (nextY < bounds.minY || nextY > bounds.maxY) {
          nextY = Math.min(bounds.maxY, Math.max(bounds.minY, nextY));
          velocityRef.current.y *= -0.72 - Math.random() * 0.2;
          velocityRef.current.x += (Math.random() - 0.5) * 4;
          angularVelocityRef.current += (Math.random() - 0.5) * 12;
        }

        velocityRef.current.x *= 0.965;
        velocityRef.current.y *= 0.965;
        angularVelocityRef.current *= 0.94;
      }

      offsetRef.current = { x: nextX, y: nextY };
      setMotion(prev => ({
        x: nextX,
        y: nextY,
        rotation: prev.rotation + angularVelocityRef.current,
        isDragging: false,
        shakeX,
        shakeY
      }));

      const isOffscreen =
        nextX < -bounds.width - 80 ||
        nextX > window.innerWidth + 80 ||
        nextY < -bounds.height - 80 ||
        nextY > window.innerHeight + 120;
      const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y);

      if (isFleeingRef.current && isOffscreen) {
        frameRef.current = null;
        onExit();
        return;
      }

      if (isFleeingRef.current || fleeChargeRef.current > 0 || speed > 0.08 || Math.abs(angularVelocityRef.current) > 0.08) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const width = 300;
    const startX = Math.max(16, Math.min(window.innerWidth - width - 16, Math.random() * (window.innerWidth - width)));
    const startY = window.innerHeight + 90;
    const landingX = Math.max(24, Math.min(window.innerWidth - width - 24, Math.random() * (window.innerWidth - width)));
    const landingY = 120 + Math.random() * Math.max(120, window.innerHeight - 320);

    offsetRef.current = { x: startX, y: startY };
    velocityRef.current = {
      x: (landingX - startX) / 34,
      y: (landingY - startY) / 34
    };
    angularVelocityRef.current = (Math.random() - 0.5) * 8;
    setMotion(prev => ({ ...prev, x: startX, y: startY, rotation: (Math.random() - 0.5) * 18 }));
    startMotion(true);

    return stopAnimation;
  }, [id]);

  const endDrag = (shouldThrow: boolean, element?: HTMLDivElement, pointerId?: number) => {
    if (!isDraggingRef.current) return;

    if (element && pointerId !== undefined && element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }

    activePointerIdRef.current = null;
    isDraggingRef.current = false;
    setMotion(prev => ({ ...prev, isDragging: false }));

    if (shouldThrow) {
      commitThrowVelocity();
      startMotion(true);
    } else {
      velocityRef.current = { x: 0, y: 0 };
      angularVelocityRef.current = 0;
    }
  };

  useEffect(() => {
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      endDrag(true, elementRef.current ?? undefined, event.pointerId);
    };
    const cancelDrag = () => endDrag(false);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelDrag();
      }
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('blur', cancelDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isFleeingRef.current) return;

    stopAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y
    };
    const now = performance.now();
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now };
    pointerHistoryRef.current = [{ x: event.clientX, y: event.clientY, time: now }];
    velocityRef.current = { x: 0, y: 0 };
    angularVelocityRef.current = 0;
    activePointerIdRef.current = event.pointerId;
    isDraggingRef.current = true;
    setMotion(prev => ({ ...prev, isDragging: true }));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    if (event.buttons === 0) {
      endDrag(false, event.currentTarget, event.pointerId);
      return;
    }

    const bounds = getBounds();
    const now = performance.now();
    const elapsed = Math.max(16, now - lastPointerRef.current.time);
    const nextX = Math.min(
      bounds.maxX,
      Math.max(bounds.minX, dragStartRef.current.offsetX + event.clientX - dragStartRef.current.x)
    );
    const nextY = Math.min(
      bounds.maxY,
      Math.max(bounds.minY, dragStartRef.current.offsetY + event.clientY - dragStartRef.current.y)
    );
    const dx = event.clientX - lastPointerRef.current.x;
    const dy = event.clientY - lastPointerRef.current.y;

    velocityRef.current = {
      x: (dx / elapsed) * 16,
      y: (dy / elapsed) * 16
    };
    rememberPointer(event.clientX, event.clientY, now);
    angularVelocityRef.current = Math.max(-18, Math.min(18, velocityRef.current.x * 0.55 + velocityRef.current.y * 0.2));
    offsetRef.current = { x: nextX, y: nextY };
    lastPointerRef.current = { x: event.clientX, y: event.clientY, time: now };

    setMotion(prev => ({
      x: nextX,
      y: nextY,
      rotation: prev.rotation + angularVelocityRef.current * 0.14,
      isDragging: true,
      shakeX: 0,
      shakeY: 0
    }));
  };

  const launchAway = () => {
    if (isFleeingRef.current) return;

    if (!query.trim()) {
      setSubmitState('error');
      isFleeingRef.current = false;
      fleeChargeRef.current = 0;
      errorShakeRef.current = 22;
      velocityRef.current = { x: 0, y: 0 };
      angularVelocityRef.current = 0;
      startMotion(false);
      return;
    }

    setSubmitState('success');
    isFleeingRef.current = true;
    isDraggingRef.current = false;
    fleeChargeRef.current = 18;
    velocityRef.current = { x: 0, y: 0 };
    angularVelocityRef.current = 0;
    startMotion(false);
  };

  const stateClass =
    submitState === 'error'
      ? 'border-red-400/80 bg-red-950/80 shadow-[0_18px_70px_rgba(248,113,113,0.35)]'
      : submitState === 'success'
        ? 'border-emerald-400/80 bg-emerald-950/80 shadow-[0_18px_70px_rgba(52,211,153,0.32)]'
        : 'border-white/20 bg-black/75 shadow-[0_18px_60px_rgba(0,0,0,0.45)]';

  return (
    <div
      ref={elementRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => endDrag(true, event.currentTarget, event.pointerId)}
      onPointerCancel={event => endDrag(false, event.currentTarget, event.pointerId)}
      onDragStartCapture={event => event.preventDefault()}
      className={`absolute z-[70] flex w-[300px] items-center gap-2 rounded-md border px-3 py-2 text-white backdrop-blur-md touch-none will-change-transform transition-colors duration-150 ${stateClass} ${
        motion.isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{
        transform: `translate3d(${motion.x + motion.shakeX}px, ${motion.y + motion.shakeY}px, 0) rotate(${motion.rotation}deg)`,
        transformOrigin: 'center'
      }}
    >
      <Search className="h-4 w-4 shrink-0 text-white/70" />
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        onPointerDown={event => event.stopPropagation()}
        placeholder="Search"
        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
      />
      <button
        draggable={false}
        onPointerDown={event => event.stopPropagation()}
        onClick={launchAway}
        className="grid h-7 w-7 shrink-0 place-items-center rounded border border-white/15 text-white/80 transition hover:border-white/40 hover:text-white"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const createMenuLinkMotions = (): MenuLinkMotion[] => {
  const links = [
    { label: 'Home', href: '#home' },
    { label: 'Gallery', href: '#gallery' },
    { label: 'Contact', href: '#contact' }
  ];
  const centerX = window.innerWidth / 2;
  const topY = 35;
  const gap = window.innerWidth < 640 ? 74 : 96;

  return links.map((link, index) => {
    const slotOffset = (index - 1) * gap;
    const targetX = centerX + slotOffset + (Math.random() - 0.5) * 26;
    const exitDirection = Math.random() > 0.5 ? 1 : -1;

    return {
      ...link,
      startX: targetX + (Math.random() - 0.5) * 80,
      startY: -70 - Math.random() * 70,
      targetX,
      targetY: topY + (Math.random() - 0.5) * 12,
      exitX: targetX + exitDirection * (90 + Math.random() * 180),
      exitY: -90 - Math.random() * 110,
      startRotation: (Math.random() - 0.5) * 70,
      targetRotation: (Math.random() - 0.5) * 10,
      exitRotation: exitDirection * (55 + Math.random() * 120),
      delay: index * 70 + Math.random() * 80
    };
  });
};

function FlyingMenuLinks({ isOpen, onExited }: { isOpen: boolean; onExited: () => void }) {
  const [links, setLinks] = useState<MenuLinkMotion[]>(() => createMenuLinkMotions());
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering');

  useEffect(() => {
    if (isOpen) {
      setLinks(createMenuLinkMotions());
      setPhase('entering');
      const frame = requestAnimationFrame(() => setPhase('open'));
      return () => cancelAnimationFrame(frame);
    }

    setLinks(current =>
      current.map(link => {
        const exitDirection = Math.random() > 0.5 ? 1 : -1;

        return {
          ...link,
          exitX: link.targetX + exitDirection * (90 + Math.random() * 180),
          exitY: -90 - Math.random() * 130,
          exitRotation: exitDirection * (60 + Math.random() * 140),
          delay: Math.random() * 120
        };
      })
    );
    setPhase('closing');
    const timeout = window.setTimeout(onExited, 820);
    return () => window.clearTimeout(timeout);
  }, [isOpen, onExited]);

  return (
    <nav className="absolute inset-0 z-[60] pointer-events-none font-sans text-xs tracking-widest uppercase font-medium">
      {links.map(link => {
        const x = phase === 'entering' ? link.startX : phase === 'closing' ? link.exitX : link.targetX;
        const y = phase === 'entering' ? link.startY : phase === 'closing' ? link.exitY : link.targetY;
        const rotation =
          phase === 'entering' ? link.startRotation : phase === 'closing' ? link.exitRotation : link.targetRotation;

        return (
          <a
            key={link.label}
            href={link.href}
            className="absolute left-0 top-0 pointer-events-auto whitespace-nowrap text-[#a3a3a3] transition-[color,transform] duration-[720ms] ease-[cubic-bezier(.18,.9,.22,1.18)] hover:text-white"
            style={{
              transform: `translate3d(${x}px, ${y}px, 0) translateX(-50%) rotate(${rotation}deg)`,
              transitionDelay: `${link.delay}ms`
            }}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}

export default function App() {
  const [searchProjectileId, setSearchProjectileId] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  const toggleMenu = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false);
      return;
    }

    setIsMenuVisible(true);
    setIsMenuOpen(true);
  };

  return (
    <div className="relative w-screen h-screen bg-black text-white font-sans overflow-hidden select-none">
      
      {/* 1. Underlying Interactive Canvas layers (Fully handles the 3 layered horse-zebra-unicorn images) */}
      <div className="absolute inset-0 z-0">
        <InteractiveRevealBanner />
      </div>

      {searchProjectileId !== null && (
        <SearchProjectile
          id={searchProjectileId}
          onExit={() => setSearchProjectileId(null)}
        />
      )}

      {isMenuVisible && (
        <FlyingMenuLinks
          isOpen={isMenuOpen}
          onExited={() => setIsMenuVisible(false)}
        />
      )}

      {/* 2. Top Navigation Layer (Laid absolutely on top of the banner at z-50) */}
      <header className="absolute top-0 inset-x-0 z-50 px-6 py-6 md:px-12 md:py-8 flex items-center justify-between">
        {/* Left Side Logo */}
        <ThrowableItem as="div" className="flex items-center">
          <img
            src={assetPath('threefold-logo-quiver.svg')}
            alt="Threefold"
            draggable={false}
            className="h-7 w-auto select-none pointer-events-none"
          />
        </ThrowableItem>

        {/* Right Side Search & Hamburger Menu */}
        <div className="flex items-center gap-6 text-[#d4d4d4]">
          <button
            className="hover:text-white transition duration-200 cursor-pointer"
            onClick={() => setSearchProjectileId(Date.now())}
          >
            <Search className="w-4 h-4 stroke-[2.5]" />
          </button>
          <button
            className="hover:text-white transition duration-200 cursor-pointer"
            onClick={toggleMenu}
          >
            {isMenuOpen ? (
              <X className="w-5 h-5 stroke-[2.5]" />
            ) : (
              <Menu className="w-5 h-5 stroke-[2.5]" />
            )}
          </button>
        </div>
      </header>

      {/* 4. Bottom Row Indicators */}
      <footer className="absolute bottom-6 inset-x-0 z-50 px-6 md:px-12 flex items-center justify-between font-sans text-xs tracking-wider uppercase">
        {/* Bottom Left CTA */}
        <ThrowableItem>
          <span className="text-white border-b border-white pb-1 font-medium">
            @ibexdream
          </span>
        </ThrowableItem>
      </footer>

    </div>
  );
}
