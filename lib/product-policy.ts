import type { AuthorizationPolicy, RiskLevel } from "./product-models";

type AuthorizationPolicySubject = {
  riskLevel: RiskLevel;
  resource: string;
  action: string;
};

const protectedResourcePattern = /门锁|摄像头|医疗|消防|专业救援|敏感隐私/;

export function isAuthorizationPolicyAllowed(subject: AuthorizationPolicySubject, policy: AuthorizationPolicy): boolean {
  if (policy !== "always_allow") return true;
  if (subject.riskLevel === "critical") return false;
  return !protectedResourcePattern.test(`${subject.resource} ${subject.action}`);
}

export function canCompleteTask(task: { evidence?: string }): boolean {
  return Boolean(task.evidence?.trim());
}
