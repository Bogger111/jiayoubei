import type { AIMessage, RiskLevel } from "@/lib/product-models";
import { apiConfig, apiRequest, mockDelay } from "./apiClient";
import { nonIncidentReply } from "@/lib/agent-guards";
import {isMemoryQuestion,type MemorySearchResult} from '@/lib/home-memory';
import {isHomeControlRequest,type HomeControlPlan,actionDescription} from '@/lib/home-control';
import {homeControlRequest} from './homeControlApi';

export type AgentAnalysis = {
  text: string;
  cardType?: AIMessage["cardType"];
  relatedId?: string;
  safetyNotice: string;
  eventId?: string;
  taskIds?: string[];
  analysisMode?: AIMessage["analysisMode"];
  analysis?: { mode?: "live_model" | "rules_fallback" };
  riskLevel?: RiskLevel;
};

export const agentApi = {
  async analyze(query: string): Promise<AgentAnalysis> {
    const remember=query.match(/^\s*(?:请|帮我)?(?:记住|记一下|记下|保存一条记忆)[：:\s]*([\s\S]*)$/);
    if(remember&&!/摔倒|失联|求救|明火|燃气味|呼吸困难/.test(query)){
      const content=remember[1].replace(/^[：:\s]+/,'').trim();if(!content)return {text:'想让我记住什么？可以告诉我家人的习惯、偏好，或一条重要约定。',analysisMode:'rules_fallback',riskLevel:'normal',safetyNotice:''};const result=await apiRequest<{entry:{id:string}}>('/api/home-memory',{method:'POST',body:JSON.stringify({operation:'add',title:content.slice(0,36),description:content,category:'note'})});
      return {text:'记住了。'+content,cardType:'memory',relatedId:result.entry.id,analysisMode:'rules_fallback',riskLevel:'normal',safetyNotice:''};
    }
    if(/(?:三维|3d|3D|家庭空间|家的模型)/.test(query)&&/(?:建立|搭建|生成|看看|查看|打开|调整|设计)/.test(query)){
      const build=/(?:建立|搭建|生成|设计)/.test(query);return {text:build?'可以。上传几张不同角度的房间照片，我会整理房间和家具，生成后可以一起微调。':'这是当前的家庭空间，可以旋转查看，或打开空间继续调整。',cardType:'space',relatedId:build?'build':'view',analysisMode:'rules_fallback',riskLevel:'normal',safetyNotice:''};
    }
    if(/^帮我安排[：:\s]*$/.test(query))return {text:'想安排哪件事？告诉我希望完成的目标、时间和涉及的家人，我会继续帮你整理。',analysisMode:'rules_fallback',riskLevel:'normal',safetyNotice:''};
    if(isHomeControlRequest(query)){
      const {plan}=await homeControlRequest<{plan:HomeControlPlan}>({operation:'prepare',text:query.slice(0,1000),source:'agent'});
      return {text:'已经整理好本次家庭调控计划：\n'+plan.steps.map((step,i)=>`${i+1}. ${actionDescription(step,step.deviceName)}`).join('\n')+'\n\n查看完整计划，确认后统一执行。',cardType:'device',relatedId:plan.id,analysisMode:'rules_fallback',riskLevel:'normal',safetyNotice:''};
    }
    if(isMemoryQuestion(query)){
      const result=await apiRequest<MemorySearchResult>('/api/home-memory',{method:'POST',body:JSON.stringify({operation:'query',query:query.slice(0,600)})});
      return {text:result.answer+(result.citations.length?'\n\n'+result.citations.map((c,i)=>`[${i+1}] ${c.title} · ${c.source}`).join('\n'):''),riskLevel:'normal',analysisMode:result.generation==='local_model'?'live_model':'rules_fallback',safetyNotice:''};
    }
    if (!apiConfig.useMock) {
      const result = await apiRequest<AgentAnalysis>("/api/agent", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      return { ...result, analysisMode: result.analysis?.mode };
    }
    await mockDelay(420);
    const informationReply = nonIncidentReply(query);
    if (informationReply)
      return {
        text: informationReply,
        analysisMode: "demo",
        riskLevel: "normal",
        safetyNotice: "只有报告现场情况后，才整理核实事项。",
      };
    const highRisk = /开门|陌生人|门锁/.test(query);
    const fireRisk = /烟雾|燃气|明火/.test(query);
    const followup =
      highRisk ||
      fireRisk ||
      /老人|家人|妈妈|爸爸|失联|没有活动|没回|宠物|喂食|帮我|核实|任务|摔倒|异常/.test(
        query,
      );
    return {
      analysisMode: "demo",
      riskLevel:
        highRisk || fireRisk || /摔倒|求救/.test(query)
          ? "critical"
          : "attention",
      text: highRisk
        ? "我已识别到门锁相关高风险场景。可以帮你核对访客信息，但我不会直接开门；下一步必须进入人工授权确认。"
        : fireRisk
          ? "这段描述包含可能的消防风险线索。我会创建演示核实任务，现场情况和后续救援由家人确认。"
          : followup
            ? "我会把这段情况整理成待核实的演示事件与任务，请由家人记录实际确认结果。"
            : "可以描述具体发生的情况和涉及成员，我会帮你整理需要核实的信息。",
      cardType: highRisk ? "authorization" : followup ? "task" : undefined,
      safetyNotice: "高风险操作必须人工确认",
    };
  },
};
