import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const navigate = async (path) =>
  page.evaluate((path) => {
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
try {
  await page.goto(`${baseURL}/members`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "添加成员", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "姓名", exact: true })
    .fill("核实测试成员");
  await dialog.getByRole("textbox", { name: "与户主关系" }).fill("亲属");
  await dialog.getByRole("textbox", { name: "联系电话" }).fill("010-12345678");
  await dialog.getByRole("button", { name: "添加", exact: true }).click();
  const member = page
    .locator(".member-card")
    .filter({ hasText: "核实测试成员" });
  await member.waitFor();
  await member.click();
  await page.getByRole("button", { name: "编辑成员资料" }).click();
  dialog = page.getByRole("dialog");
  assert.equal(
    await dialog.getByRole("textbox", { name: "联系电话" }).inputValue(),
    "010-12345678",
  );
  await dialog.getByRole("textbox", { name: "联系电话" }).fill("");
  await dialog
    .getByRole("textbox", { name: "姓名", exact: true })
    .fill("核实测试成员已修改");
  await dialog.getByRole("button", { name: "保存修改" }).click();
  await page
    .getByRole("heading", { name: "核实测试成员已修改", exact: true, level: 1 })
    .waitFor();
  await navigate("/devices");
  await page.getByRole("button", { name: "添加设备", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "设备名称" }).fill("核实测试设备");
  await dialog.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("heading", { name: "核实测试设备" }).waitFor();
  await navigate("/services");
  await page.getByRole("button", { name: "添加资源", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "资源名称" }).fill("核实测试资源");
  await dialog.getByRole("textbox", { name: "联系方式" }).fill("社区办公处");
  await dialog.getByRole("button", { name: "添加", exact: true }).click();
  const service = page
    .locator(".service-card")
    .filter({ hasText: "核实测试资源" });
  await service.getByRole("button", { name: "核实联系方式" }).click();
  dialog = page.getByRole("dialog");
  assert.equal(
    await dialog.getByRole("button", { name: "保存核实记录" }).isDisabled(),
    true,
  );
  await dialog
    .getByRole("textbox", { name: "核实方式与结果" })
    .fill("演示核实记录：已现场核对地址与联系方式。");
  await dialog.getByRole("button", { name: "保存核实记录" }).click();
  await service.getByText("已核实", { exact: true }).waitFor();
  await navigate("/settings");
  await page.getByRole("switch", { name: "更大的文字" }).click();
  await page.getByRole("button", { name: "编辑家庭资料" }).click();
  dialog = page.getByRole("dialog", { name: "编辑家庭资料" });
  await dialog.getByRole("textbox", { name: "家庭名称" }).fill("核实测试家庭");
  await dialog.getByRole("textbox", { name: "家庭地址" }).fill("");
  await dialog.getByRole("button", { name: "保存资料" }).click();
  await page
    .locator(".settings-facts")
    .getByText("核实测试家庭", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator("html").getAttribute("data-large-text"),
    "true",
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.documentElement.dataset.largeText === "true",
  );
  await page.getByRole("switch", { name: "更大的文字" }).click();
  await navigate("/tasks");
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新建家庭任务" });
  await dialog
    .getByRole("textbox", { name: "任务标题" })
    .fill("现场核实新建任务");
  await dialog
    .getByRole("textbox", { name: "处理说明" })
    .fill("演示时填写联系人和确认结果。");
  await dialog
    .getByRole("combobox", { name: "负责人" })
    .selectOption({ label: "林晓" });
  await dialog.getByRole("combobox", { name: "优先级" }).selectOption("high");
  await dialog.getByRole("button", { name: "创建任务", exact: true }).click();
  await page
    .getByRole("heading", { name: "现场核实新建任务", level: 1 })
    .waitFor();
  await page.getByText("林晓", { exact: true }).first().waitFor();
  await navigate("/ai");
  await page
    .getByRole("textbox", { name: "描述家庭情况" })
    .fill("帮我核实家人的近况，并记录确认结果");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.getByText("已创建演示核实任务", { exact: true }).waitFor();
  await page.getByText("演示分析", { exact: false }).waitFor();
  await page.getByRole("button", { name: /查看任务/ }).click();
  await page.waitForFunction(() =>
    location.pathname.startsWith("/tasks/T_LOCAL_"),
  );
  const generatedTask = new URL(page.url()).pathname;
  await page.getByRole("heading", { name: /核实家庭情况/, level: 1 }).waitFor();
  await navigate("/ai");
  await page.getByRole("button", { name: /新对话/ }).click();
  await navigate(generatedTask);
  await page.getByRole("heading", { name: /核实家庭情况/, level: 1 }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Resource UI verified: additions, edits, evidence, reading preferences and newly generated assistant tasks preserved across conversations.",
  );
} finally {
  await browser.close();
}
