type SupabaseErrorLike = {
  message?: string;
} | null | undefined;

export class SupabaseQueryFailure extends Error {
  readonly publicMessage: string;

  constructor(publicMessage: string, cause: unknown) {
    super(publicMessage, { cause });
    this.name = "SupabaseQueryFailure";
    this.publicMessage = publicMessage;
  }
}

export function assertSupabaseQuerySucceeded(
  error: SupabaseErrorLike,
  context: string,
): asserts error is null | undefined {
  if (!error) return;
  throw new SupabaseQueryFailure(context, error);
}
