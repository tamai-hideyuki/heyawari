import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import type { DayReservation, Room } from "../lib/queries.ts";
import { useCurrentUser } from "../lib/useCurrentUser.ts";
import { ReservationDetailDialog } from "./ReservationDetailDialog.tsx";
import { ReservationDialog } from "./ReservationDialog.tsx";
import { dayLayout, RoomColumn, TimeAxis } from "./timeline.tsx";

type Props = {
  date: Temporal.PlainDate;
  rooms: Room[];
  reservations: DayReservation[];
  /** 列の上に会議室名を出すか（会議室ごとのページでは不要） */
  showRoomHeaders?: boolean;
};

/** 会議室を列、時刻を行にした 1 日分の予約表。予約の作成・詳細・キャンセルのダイアログもここで扱う */
export function RoomsDayView({ date, rooms, reservations, showRoomHeaders = true }: Props) {
  const [slot, setSlot] = useState<{ roomId: string; minutes: number }>();
  const [selectedId, setSelectedId] = useState<string>();
  // 一覧の再取得で消えた（他の人にキャンセルされたなど）予約は、ダイアログも閉じる
  const selected = reservations.find((r) => r.id === selectedId);
  const myUserId = useCurrentUser().id;

  const layout = dayLayout(date);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 日付を切り替えたときだけ、その日の見たい時間帯までスクロールする（再取得では動かさない）
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = layout.toPx(layout.initialScrollMinutes);
  }, [date.toString()]);
  const byRoom = Map.groupBy(reservations, (r) => r.roomId);
  const columns = `4rem repeat(${rooms.length}, minmax(10rem, 1fr))`;

  return (
    <>
      {/* 縦横どちらにスクロールしても、時刻の列と会議室名の行は見えたままにする */}
      <div
        ref={scrollRef}
        className="h-[calc(100vh-15rem)] min-h-80 overflow-auto rounded-lg border border-slate-200 bg-white"
      >
        {showRoomHeaders && (
          <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: columns }}>
            <div className="sticky left-0 bg-white" />
            {rooms.map((room) => (
              <Link
                key={room.id}
                to="/rooms/$roomId"
                params={{ roomId: room.id }}
                search={{ date: date.toString() }}
                className="border-l border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                <p className="truncate font-medium">{room.name}</p>
                <p className="text-xs text-slate-500">定員 {room.capacity} 名</p>
              </Link>
            ))}
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div className="sticky left-0 z-10 bg-white">
            <TimeAxis layout={layout} />
          </div>
          {rooms.map((room) => (
            <div key={room.id} className="border-l border-slate-200">
              <RoomColumn
                layout={layout}
                roomName={room.name}
                reservations={byRoom.get(room.id) ?? []}
                myUserId={myUserId}
                onSelectSlot={(minutes) => setSlot({ roomId: room.id, minutes })}
                onSelectReservation={setSelectedId}
              />
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <ReservationDetailDialog
          key={selected.id}
          reservation={selected}
          roomName={rooms.find((r) => r.id === selected.roomId)?.name}
          mine={selected.userId === myUserId}
          onClose={() => setSelectedId(undefined)}
        />
      )}
      {slot && (
        <ReservationDialog
          key={`${date}-${slot.roomId}-${slot.minutes}`}
          roomId={slot.roomId}
          roomName={rooms.find((r) => r.id === slot.roomId)?.name}
          date={date}
          initialStart={slot.minutes}
          reservations={byRoom.get(slot.roomId) ?? []}
          onClose={() => setSlot(undefined)}
        />
      )}
    </>
  );
}
