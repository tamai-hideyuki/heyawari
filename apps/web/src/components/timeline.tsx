import type { DayReservation } from "../lib/queries.ts";
import { dayRange, formatMinutes, formatTime, TZ } from "../lib/time.ts";

const HOUR_HEIGHT_PX = 64;
const SLOT_MINUTES = 30;
const WORKDAY_START_HOUR = 8;
/** これより低い予約ブロックは、タイトルと時刻を 1 行にまとめる */
const COMPACT_BLOCK_PX = 44;

export type DayLayout = ReturnType<typeof dayLayout>;

/** 1 日分（0〜24 時）の時間軸の寸法。全会議室の列で共通に使い、縦位置をそろえる */
export function dayLayout(date: Temporal.PlainDate) {
  const day = dayRange(date);
  const minutesOf = (z: Temporal.ZonedDateTime) => {
    // 日付をまたぐ予約は、その日の範囲に切り詰めて表示する
    const clipped =
      Temporal.ZonedDateTime.compare(z, day.start) < 0
        ? day.start
        : Temporal.ZonedDateTime.compare(z, day.end) > 0
          ? day.end
          : z;
    return clipped.since(day.start).total("minutes");
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const nowMinutes = minutesOf(Temporal.Now.zonedDateTimeISO(TZ));
  const isToday = nowMinutes > 0 && nowMinutes < 24 * 60;

  return {
    hours,
    height: hours.length * HOUR_HEIGHT_PX,
    minutesOf,
    toPx: (minutes: number) => (minutes / 60) * HOUR_HEIGHT_PX,
    slotStarts: Array.from({ length: (24 * 60) / SLOT_MINUTES }, (_, i) => i * SLOT_MINUTES),
    nowMinutes,
    /** 最初に表示する位置：今日なら今の 1 時間前、それ以外は始業時刻 */
    initialScrollMinutes: isToday
      ? Math.max(0, Math.floor(nowMinutes / 60) - 1) * 60
      : WORKDAY_START_HOUR * 60,
  };
}

export function TimeAxis({ layout }: { layout: DayLayout }) {
  return (
    <div className="relative" style={{ height: layout.height }}>
      {layout.hours.map((h) => (
        <span
          key={h}
          className="absolute left-2 text-xs text-slate-400 tabular-nums"
          style={{ top: layout.toPx(h * 60) + 4 }}
        >
          {String(h).padStart(2, "0")}:00
        </span>
      ))}
    </div>
  );
}

type RoomColumnProps = {
  layout: DayLayout;
  roomName: string;
  reservations: DayReservation[];
  /** 自分の予約を色分けするためのユーザー ID */
  myUserId?: string;
  /** 空き枠が押されたとき。引数はその日の 0:00 からの分数 */
  onSelectSlot: (minutes: number) => void;
  onSelectReservation: (id: string) => void;
};

export function RoomColumn({
  layout,
  roomName,
  reservations,
  myUserId,
  onSelectSlot,
  onSelectReservation,
}: RoomColumnProps) {
  const { toPx, minutesOf } = layout;
  const blocks = reservations.map((r) => ({ ...r, top: minutesOf(r.start), bottom: minutesOf(r.end) }));

  // 終わってしまった枠と、予約で完全に埋まっている枠は押せないようにする
  const slots = layout.slotStarts.filter(
    (m) =>
      m + SLOT_MINUTES > layout.nowMinutes &&
      !blocks.some((b) => b.top <= m && b.bottom >= m + SLOT_MINUTES),
  );

  return (
    <div className="relative" style={{ height: layout.height }}>
      {layout.hours.map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-slate-100 first:border-t-0"
          style={{ top: toPx(h * 60), height: toPx((h + 1) * 60) - toPx(h * 60) }}
        >
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100" />
        </div>
      ))}

      {slots.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onSelectSlot(m)}
          aria-label={`${roomName} ${formatMinutes(m)} から予約する`}
          className="group absolute inset-x-1 rounded-md text-left hover:bg-sky-50 focus-visible:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-500"
          style={{ top: toPx(m) + 1, height: toPx(m + SLOT_MINUTES) - toPx(m) - 2 }}
        >
          <span className="hidden px-2 text-xs text-sky-700 group-hover:inline group-focus-visible:inline">
            ＋ {formatMinutes(m)} から予約
          </span>
        </button>
      ))}

      {blocks.map((b) => {
        const mine = b.userId === myUserId;
        const height = toPx(b.bottom) - toPx(b.top) - 2;
        const time = (
          <span className={`text-xs tabular-nums ${mine ? "text-sky-700" : "text-slate-500"}`}>
            {formatTime(b.start)}–{formatTime(b.end)}
          </span>
        );
        const title = (
          <span className="font-medium">
            {mine && <span className="mr-1 rounded bg-sky-600 px-1 text-xs text-white">自分</span>}
            {b.title}
          </span>
        );
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelectReservation(b.id)}
            className={`absolute inset-x-1 overflow-hidden rounded-md border px-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-sky-500 ${
              height < COMPACT_BLOCK_PX ? "flex items-center" : "py-1"
            } ${
              mine
                ? "border-sky-400 bg-sky-100 text-sky-900 hover:bg-sky-200"
                : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            style={{ top: toPx(b.top) + 1, height }}
            title={`${formatTime(b.start)}–${formatTime(b.end)} ${b.title}（${b.userName}）`}
          >
            {height < COMPACT_BLOCK_PX ? (
              <p className="truncate leading-tight">
                {title} {time}
              </p>
            ) : (
              <>
                <p className="truncate">{title}</p>
                <p className="truncate">{time}</p>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
