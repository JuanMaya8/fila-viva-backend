export const minutesBetween = (from: Date, to: Date): number =>
  Math.max(0, (to.getTime() - from.getTime()) / 60000);

export const round1 = (value: number): number => Math.round(value * 10) / 10;

/** UTC offset in minutes for an IANA time zone at a given instant. */
export function utcOffsetMinutes(timeZone: string, at = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Midnight of the institution's local day, as a UTC instant. */
export function startOfLocalDay(timeZone: string, at = new Date()): Date {
  const offsetMs = utcOffsetMinutes(timeZone, at) * 60000;
  const local = new Date(at.getTime() + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
}
