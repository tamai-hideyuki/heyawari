import { useState } from "react";
import { ApiError, useCreateReservation } from "../lib/mutations.ts";
import type { DayReservation } from "../lib/queries.ts";
import { atMinutes, dayRange, formatDate, formatMinutes } from "../lib/time.ts";
import { modalDialogClass, useModalDialog } from "./useModalDialog.ts";

const STEP = 15;
const DAY_MINUTES = 24 * 60;
const DEFAULT_LENGTH = 60;

type Props = {
  roomId: string;
  roomName?: string;
  date: Temporal.PlainDate;
  /** 押された枠の開始時刻（その日の 0:00 からの分数） */
  initialStart: number;
  reservations: DayReservation[];
  onClose: () => void;
};

export function ReservationDialog({ roomId, roomName, date, initialStart, reservations, onClose }: Props) {
  const { ref, close } = useModalDialog();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(() => defaultEnd(date, initialStart, reservations));
  const create = useCreateReservation();

  const timeError = end <= start ? "終了時刻は開始時刻より後にしてください" : undefined;
  const canSubmit = title.trim() !== "" && !timeError && !create.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      { roomId, title: title.trim(), start: atMinutes(date, start), end: atMinutes(date, end) },
      { onSuccess: close },
    );
  };

  const error = create.error;
  const select = "rounded-md border border-slate-300 bg-white px-2 py-1";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={modalDialogClass}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">予約する</h2>
          <p className="text-sm text-slate-500">
            {roomName && `${roomName}・`}
            {formatDate(date)}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">タイトル</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              create.reset();
            }}
            maxLength={100}
            placeholder="例：定例ミーティング"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="flex items-end gap-2">
          <label className="space-y-1">
            <span className="block text-sm font-medium">開始</span>
            <select value={start} onChange={(e) => {
                setStart(Number(e.target.value));
                create.reset();
              }} className={select}>
              {range(0, DAY_MINUTES - STEP).map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-1.5">–</span>
          <label className="space-y-1">
            <span className="block text-sm font-medium">終了</span>
            <select value={end} onChange={(e) => {
                setEnd(Number(e.target.value));
                create.reset();
              }} className={select}>
              {range(STEP, DAY_MINUTES).map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {timeError && <p className="text-sm text-red-600">{timeError}</p>}

        {error && (
          <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">{error.message}</p>
            {error instanceof ApiError && error.status === 409 && (
              <p>予約状況を最新にしました。別の時間帯を選んでください。</p>
            )}
            {error instanceof ApiError &&
              error.details.map((d) => (
                <p key={d}>・{d}</p>
              ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {create.isPending ? "予約中…" : "予約する"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

const range = (from: number, to: number) =>
  Array.from({ length: (to - from) / STEP + 1 }, (_, i) => from + i * STEP);

/** 既定の終了時刻：開始から 1 時間後。次の予約や日付の終わりにぶつかるならそこまで */
function defaultEnd(date: Temporal.PlainDate, start: number, reservations: DayReservation[]) {
  const dayStart = dayRange(date).start;
  const nextStart = reservations
    .map((r) => r.start.since(dayStart).total("minutes"))
    .filter((m) => m > start)
    .reduce((a, b) => Math.min(a, b), DAY_MINUTES);
  return Math.min(start + DEFAULT_LENGTH, nextStart);
}
