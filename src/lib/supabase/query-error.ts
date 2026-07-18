type SupabaseErrorLike = {
  message?: string;
} | null | undefined;

export function assertSupabaseQuerySucceeded(
  error: SupabaseErrorLike,
  context: string,
): asserts error is null | undefined {
  if (!error) return;
  throw new Error(error.message ? `${context}: ${error.message}` : context);
}
