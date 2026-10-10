// Pure redaction helper shared by server diagnostic persistence and automated tests.
export function redact(
  value: unknown,
  secretValues: string[] = [],
  depth = 0,
): unknown {
  if (depth > 12) return "[depth limit]";
  if (typeof value === "string") {
    let text = value;
    for (const secret of secretValues)
      if (secret.length > 5) text = text.replaceAll(secret, "[redacted]");
    try {
      const url = new URL(text);
      if (["http:", "https:"].includes(url.protocol))
        return `${url.protocol}//${url.hostname}/[URL redacted]`;
    } catch {
      /* Ordinary text. */
    }
    return text.length > 8000 ? text.slice(0, 8000) + "[truncated]" : text;
  }
  if (Array.isArray(value))
    return value.slice(0, 100).map((v) => redact(v, secretValues, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, v]) => [
          key,
          /secret|token|authorization|cookie|password|api.?key|prompt|input/i.test(
            key,
          )
            ? "[redacted]"
            : redact(v, secretValues, depth + 1),
        ]),
    );
  return value;
}
