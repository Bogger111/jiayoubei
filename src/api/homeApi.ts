import {apiRequest} from './apiClient';
import type {HomeObservation,AgentIntent} from '@/lib/multimodal/core';
import type {HomeProposal} from '@/lib/server/multimodal-service';
import type {FamilyMember,Device,User} from '@/lib/product-models';
export type HomeWorkspace={events:HomeObservation[];proposals:HomeProposal[];members:FamilyMember[];devices:Device[];actor:User;capabilities:{timelineConfigured:boolean;voiceTerminal:string}};
export type HomeCommandResult={events?:HomeObservation[];intent?:AgentIntent;proposal?:HomeProposal;detail?:string};
export const homeApi={read:()=>apiRequest<HomeWorkspace>('/api/multimodal'),command:(input:Record<string,unknown>)=>apiRequest<HomeCommandResult>('/api/multimodal',{method:'POST',body:JSON.stringify(input)}),mcp:(input:Record<string,unknown>)=>apiRequest<Record<string,unknown>>('/api/multimodal/mcp',{method:'POST',body:JSON.stringify(input)})};
