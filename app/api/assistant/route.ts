import {apiError,requireSession,unauthorized} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {readObjectBody} from '@/lib/server/request-body';
import {sendAssistantMessage,readAssistantRun,readAssistantConversation,listAssistantConversations} from '@/lib/server/assistant-service';
export async function GET(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();const q=new URL(request.url).searchParams;if(q.has('id'))return privateJson({run:await readAssistantRun(s.user,q.get('id')!)});if(q.has('conversationId'))return privateJson({runs:await readAssistantConversation(s.user,q.get('conversationId')!)});return privateJson({conversations:await listAssistantConversations(s.user)});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();return privateJson({run:await sendAssistantMessage(s.user,await readObjectBody(request))});}catch(e){return apiError(e);}}
