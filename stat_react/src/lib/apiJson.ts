/** Safe JSON parse for fetch responses (avoids "Unexpected end of JSON input"). */
export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
