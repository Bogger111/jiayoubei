import http.client
import json

HOST, PORT = "localhost", 3010
import os
EMAIL, PASSWORD = "admin@jiayoubei.test", os.environ.get("JYB_DEMO_PASSWORD", "demo-password-placeholder")

def call(method, path, body=None, cookie=None):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=30)
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers)
    resp = conn.getresponse()
    data = resp.read().decode()
    set_cookie = resp.getheader("Set-Cookie", "")
    conn.close()
    return resp.status, data, set_cookie

checks = []

# 1. 未登录 → 401
s, _, _ = call("GET", "/api/bootstrap")
checks.append(("未登录访问 bootstrap", s == 401, s))

# 2. 首次设置管理员
s, data, cookie = call("POST", "/api/auth/setup", {"email": EMAIL, "password": PASSWORD, "name": "奕博"})
checks.append(("创建管理员", s == 200 and "jyb_session" in cookie, s))
token = cookie.split(";")[0] if cookie else ""

# 3. 登录后访问 → 200
s, data, _ = call("GET", "/api/bootstrap", cookie=token)
checks.append(("登录后 bootstrap", s == 200 and json.loads(data)["family"]["name"] == "林家", s))

# 4. 重复设置 → 409
s, _, _ = call("POST", "/api/auth/setup", {"email": "x@y.test", "password": PASSWORD})
checks.append(("重复设置被拒", s == 409, s))

# 5. 错误密码 → 401
s, _, _ = call("POST", "/api/auth/login", {"email": EMAIL, "password": "wrong"})
checks.append(("错误密码拒绝", s == 401, s))

# 6. 正确登录 → 200 + cookie
s, _, cookie2 = call("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
checks.append(("正常登录", s == 200 and "jyb_session" in cookie2, s))
token2 = cookie2.split(";")[0]

# 7. 登录后写接口 → 200
s, data, _ = call("PATCH", "/api/tasks/T002", {"status": "in_progress"}, cookie=token2)
checks.append(("登录后写任务", s == 200 and json.loads(data)["status"] == "in_progress", s))

# 8. 登出（吊销会话）
s, _, _ = call("POST", "/api/auth/logout", cookie=token2)
checks.append(("登出", s == 200, s))

# 9. 旧 token 立即失效 → 401
s, _, _ = call("GET", "/api/bootstrap", cookie=token2)
checks.append(("登出后旧会话失效", s == 401, s))

# 10. 登出后再登录 → 200（版本递增不误伤新登录）
s, _, cookie3 = call("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
checks.append(("登出后重新登录", s == 200, s))
token3 = cookie3.split(";")[0]
s, _, _ = call("GET", "/api/bootstrap", cookie=token3)
checks.append(("重新登录后可用", s == 200, s))

ok = True
for name, passed, status in checks:
    print(("PASS" if passed else "FAIL"), name, f"(http {status})")
    ok = ok and passed

print("\nAUTH-FLOW:", "ALL-OK" if ok else "HAS-FAILURES")
raise SystemExit(0 if ok else 1)
