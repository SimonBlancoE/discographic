import { useState } from 'react';
import { useI18n } from '../lib/I18nContext';

function StarRating({ value = 0, onChange, readonly = false, compact = false }) {
  const { t } = useI18n();
  const [hover, setHover] = useState(0);

  return (
    <div className={`flex ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= (hover || value);
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onMouseEnter={() => !readonly && setHover(star)}
            onMouseLeave={() => !readonly && setHover(0)}
            onClick={() => onChange?.(star)}
            className={`transition ${readonly ? 'cursor-default' : 'hover:scale-110'} ${compact ? 'text-lg' : 'text-xl'}`}
            aria-label={`${star} ${t('collection.rating')}`}
          >
            <span className={active ? 'text-amber-300' : 'text-slate-600'}>{active ? '★' : '☆'}</span>
          </button>
        );
      })}
    </div>
  );
}

export default StarRating;
