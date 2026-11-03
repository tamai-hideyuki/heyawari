import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DateNav } from "../../components/DateNav.tsx";
import { RoomsDayView } from "../../components/RoomsDayView.tsx";
import { dayReservationsQuery, roomsQuery } from "../../lib/queries.ts";
import { parseDate, today, validateDateSearch } from "../../lib/time.ts";

export const Route = createFileRoute("/_authed/rooms/$roomId")({
  validateSearch: validateDateSearch,
  loaderDeps: ({ search }) => ({ date: search.date }),
  loader: ({ context, params, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(roomsQuery),
      context.queryClient.ensureQueryData(
        dayReservationsQuery(params.roomId, parseDate(deps.date) ?? today()),
      ),
    ]),
  component: RoomDayPage,
  pendingComponent: () => <p className="text-slate-500">読み込み中…</p>,
  errorComponent: ({ error }) => (
    <p className="text-red-600">{error instanceof Error ? error.message : "エラーが発生しました"}</p>
  ),
});

function RoomDayPage() {
  const { roomId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const date = parseDate(search.date) ?? today();

  const { data: rooms } = useSuspenseQuery(roomsQuery);
  const { data: reservations } = useSuspenseQuery(dayReservationsQuery(roomId, date));
  const room = rooms.find((r) => r.id === roomId);

  if (!room) return <p className="text-slate-500">会議室が見つかりません</p>;

  return (
    <section className="space-y-4">
      <div>
        <Link to="/" search={{ date: search.date }} className="text-sm text-sky-700 hover:underline">
          ← 全会議室の空き状況
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{room.name}</h1>
        <p className="text-sm text-slate-500">定員 {room.capacity} 名</p>
      </div>

      <DateNav date={date} onChange={(d) => navigate({ search: { date: d?.toString() } })} />

      <p className="text-sm text-slate-500">
        {reservations.length === 0 ? "この日の予約はありません。" : ""}
        空いている時間帯を押すと予約できます。予約を押すと詳細の確認やキャンセルができます
      </p>
      <RoomsDayView date={date} rooms={[room]} reservations={reservations} showRoomHeaders={false} />
    </section>
  );
}
