export class ProductInputError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 410 | 502 | 503;
  constructor(message: string, status: 400 | 403 | 404 | 409 | 410 | 502 | 503 = 400) {
    super(message);
    this.name = "ProductInputError";
    this.status = status;
  }
}
