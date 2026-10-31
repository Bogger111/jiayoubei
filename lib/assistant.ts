import type {HomeAction} from './home-control';
export type AssistantArtifact={kind:'memory'|'memory_search'|'device_plan'|'space'|'scene'|'task';id:string;title:string;detail?:string;status?:string};
export type AssistantStep={id:string;tool:string;title:string;status:'running'|'completed'|'failed';detail?:string;startedAt:number;finishedAt?:number};
export type AssistantRun={id:string;conversationId:string;query:string;photoIds:string[];status:'planning'|'running'|'completed'|'failed'|'interrupted';stage:string;reply:string;steps:AssistantStep[];artifacts:AssistantArtifact[];createdAt:number;updatedAt:number;usage?:{total_tokens:number};error?:string};
export type ModelToolCall={id:string;type:'function';function:{name:string;arguments:string}};
export type ModelMessage={role:'system'|'user'|'assistant'|'tool';content:string|null;tool_calls?:ModelToolCall[];tool_call_id?:string};
export const assistantToolTitles:Record<string,string>={family_context:'了解家庭成员',memory_search:'查找家庭记忆',memory_save:'保存家庭记忆',devices_list:'查看设备状态',devices_plan:'安排设备调控',devices_plan_status:'核对执行结果',space_read:'查看家庭空间',space_build:'从照片搭建家庭空间',space_status:'查看空间生成进度',space_apply:'保存家庭空间',space_update:'调整家具布局',family_task:'创建家庭行动'};
const str=(description:string,maxLength=100)=>({type:'string',description,maxLength});
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[])=>({type:'function',function:{name,description,parameters:object(properties,required)}});
export const assistantTools=[
  tool('family_context','读取本家庭成员 ID、称呼、家庭时区和当前时间。创建任务前用于确定负责人。',{}),
  tool('memory_search','检索当前家庭的记忆、习惯、约定。只依据返回记录回答。',{query:str('要查询的问题',600)},['query']),
  tool('memory_save','根据用户意愿保存一条真实的家庭记忆。成功返回记录编号后才可说已记住。',{title:str('短标题',160),content:str('应记住的原始事实，不能推测或添加事实',4000),room:str('可选的房间名称',80)},['title','content']),
  tool('devices_list','读取已部署设备的 ID、房间、当前状态、来源与已授权能力。调控前必须读取，不得编造设备。',{}),
  tool('devices_plan','将用户目标转成一份完整的多设备计划。仅准备计划，等待用户在对话中批准；不要自行批准。将本次所有设备合并到这一次调用。',{title:str('计划名称'),steps:{type:'array',minItems:1,maxItems:12,items:object({deviceId:str('devices_list 返回的实体 ID',160),capability:{type:'string',enum:['turn_on','turn_off','set_brightness','set_cover_position','set_temperature','set_percentage','set_humidity','volume_set','media_play','media_pause']},value:{type:'number',description:'数值由设备能力决定，百分比为0-100，温度为摄氏度；开关动作不填写。'}},['deviceId','capability'])}},['title','steps']),
  tool('devices_plan_status','核对本家庭既有设备计划的批准状态和逐台设备回执。',{id:str('设备计划 ID')},['id']),
  tool('space_read','读取家庭三维布局、房间、家具 ID、全局平面位置、尺寸和材质。调整家具前必须先读取。',{}),
  tool('space_build','用用户已上传的房间照片生成可编辑三维家居。留空 photoIds 使用本轮照片；同一组照片一次请求只提交一次。返回 queued/running 表示已开始，不能说已生成完毕。没有照片时请用户通过输入框加号上传。',{notes:str('用户对房间、摆放、风格和尺寸的要求',1000),photoIds:{type:'array',items:str('用户已上传的照片 ID'),maxItems:12}}),
  tool('space_status','读取指定三维草稿的真实进度、家具与预览信息。',{id:str('场景草稿 ID')},['id']),
  tool('space_apply','用户要求保存时，把已经生成完成的草稿保存为家庭空间，保留之前的布局版本。',{id:str('草稿 ID')},['id']),
  tool('space_update','按用户指令调整当前家庭模型的家具位置、朝向、尺寸或颜色。必须使用 space_read 返回的布局版本及家具 ID，坐标为全局米制平面坐标。',{version:{type:'integer'},changes:{type:'array',minItems:1,maxItems:20,items:object({id:str('家具 ID'),position:{type:'array',items:{type:'number'},minItems:2,maxItems:2},rotation:{type:'number'},params:{type:'object',additionalProperties:{type:'number'}},colors:{type:'object',additionalProperties:{type:'string'}}},['id'])}},['version','changes']),
  tool('family_task','将用户希望安排的事务保存为真实家庭任务，返回待认领任务，不代表已设置自动提醒或已完成。',{title:str('任务标题',200),description:str('具体执行事项',4000),assignee:str('family_context 返回的成员 ID'),dueAt:str('未来截止时间的 ISO8601，可不填写使用30分钟后',50)},['title','description','assignee']),
];
export type DevicePlanArguments={title:string;steps:HomeAction[]};

export function validateAssistantArguments(name:string,input:unknown):asserts input is Record<string,unknown>{
  const definition=assistantTools.find(t=>t.function.name===name);if(!definition)throw new Error('助手未获准使用这项工具');
  const validate=(value:unknown,schema:Record<string,unknown>,path:string)=>{
    if(schema.type==='object'){
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(path+'格式不正确');
      const record=value as Record<string,unknown>,properties=(schema.properties??{}) as Record<string,Record<string,unknown>>;
      for(const key of (schema.required??[]) as string[])if(record[key]===undefined)throw new Error(path+'缺少'+key);
      for(const [key,item]of Object.entries(record)){if(properties[key])validate(item,properties[key],key);else if(schema.additionalProperties===false)throw new Error('不支持的工具参数：'+key);else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')validate(item,schema.additionalProperties as Record<string,unknown>,key);}
    }else if(schema.type==='array'){
      if(!Array.isArray(value)||value.length<Number(schema.minItems??0)||value.length>Number(schema.maxItems??100))throw new Error(path+'数量不正确');for(const item of value)validate(item,schema.items as Record<string,unknown>,path);
    }else if(schema.type==='string'){if(typeof value!=='string'||value.length>Number(schema.maxLength??10000))throw new Error(path+'内容过长或格式错误');}
    else if(schema.type==='number'||schema.type==='integer'){if(typeof value!=='number'||!Number.isFinite(value)||schema.type==='integer'&&!Number.isInteger(value))throw new Error(path+'数值无效');}
    if(Array.isArray(schema.enum)&&!schema.enum.includes(value))throw new Error(path+'不在允许范围');
  };
  validate(input,definition.function.parameters,'工具参数');
}
