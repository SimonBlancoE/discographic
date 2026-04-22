export function parseJson(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function stringifyJson(value, fallback = []) {
  return JSON.stringify(value ?? fallback);
}
