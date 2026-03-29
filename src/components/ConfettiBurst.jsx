import { useEffect } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

const COLORS = ['#fb7185', '#67e8f9', '#fbbf24', '#34d399', '#f9a8d4'];

function pieceStyle(index, reducedMotion) {
  const rotation = -18 + (index * 7);
  const horizontal = ((index % 6) - 2.5) * 32;
  const vertical = 110 + ((index * 17) % 120);
  const delay = index * 24;

  return {
    background: COLORS[index % COLORS.length],
    left: '50%',
    top: '12%',
    animationDuration: reducedMotion ? '1ms' : '1500ms',
    animationDelay: `${delay}ms`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    '--confetti-x': `${horizontal}px`,
    '--confetti-y': `${vertical}px`
  };
}

function ConfettiBurst({ label, onDone }) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const timeoutId = window.setTimeout(onDone, reducedMotion ? 100 : 1800);
    return () => window.clearTimeout(timeoutId);
  }, [onDone, reducedMotion]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full border border-brand-300/30 bg-slate-950/80 px-4 py-2 text-xs uppercase tracking-[0.3em] text-brand-100 shadow-[0_14px_40px_rgba(2,6,23,0.45)] backdrop-blur-xl">
        {label}
      </div>
      {Array.from({ length: 22 }).map((_, index) => (
        <span key={index} className="confetti-piece" style={pieceStyle(index, reducedMotion)} />
      ))}
    </div>
  );
}

export default ConfettiBurst;
