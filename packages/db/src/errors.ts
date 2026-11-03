export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const target =
    "cause" in err && typeof err.cause === "object" && err.cause !== null ? err.cause : err;
  return "code" in target && typeof target.code === "string" ? target.code : undefined;
}

export const isExclusionViolation = (err: unknown): boolean => pgErrorCode(err) === "23P01";
