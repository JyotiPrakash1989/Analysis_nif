const HEADER_WORDS = new Set(['SYMBOL', 'SYMBOLS', 'STOCK', 'STOCKS', 'NAME', 'TICKER', 'SCRIP']);

/** Mirror server-side normalizeSymbol in equityWatchlist.mjs */
export function normalizeStockSymbol(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\.NS$|\.BO$/i, '')
    .replace(/[^A-Z0-9&-]/g, '');
}

export function parseStockListText(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const symbols: string[] = [];
  let firstLine = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/[,;\t]/).map((p) => normalizeStockSymbol(p)).filter(Boolean);
    if (!parts.length) continue;

    if (firstLine && parts.length === 1 && HEADER_WORDS.has(parts[0])) {
      firstLine = false;
      continue;
    }
    firstLine = false;
    symbols.push(...parts);
  }

  return [...new Set(symbols)];
}

export async function parseStockListFile(file: File): Promise<string[]> {
  const text = await file.text();
  return parseStockListText(text);
}
