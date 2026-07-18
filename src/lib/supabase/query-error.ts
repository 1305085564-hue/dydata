type SupabaseErrorLike = {
  message?: string;
} | null | undefined;

export class SupabaseQueryFailure extends Error {
  readonly publicMessage: string;
  readonly cause: unknown;

  constructor(publicMessage: string, cause: unknown) {
    super(publicMessage);
    this.name = "SupabaseQueryFailure";
    this.publicMessage = publicMessage;
    this.cause = cause;
  }
}

export function assertSupabaseQuerySucceeded(
  error: SupabaseErrorLike,
  context: string,
): asserts error is null | undefined {
  if (!error) return;
  throw new SupabaseQueryFailure(context, error);
}
