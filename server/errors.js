export class RelayError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.details = details;
  }
}

export function asRelayError(error, fallbackCode = "INTERNAL_ERROR") {
  if (error instanceof RelayError) return error;
  return new RelayError(fallbackCode, error instanceof Error ? error.message : String(error));
}

