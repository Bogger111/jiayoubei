import { privateJson } from "@/lib/server/json-response";
import { previewInvitation } from "@/lib/server/family-invitations";
import { apiError } from "@/lib/server/session";
import { readObjectBody } from "@/lib/server/request-body";
export async function POST(request: Request) {
  try {
    return privateJson(await previewInvitation(await readObjectBody(request)));
  } catch (cause) {
    return apiError(cause);
  }
}
