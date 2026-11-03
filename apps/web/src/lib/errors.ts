/** API のエラーレスポンス（{ error, issues? }）を画面に出せる形にしたもの */
export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function toApiError(res: Response, fallback = "処理に失敗しました"): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const message = typeof obj.error === "string" ? obj.error : fallback;
  const details = Array.isArray(obj.issues)
    ? obj.issues.flatMap((i) => (typeof i?.message === "string" ? [i.message] : []))
    : [];
  return new ApiError(res.status, message, details);
}

export const isUnauthorized = (err: unknown) => err instanceof ApiError && err.status === 401;
