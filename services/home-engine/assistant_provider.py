"""Private model bridge. Tool implementations stay in the authenticated app."""
from __future__ import annotations
import json,urllib.error,urllib.request
import scene_provider as provider

def assistant_turn(family_id,messages,tools):
    key=provider.private_settings(family_id).get('apiKey')
    if not key:raise ValueError('助手服务暂未就绪，请联系管理员')
    if not isinstance(messages,list) or not 1<=len(messages)<=80:raise ValueError('对话上下文过长，请新建对话')
    if not isinstance(tools,list) or len(tools)>16:raise ValueError('助手工具配置无效')
    body={'model':provider.MODEL,'messages':messages,'tools':tools,'tool_choice':'auto','thinking':{'type':'disabled'},'max_tokens':3000,'stream':False}
    encoded=json.dumps(body,ensure_ascii=False).encode('utf-8')
    if len(encoded)>240_000:raise ValueError('对话上下文过长，请新建对话')
    request=urllib.request.Request(provider.API,data=encoded,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method='POST')
    try:
        with provider.OPENER.open(request,timeout=75) as response:result=json.load(response)
    except urllib.error.HTTPError as error:
        messages={400:'助手暂时无法理解这次请求，请换一种表达',401:'助手服务暂时不可用，请联系管理员',402:'助手服务暂时不可用，请联系管理员',403:'助手服务暂时不可用，请联系管理员',429:'助手当前繁忙，请稍后再试'}
        raise ValueError(messages.get(error.code,'助手本次没有取得结果，请稍后再试')) from None
    except (OSError,ValueError):raise ValueError('助手连接未取得确定结果，请稍后核对记录') from None
    choices=result.get('choices') or []
    if not choices or choices[0].get('finish_reason')=='length':raise ValueError('这次安排较复杂，请分成几件事告诉我')
    raw=choices[0].get('message') or {};message={'role':'assistant','content':raw.get('content') or ''}
    if not isinstance(message['content'],str) or len(message['content'])>20000:raise ValueError('助手返回内容无效')
    calls=raw.get('tool_calls') or []
    if len(calls)>8:raise ValueError('这次安排的步骤过多，请分开处理')
    if calls:
        clean=[]
        for call in calls:
            fn=call.get('function') or {}
            if not isinstance(call.get('id'),str) or not isinstance(fn.get('name'),str) or not isinstance(fn.get('arguments'),str) or len(fn['arguments'])>40000:raise ValueError('助手工具请求无效')
            clean.append({'id':call['id'],'type':'function','function':{'name':fn['name'],'arguments':fn['arguments']}})
        message['tool_calls']=clean
    usage={k:v for k,v in (result.get('usage') or {}).items() if k in {'prompt_tokens','completion_tokens','total_tokens'} and isinstance(v,int)}
    return {'message':message,'usage':usage}
