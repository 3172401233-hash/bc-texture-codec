export class CodecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CodecError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new CodecError(code, message);
}
