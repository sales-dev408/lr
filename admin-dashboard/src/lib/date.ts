export function formatDateTime(input: string | null | undefined): string {
  if (!input) return '—';
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) return input;
  return value.toLocaleString();
}

export function formatDay(input: string): string {
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) return input;
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatCurrency(input: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(input);
}

export function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
