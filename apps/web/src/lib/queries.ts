import { queryOptions } from "@tanstack/react-query";
import { api } from "./api.ts";
import { toApiError } from "./errors.ts";
import { dayRange, fromApiString, toApiString } from "./time.ts";

export const roomsQuery = queryOptions({
  queryKey: ["rooms"],
  queryFn: async () => {
    const res = await api.rooms.$get();
    if (!res.ok) throw await toApiError(res, "会議室の取得に失敗しました");
    return res.json();
  },
});

export type Room = Awaited<ReturnType<NonNullable<typeof roomsQuery.queryFn>>>[number];

const toDayReservations = <T extends { startAt: string; endAt: string }>(rows: T[]) =>
  rows.map((r) => ({ ...r, start: fromApiString(r.startAt), end: fromApiString(r.endAt) }));

// 予約のキャッシュキーはすべて ["reservations", ...] で始める（作成・キャンセル後にまとめて無効化するため）

/** 1 つの会議室の 1 日分 */
export const dayReservationsQuery = (roomId: string, date: Temporal.PlainDate) =>
  queryOptions({
    queryKey: ["reservations", "room", roomId, date.toString()],
    queryFn: async () => {
      const { start, end } = dayRange(date);
      const res = await api.rooms[":roomId"].reservations.$get({
        param: { roomId },
        query: { from: toApiString(start), to: toApiString(end) },
      });
      if (!res.ok) throw await toApiError(res, "予約の取得に失敗しました");
      return toDayReservations(await res.json());
    },
  });

/** 全会議室の 1 日分 */
export const dayAllReservationsQuery = (date: Temporal.PlainDate) =>
  queryOptions({
    queryKey: ["reservations", "all", date.toString()],
    queryFn: async () => {
      const { start, end } = dayRange(date);
      const res = await api.reservations.$get({
        query: { from: toApiString(start), to: toApiString(end) },
      });
      if (!res.ok) throw await toApiError(res, "予約の取得に失敗しました");
      return toDayReservations(await res.json());
    },
  });

export type DayReservation = Awaited<
  ReturnType<NonNullable<ReturnType<typeof dayAllReservationsQuery>["queryFn"]>>
>[number];
