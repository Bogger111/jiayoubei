export type VisionRuleEvidence = { ruleVersion: "torso-relative-v2"; hipDropRatio: number; lowPostureMs: number };
export function validVisionReport(body: Record<string, unknown>): boolean {
  const {source,torsoAngle,hipDrop}=body;
  if((source!=="camera"&&source!=="video")||typeof torsoAngle!=="number"||typeof hipDrop!=="number"||!Number.isFinite(torsoAngle)||!Number.isFinite(hipDrop)||torsoAngle<0||torsoAngle>90||hipDrop<=0||hipDrop>1)return false;
  if(body.ruleVersion===undefined)return torsoAngle>=55 && hipDrop>=.15;
  return body.ruleVersion==="torso-relative-v2" && typeof body.hipDropRatio==="number" && Number.isFinite(body.hipDropRatio) && body.hipDropRatio>=.6 && body.hipDropRatio<=12 &&
    typeof body.lowPostureMs==="number" && Number.isFinite(body.lowPostureMs) && body.lowPostureMs>=600 && body.lowPostureMs<=60000;
}
