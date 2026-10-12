import { ProductInputError } from "./product-input.ts";
import type { DeviceKind } from "./product-models.ts";

function text(value: unknown, label: string, required = false, limit = 200) {
  if (value === undefined || value === null) {
    if (required) throw new ProductInputError(`请填写${label}`);
    return "";
  }
  if (
    typeof value !== "string" ||
    value.length > limit ||
    (required && !value.trim())
  )
    throw new ProductInputError(`${label}格式不正确`);
  return value.trim();
}
export function memberInput(input: Record<string, unknown>) {
  return {
    name: text(input.name, "姓名", true, 100),
    relation: text(input.relation, "家庭关系") || "家庭成员",
    role: text(input.role, "角色", false, 100) || "家庭成员",
    phone: text(input.phone, "联系电话", false, 50),
  };
}
export function familyInput(input: Record<string, unknown>) {
  if (Object.keys(input).some((key) => !["name", "address"].includes(key)))
    throw new ProductInputError("家庭资料包含不支持的字段");
  return {
    name: text(input.name, "家庭名称", true, 100),
    address: text(input.address, "家庭地址", false, 1000),
  };
}
export function deviceInput(input: Record<string, unknown>) {
  const kinds: DeviceKind[] = [
    "security",
    "environment",
    "lighting",
    "lock",
    "camera",
    "health",
    "other",
  ];
  return {
    name: text(input.name, "设备名称", true),
    room: text(input.room, "房间") || "家中",
    kind: kinds.includes(input.kind as DeviceKind)
      ? (input.kind as DeviceKind)
      : ("other" as DeviceKind),
  };
}
export function serviceInput(input: Record<string, unknown>) {
  return {
    name: text(input.name, "资源名称", true),
    category: text(input.category, "类别") || "生活服务",
    coverage: text(input.coverage, "服务范围"),
    contact: text(input.contact, "联系方式", true),
    note: text(input.note, "说明", false, 1000) || "家庭成员添加，待人工核实",
  };
}
