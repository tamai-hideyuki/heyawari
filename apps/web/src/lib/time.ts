// 日時はすべて Asia/Tokyo の Temporal で扱い、API との受け渡しだけ ISO 8601 文字列にする
export const TZ = "Asia/Tokyo";

export const today = () => Temporal.Now.plainDateISO(TZ);

/** "YYYY-MM-DD" を PlainDate にする。不正な値なら undefined */
export function parseDate(value: unknown): Temporal.PlainDate | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try {
    return Temporal.PlainDate.from(value, { overflow: "reject" });
  } catch {
    return undefined;
  }
}

/** その日の 0:00 から翌日 0:00 まで（半開区間） */
export function dayRange(date: Temporal.PlainDate) {
  return {
    start: date.toZonedDateTime(TZ),
    end: date.add({ days: 1 }).toZonedDateTime(TZ),
  };
}

/** API に渡す形式（例：2026-11-04T00:00:00+09:00） */
export const toApiString = (z: Temporal.ZonedDateTime) => z.toString({ timeZoneName: "never" });

export const fromApiString = (s: string) => Temporal.Instant.from(s).toZonedDateTimeISO(TZ);

export const formatTime = (z: Temporal.ZonedDateTime) =>
  z.toPlainTime().toString({ smallestUnit: "minute" });

export const formatDate = (d: Temporal.PlainDate) =>
  d.toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

/** その日の 0:00 から minutes 分後の時刻（1440 なら翌日 0:00） */
export const atMinutes = (date: Temporal.PlainDate, minutes: number) =>
  dayRange(date).start.add({ minutes });

/** 分数を "HH:MM" にする（1440 は "24:00"） */
export const formatMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** URL の ?date= を検証する。不正な日付は捨てて「今日」扱いにする */
export const validateDateSearch = (search: Record<string, unknown>): { date?: string } => ({
  date: parseDate(search.date)?.toString(),
});
