import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/I18nContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

const AUTOPLAY_MS = 9000;
const FEATURE_KEYS = ['charts', 'random', 'curate', 'wall', 'export'];

function Pin() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 1v6M3 4l3-3 3 3M6 11v-1" />
    </svg>
  );
}

function ArrowL() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M9 3L5 7l4 4" />
    </svg>
  );
}

function ArrowR() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 3l4 4-4 4" />
    </svg>
  );
}

export default function HeroCarousel() {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragRef = useRef({ startX: 0, active: false });
  const resumeTimerRef = useRef(null);

  const features = FEATURE_KEYS.map((k) => ({
    kicker: t(`dashboard.feature.${k}.kicker`),
    title: t(`dashboard.feature.${k}.title`),
    sub: t(`dashboard.feature.${k}.sub`),
    where: t(`dashboard.feature.${k}.where`),
  }));

  useEffect(() => {
    if (paused || reducedMotion) return undefined;
    const handle = setInterval(() => setIdx((i) => (i + 1) % features.length), AUTOPLAY_MS);
    return () => clearInterval(handle);
  }, [paused, reducedMotion, features.length]);

  useEffect(() => () => {
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current);
    }
  }, []);

  const next = () => setIdx((i) => (i + 1) % features.length);
  const prev = () => setIdx((i) => (i - 1 + features.length) % features.length);

  function queueResume() {
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current);
    }
    resumeTimerRef.current = window.setTimeout(() => setPaused(false), 3000);
  }

  function onPointerDown(event) {
    dragRef.current = { startX: event.clientX, active: true };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPaused(true);
  }

  function finishPointerGesture(event) {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.startX;
    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (dx < -40) next();
    else if (dx > 40) prev();
    queueResume();
  }

  function cancelPointerGesture(event) {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    queueResume();
  }

  const nextFeature = features[(idx + 1) % features.length];

  return (
    <div
      className="feature-carousel"
      onPointerDown={onPointerDown}
      onPointerUp={finishPointerGesture}
      onPointerCancel={cancelPointerGesture}
    >
      <div className="feature-carousel__viewport">
        <div
          className="feature-carousel__track"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {features.map((f, i) => (
            <div key={i} className="feature-carousel__slide">
              <p className="feature-carousel__kicker">{f.kicker}</p>
              <h2 className="feature-carousel__title">{f.title}</h2>
              <p className="feature-carousel__sub">{f.sub}</p>
              <span className="feature-carousel__where"><Pin />{f.where}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="feature-carousel__ticker" aria-live="polite">
        <span className="feature-carousel__ticker-pulse" />
        <span className="feature-carousel__ticker-label">{t('dashboard.feature.nextUp')}</span>
        <span className="feature-carousel__ticker-value">{nextFeature.title}</span>
      </div>

      <div className="feature-carousel__controls">
        <div className="feature-carousel__dots">
          {features.map((_, i) => (
            <button
              key={i}
              type="button"
              className="feature-carousel__dot"
              data-active={i === idx}
              aria-label={t('dashboard.feature.goTo', { title: features[i].title })}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>
        <div className="feature-carousel__arrows">
          <button type="button" className="feature-carousel__arrow" aria-label={t('dashboard.feature.previous')} onClick={prev}><ArrowL /></button>
          <button type="button" className="feature-carousel__arrow" aria-label={t('dashboard.feature.next')} onClick={next}><ArrowR /></button>
        </div>
      </div>
    </div>
  );
}
