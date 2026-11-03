import { formatDate, parseDate } from "../lib/time.ts";

type Props = {
  date: Temporal.PlainDate;
  /** undefined は「今日」 */
  onChange: (date: Temporal.PlainDate | undefined) => void;
};

export function DateNav({ date, onChange }: Props) {
  const button = "rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onChange(date.subtract({ days: 1 }))} className={button}>
        前日
      </button>
      <button type="button" onClick={() => onChange(undefined)} className={button}>
        今日
      </button>
      <button type="button" onClick={() => onChange(date.add({ days: 1 }))} className={button}>
        翌日
      </button>
      <input
        type="date"
        aria-label="日付"
        value={date.toString()}
        onChange={(e) => {
          const picked = parseDate(e.target.value);
          if (picked) onChange(picked);
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      />
      <span className="ml-2 font-medium">{formatDate(date)}</span>
    </div>
  );
}
