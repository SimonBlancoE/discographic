import { useEffect, useState, type ImgHTMLAttributes } from 'react';

type CoverImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  /** Tried once when `src` fails, e.g. the remote Discogs URL behind a local cover cache miss. */
  fallbackSrc?: string | null;
  placeholderClassName?: string;
};

/**
 * Cover art with a vinyl placeholder. Local cover URLs are always built for a release id even when
 * Discogs has no image (the endpoint then answers 404), so a failed load has to fall back visibly.
 */
function CoverImage({ src, fallbackSrc, alt = '', className, placeholderClassName, ...rest }: CoverImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src || fallbackSrc || null);

  useEffect(() => {
    setCurrentSrc(src || fallbackSrc || null);
  }, [src, fallbackSrc]);

  if (!currentSrc) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-[radial-gradient(circle_at_center,#1e293b_0_16%,#05060a_17%_46%,#1f2937_47%_49%,#05060a_50%)] ${placeholderClassName ?? className ?? ''}`}
      >
        <span className="h-[14%] w-[14%] rounded-full bg-brand-400 opacity-80" />
      </span>
    );
  }

  return (
    <img
      {...rest}
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => setCurrentSrc((failed) => (fallbackSrc && failed !== fallbackSrc ? fallbackSrc : null))}
    />
  );
}

export default CoverImage;
