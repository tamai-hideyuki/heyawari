import { useState } from "react";
import { useCancelReservation } from "../lib/mutations.ts";
import type { DayReservation } from "../lib/queries.ts";
import { formatTime, TZ } from "../lib/time.ts";
import { modalDialogClass, useModalDialog } from "./useModalDialog.ts";

type Props = {
  reservation: DayReservation;
  roomName?: string;
  mine: boolean;
  onClose: () => void;
};

export function ReservationDetailDialog({ reservation: r, roomName, mine, onClose }: Props) {
  const { ref, close } = useModalDialog();
  const [confirming, setConfirming] = useState(false);
  const cancel = useCancelReservation();

  const ended = Temporal.ZonedDateTime.compare(r.end, Temporal.Now.zonedDateTimeISO(TZ)) <= 0;
  const sameDay = r.start.toPlainDate().equals(r.end.toPlainDate());
  const when = sameDay
    ? `${r.start.toPlainDate().toLocaleString("ja-JP", { month: "long", day: "numeric", weekday: "short" })} ${formatTime(r.start)}–${formatTime(r.end)}`
    : `${r.start.toLocaleString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} – ${r.end.toLocaleString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

  const button = "rounded-md px-4 py-2 text-sm";

  return (
    <dialog ref={ref} onClose={onClose} className={modalDialogClass}>
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold break-words">{r.title}</h2>
          <p className="text-sm tabular-nums text-slate-600">{when}</p>
          {roomName && <p className="text-sm text-slate-600">{roomName}</p>}
          <p className="mt-1 text-xs text-slate-500">{mine ? "あなたの予約" : `予約者：${r.userName}`}</p>
        </div>

        {cancel.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {cancel.error.message}
          </p>
        )}

        {mine && ended && <p className="text-sm text-slate-500">終了した予約はキャンセルできません</p>}

        {confirming ? (
          <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">この予約をキャンセルしますか？取り消すことはできません。</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={cancel.isPending}
                className={`${button} border border-slate-300 bg-white hover:bg-slate-100`}
              >
                戻る
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => cancel.mutate({ id: r.id }, { onSuccess: close })}
                disabled={cancel.isPending}
                className={`${button} bg-red-600 font-medium text-white hover:bg-red-700 disabled:opacity-50`}
              >
                {cancel.isPending ? "キャンセル中…" : "キャンセルする"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            {mine && !ended && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={`${button} border border-red-300 text-red-700 hover:bg-red-50`}
              >
                予約をキャンセル
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={close}
              className={`${button} border border-slate-300 hover:bg-slate-100`}
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
