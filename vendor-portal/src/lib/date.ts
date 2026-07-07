export function formatDay(input: string): string {
  const value = new Date(input);
  return Number.isNaN(value.getTime()) ? input : value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
