/** A wait owns its timer/listener and releases both on every settlement path. */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal?.reason); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function deadlineSignal(ms: number, message: string, parents: AbortSignal[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException(message, 'TimeoutError')), ms);
  return {
    signal: AbortSignal.any([...parents, controller.signal]),
    dispose: () => clearTimeout(timer),
  };
}

/** Race also protects bounded callers from adapters that fail to honor AbortSignal. */
export function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
