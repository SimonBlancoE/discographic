import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../lib/I18nContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

const DEFAULT_GENRE_NAMES = ['JAZZ', 'ELECTRONIC', 'ROCK', 'SOUL', 'AMBIENT'];
const GENRE_SWATCHES = [
  'radial-gradient(circle at 30% 30%, #fef3c7, #f59e0b 70%, #78350f)',
  'linear-gradient(135deg, #67e8f9, #a78bfa)',
  'linear-gradient(135deg, #fb7185, #be123c)',
  'radial-gradient(circle at 50% 50%, #fde68a, #ea580c)',
  'linear-gradient(135deg, #94a3b8, #334155)'
];

function getGenreName(entry) {
  if (typeof entry === 'string') {
    return entry.trim();
  }

  if (entry?.name) {
    return String(entry.name).trim();
  }

  return '';
}

export function buildBadgeGenres(genres = []) {
  const names = genres
    .map(getGenreName)
    .filter(Boolean)
    .slice(0, GENRE_SWATCHES.length);
  const source = names.length ? names : DEFAULT_GENRE_NAMES;

  return source.map((name, index) => ({
    name,
    bg: GENRE_SWATCHES[index % GENRE_SWATCHES.length]
  }));
}

export default function VinylBadge({ playing = true, genres = [] }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const resolvedGenres = useMemo(() => buildBadgeGenres(genres), [genres]);

  useEffect(() => {
    if (!playing || reduced) return undefined;
    const handle = setInterval(() => setIdx((i) => (i + 1) % resolvedGenres.length), 1600);
    return () => clearInterval(handle);
  }, [playing, reduced, resolvedGenres.length]);

  useEffect(() => {
    setIdx((current) => (current >= resolvedGenres.length ? 0 : current));
  }, [resolvedGenres.length]);

  const caption = resolvedGenres[idx]?.name || DEFAULT_GENRE_NAMES[0];

  return (
    <span
      className="vinyl-badge"
      aria-label={t('app.badgeLabel', { genre: caption })}
      onMouseEnter={() => reduced && setIdx((i) => (i + 1) % resolvedGenres.length)}
    >
      <span className="vinyl-record">
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
      <span className="vinyl-record__caption">{caption}</span>
    </span>
  );
}
