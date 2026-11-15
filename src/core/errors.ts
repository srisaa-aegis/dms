export type DmsErrorCode = 'read_only' | 'not_found' | 'unsupported' | 'auth' | 'conflict' | 'network' | 'config' | 'unknown';

/** Every source throws this, so the UI can show a sensible message whatever the back-end is. */
export class DmsError extends Error {
  constructor(
    public readonly code: DmsErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DmsError';
  }
}

export function toDmsError(e: unknown, fallback = 'Something went wrong'): DmsError {
  if (e instanceof DmsError) return e;
  return new DmsError('unknown', e instanceof Error && e.message ? e.message : fallback, e);
}
