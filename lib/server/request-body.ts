import { ProductInputError } from "@/lib/product-input";

export async function readObjectBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ProductInputError("请提供有效的 JSON 数据");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ProductInputError("请求内容应为一个对象");
  return body as Record<string, unknown>;
}

export function inputText(
  value: unknown,
  label: string,
  maxLength = 100,
  optional = false,
) {
  if (optional && (value === undefined || value === null)) return "";
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > maxLength
  )
    throw new ProductInputError(`${label}格式不正确`);
  return value.trim();
}
