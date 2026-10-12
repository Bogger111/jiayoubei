export function privateJson(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  const vary =
    headers
      .get("Vary")
      ?.split(",")
      .map((value) => value.trim()) ?? [];
  if (!vary.some((value) => value.toLowerCase() === "cookie"))
    vary.push("Cookie");
  headers.set("Vary", vary.join(", "));
  return Response.json(data, { ...init, headers });
}
