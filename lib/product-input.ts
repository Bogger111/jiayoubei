export class ProductInputError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 410;
  constructor(message: string, status: 400 | 403 | 404 | 409 | 410 = 400) {
    super(message);
    this.name = "ProductInputError";
    this.status = status;
  }
}
