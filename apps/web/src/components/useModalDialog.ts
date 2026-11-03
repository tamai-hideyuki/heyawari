import { useEffect, useRef } from "react";

export const modalDialogClass =
  "m-auto w-full max-w-md rounded-lg p-0 shadow-xl backdrop:bg-slate-900/40";

/** 表示されたらすぐ showModal() する <dialog> 用。閉じると onClose（dialog の close イベント）が呼ばれる */
export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return { ref, close: () => ref.current?.close() };
}
