/** Thrown values are external to the error handler, including library rejections. */
export function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return undefined;
}
