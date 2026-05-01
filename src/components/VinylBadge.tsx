import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../lib/I18nContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { NamedCountRow } from '../../shared/contracts/dashboardStats.js';
import type { VinylBadgeGenre } from '../lib/types';

const NEUTRAL_BADGE_LABELS = ['DISC 1', 'DISC 2', 'DISC 3', 'DISC 4', 'DISC 5'];
export const VINYL_SPIN_IDLE_DPS = 80;
export const VINYL_SPIN_HOVER_DPS = 124;
const VINYL_SPIN_SMOOTHING_MS = 260;
const GENRE_SWATCHES = [
  'radial-gradient(circle at 30% 30%, #fef3c7, #f59e0b 70%, #78350f)',
  'linear-gradient(135deg, #67e8f9, #a78bfa)',
  'linear-gradient(135deg, #fb7185, #be123c)',
  'radial-gradient(circle at 50% 50%, #fde68a, #ea580c)',
  'linear-gradient(135deg, #94a3b8, #334155)'
];

type BadgeGenreInput = string | NamedCountRow | { name?: string | null } | null | undefined;
type SpinMotionState = {
  angle: number;
  speed: number;
};
type SpinMotionInput = SpinMotionState & {
  targetSpeed: number;
  deltaMs: number;
};

function getGenreName(entry: BadgeGenreInput): string {
  if (typeof entry === 'string') {
    return entry.trim();
  }

  if (entry?.name) {
    return String(entry.name).trim();
  }

  return '';
}

export function buildBadgeGenres(genres: BadgeGenreInput[] = []): VinylBadgeGenre[] {
  const names = genres
    .map(getGenreName)
    .filter(Boolean)
    .slice(0, GENRE_SWATCHES.length);
  const source = names.length ? names : NEUTRAL_BADGE_LABELS;

  return source.map((name, index) => ({
    name,
    bg: GENRE_SWATCHES[index % GENRE_SWATCHES.length]
  }));
}

export function advanceSpinMotion({ angle, speed, targetSpeed, deltaMs }: SpinMotionInput): SpinMotionState {
  const safeDelta = Math.max(0, Math.min(deltaMs, 80));
  const ease = 1 - Math.exp(-safeDelta / VINYL_SPIN_SMOOTHING_MS);
  const nextSpeed = speed + (targetSpeed - speed) * ease;
  const nextAngle = (angle + (nextSpeed * safeDelta) / 1000) % 360;

  return {
    angle: nextAngle < 0 ? nextAngle + 360 : nextAngle,
    speed: nextSpeed
  };
}

export default function VinylBadge({ playing = true, genres = [] }: {
  playing?: boolean;
  genres?: BadgeGenreInput[];
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const recordRef = useRef<HTMLSpanElement | null>(null);
  const motionRef = useRef<SpinMotionState>({ angle: 0, speed: VINYL_SPIN_IDLE_DPS });
  const targetSpeedRef = useRef<number>(VINYL_SPIN_IDLE_DPS);
  const resolvedGenres = useMemo(() => buildBadgeGenres(genres), [genres]);

  useEffect(() => {
    const badge = badgeRef.current;
    const trigger = badge?.closest('.brand-lockup') || badge;
    if (!trigger) return undefined;

    const speedUp = () => {
      targetSpeedRef.current = VINYL_SPIN_HOVER_DPS;
    };
    const slowDown = () => {
      targetSpeedRef.current = VINYL_SPIN_IDLE_DPS;
    };

    trigger.addEventListener('pointerenter', speedUp);
    trigger.addEventListener('pointerleave', slowDown);
    trigger.addEventListener('focusin', speedUp);
    trigger.addEventListener('focusout', slowDown);

    return () => {
      trigger.removeEventListener('pointerenter', speedUp);
      trigger.removeEventListener('pointerleave', slowDown);
      trigger.removeEventListener('focusin', speedUp);
      trigger.removeEventListener('focusout', slowDown);
    };
  }, []);

  useEffect(() => {
    const record = recordRef.current;
    if (!record || reduced) {
      return undefined;
    }

    let frame = 0;
    let previousTime: number | undefined;

    const tick = (time: number) => {
      const deltaMs = previousTime == null ? 16 : time - previousTime;
      previousTime = time;
      motionRef.current = advanceSpinMotion({
        ...motionRef.current,
        targetSpeed: targetSpeedRef.current,
        deltaMs
      });
      record.style.transform = `rotate(${motionRef.current.angle.toFixed(3)}deg)`;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  useEffect(() => {
    if (!playing || reduced) return undefined;
    const handle = setInterval(() => setIdx((i) => (i + 1) % resolvedGenres.length), 2200);
    return () => clearInterval(handle);
  }, [playing, reduced, resolvedGenres.length]);

  useEffect(() => {
    setIdx((current) => (current >= resolvedGenres.length ? 0 : current));
  }, [resolvedGenres.length]);

  return (
    <span
      ref={badgeRef}
      className="vinyl-badge"
      aria-label={t('app.badgeLabel')}
    >
      <span ref={recordRef} className="vinyl-record">
        <span className="vinyl-record__disc" />
        <span className="vinyl-record__grooves" />
        <span className="vinyl-record__shine" />
        <span className="vinyl-record__label">
          {resolvedGenres.map((g, i) => (
            <span
              key={g.name}
              className="vinyl-record__swatch"
              data-active={i === idx}
              style={{ background: g.bg }}
            />
          ))}
        </span>
      </span>
      <span className="vinyl-record__dust" aria-hidden="true" />
    </span>
  );
}
