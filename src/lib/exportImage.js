import { toBlob, toJpeg } from 'html-to-image';

function buildProxyUrl(src) {
  try {
    const parsed = new URL(src, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return parsed.toString();
    }
    return `/api/media/proxy-image?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return src;
  }
}

async function prepareClone(node) {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-100000px';
  wrapper.style.top = '0';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.opacity = '0';

  const clone = node.cloneNode(true);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  const images = Array.from(clone.querySelectorAll('img'));
  await Promise.all(images.map((img) => new Promise((resolve) => {
    img.crossOrigin = 'anonymous';
    const nextSrc = buildProxyUrl(img.currentSrc || img.src);
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = nextSrc;
    if (img.complete) resolve();
  })));

  return {
    clone,
    cleanup() {
      wrapper.remove();
    }
  };
}

async function createBlob(node, options = {}) {
  const prepared = await prepareClone(node);

  try {
    const blob = await toBlob(prepared.clone, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#030712',
      ...options
    });

    if (!blob) {
      throw new Error('No se pudo generar la imagen');
    }

    return blob;
  } finally {
    prepared.cleanup();
  }
}

async function createJpegDataUrl(node, options = {}) {
  const prepared = await prepareClone(node);

  try {
    return await toJpeg(prepared.clone, {
      cacheBust: true,
      pixelRatio: 1.6,
      quality: 0.9,
      backgroundColor: '#030712',
      ...options
    });
  } finally {
    prepared.cleanup();
  }
}

export async function downloadNodeAsPng(node, filename) {
  const blob = await createBlob(node);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadNodeAsJpeg(node, filename, options = {}) {
  const dataUrl = await createJpegDataUrl(node, options);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function shareNodeAsPng(node, filename, shareTitle) {
  const blob = await createBlob(node);
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: shareTitle,
      files: [file]
    });
    return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
