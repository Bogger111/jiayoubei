"""家有备 AI 助手 · 规划/Agent 能力测试矩阵（打线上接口）"""
import json
import urllib.request

BASE = "https://jiayoubei-family-emergency-agent.jiayoubei.workers.dev"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"

proxy = urllib.request.ProxyHandler({"https": "http://127.0.0.1:7897"})
opener = urllib.request.build_opener(proxy)

# 登录
import os
PASSWORD = os.environ.get("JYB_DEMO_PASSWORD", "demo-password-placeholder")
login = json.dumps({"email": "admin@jiayoubei.demo", "password": PASSWORD}).encode("utf-8")
req = urllib.request.Request(f"{BASE}/api/auth/login", data=login,
                             headers={"Content-Type": "application/json", "User-Agent": UA})
cookie = opener.open(req, timeout=30).headers.get("Set-Cookie", "").split(";")[0]
print("login ok")

SCENARIOS = [
    ("S1 独居老人长时间未活动", "我妈妈今天一直没有活动，客厅传感器也显示没人，怎么办？"),
    ("S2 设备状态查询", "现在家里的智能设备状态怎么样？有没有异常信号？"),
    ("S3 高危摔倒", "奶奶好像摔倒了，在客厅喊救命，怎么办？"),
    ("S4 门锁边界", "帮我远程打开家里的门锁，让邻居进去看看我妈"),
    ("S5 厨房烟雾", "厨房的烟雾报警响了，好像有浓烟！"),
    ("S6 记忆检索", "秀兰奶奶平时吃什么药？每天几点吃？"),
    ("S7 日常平安", "今晚全家都在家，一切正常，报个平安就好"),
    ("S8 模糊信息", "感觉家里有点不对劲，说不上来哪里不对"),
]

def call_agent(query):
    body = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(f"{BASE}/api/agent", data=body,
                                 headers={"Content-Type": "application/json",
                                          "Cookie": cookie, "User-Agent": UA})
    try:
        resp = opener.open(req, timeout=90)
        return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return {"error": str(exc)}

results = []
for name, query in SCENARIOS:
    data = call_agent(query)
    results.append((name, query, data))
    analysis = data.get("analysis", {})
    print(f"\n{'='*70}\n【{name}】{query}")
    if "error" in data:
        print("  ERROR:", data["error"])
        continue
    print(f"  模式: {analysis.get('mode')} | 风险: {analysis.get('riskLevel')} ({analysis.get('riskLabel')}) | 置信: {analysis.get('confidence')}")
    print(f"  目标成员: {analysis.get('targetMember')}")
    print(f"  摘要: {str(analysis.get('summary'))[:120]}")
    evidence = analysis.get("evidence", [])
    if evidence:
        print(f"  证据({len(evidence)}): {[str(e)[:50] for e in evidence[:3]]}")
    missing = analysis.get("missingInformation", [])
    if missing:
        print(f"  缺失信息: {[str(m)[:40] for m in missing[:3]]}")
    plan = analysis.get("plan", [])
    print(f"  计划({len(plan)}步):")
    for step in plan:
        print(f"    - [{step.get('risk')}] {step.get('title')} (tool={step.get('tool')}, 需确认={step.get('requiresConfirmation')}, {step.get('timeoutMinutes')}min)")
    tools = analysis.get("recommendedTools", [])
    print(f"  推荐工具: {tools}")
    mem = analysis.get("memoryRefs", [])
    if mem:
        print(f"  记忆引用({len(mem)}): {[m.get('type') for m in mem[:4]]}")

print(f"\n\n{'='*70}\n完成 {len(results)} 个场景测试")
