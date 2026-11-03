import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DateNav } from "../../components/DateNav.tsx";
import { RoomsDayView } from "../../components/RoomsDayView.tsx";
import { dayAllReservationsQuery, roomsQuery } from "../../lib/queries.ts";
import { parseDate, today, validateDateSearch } from "../../lib/time.ts";

export const Route = createFileRoute("/_authed/")({
  validateSearch: validateDateSearch,
  loaderDeps: ({ search }) => ({ date: search.date }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(roomsQuery),
      context.queryClient.ensureQueryData(dayAllReservationsQuery(parseDate(deps.date) ?? today())),
    ]),
  component: AvailabilityPage,
  pendingComponent: () => <p className="text-slate-500">読み込み中…</p>,
  errorComponent: ({ error }) => (
    <p className="text-red-600">{error instanceof Error ? error.message : "エラーが発生しました"}</p>
  ),
});

function AvailabilityPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const date = parseDate(search.date) ?? today();

  const { data: rooms } = useSuspenseQuery(roomsQuery);
  const { data: reservations } = useSuspenseQuery(dayAllReservationsQuery(date));

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">会議室の空き状況</h1>
      <DateNav date={date} onChange={(d) => navigate({ search: { date: d?.toString() } })} />

      {rooms.length === 0 ? (
        <p className="text-slate-500">会議室が登録されていません</p>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            空いている時間帯を押すと予約できます。会議室名を押すと、その会議室だけを表示します
          </p>
          <RoomsDayView date={date} rooms={rooms} reservations={reservations} />
        </>
      )}
    </section>
  );
}
