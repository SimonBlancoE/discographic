export function parseJson<T = unknown[]>(value: unknown, fallback: T = [] as T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value as string) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson<T = unknown[]>(value: T | null | undefined, fallback: T = [] as T): string {
  return JSON.stringify(value ?? fallback);
}
