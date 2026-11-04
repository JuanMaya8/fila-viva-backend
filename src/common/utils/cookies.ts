/** Minimal Cookie header parser, shared by HTTP guards and the socket gateway. */
export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  if (!header) {
    return {};
  }
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=');
    if (index > 0) {
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      try {
        acc[key] = decodeURIComponent(value);
      } catch {
        acc[key] = value;
      }
    }
    return acc;
  }, {});
}
