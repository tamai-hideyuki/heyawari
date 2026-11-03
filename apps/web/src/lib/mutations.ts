import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.ts";
import { toApiError } from "./errors.ts";
import { toApiString } from "./time.ts";

export { ApiError } from "./errors.ts";

type CreateInput = {
  roomId: string;
  title: string;
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
};

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    // 予約者はサーバーがログイン中のユーザーに決めるので、ここでは送らない
    mutationFn: async ({ roomId, title, start, end }: CreateInput) => {
      const res = await api.reservations.$post({
        json: { roomId, title, startAt: toApiString(start), endAt: toApiString(end) },
      });
      if (!res.ok) throw await toApiError(res, "予約に失敗しました");
      return res.json();
    },
    // 成功しても 409（他の人に先に取られた）でも、表示中の予約状況を最新にする
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await api.reservations[":id"].cancel.$post({ param: { id } });
      if (!res.ok) throw await toApiError(res, "キャンセルに失敗しました");
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["reservations"] }),
  });
}
