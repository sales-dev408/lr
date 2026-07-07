export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = 'api_error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
