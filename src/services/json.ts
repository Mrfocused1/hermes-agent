/**
 * Models often wrap JSON in ```json fences or add a sentence of prose around
 * it. This extracts the JSON payload and parses it, so callers get a clean
 * object regardless of how chatty the model was.
 */
export function parseModelJson<T>(raw: string): T {
  let s = raw.trim();

  // Prefer a fenced ```json ... ``` (or plain ``` ... ```) block if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // Otherwise, if there's leading/trailing prose, slice to the outermost braces.
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }

  return JSON.parse(s) as T;
}
