export function isConversationOnly(query: string) {
  return /^(你好|您好|嗨|hello|hi|谢谢|谢谢你|多谢|好的|好|收到|知道了|明白了|早上好|晚上好|晚安|再见)[\s!！。.,，?？]*$/i.test(
    query.trim(),
  );
}

/** Match complete information requests only; additional incident text must be assessed. */
export function nonIncidentReply(query: string): string | undefined {
  const text = query.trim().replace(/[？?！!。\s]+$/, "");
  const prefix = "(?:请问|请介绍|请解释|想了解|我想了解)?";
  if (
    new RegExp(
      `^${prefix}(?:(?:如何|怎么|怎样)(?:使用|开启|打开)(?:家有备的?)?(?:视觉监测|摔倒检测)|(?:视觉监测|摔倒检测)(?:怎么用|是什么|有什么功能))$`,
    ).test(text)
  )
    return "视觉监测需要手动打开摄像头或选择视频，先在固定画面中完成站立校准。检测到疑似摔倒后，会保存事件摘要并交给家人核实。分析在本机进行，视频不上传；目前没有真实场景准确率结论。可以从“视觉监测”页面开始。";
  if (
    new RegExp(
      `^${prefix}(?:(?:如何|怎么|怎样)(?:创建|新建|转交|完成)(?:家庭)?任务|(?:家庭)?任务(?:怎么用|是什么))$`,
    ).test(text)
  )
    return "在“家庭任务”中选择“新建任务”，填写负责人和期限。处理后先保存核实记录，再确认完成；也可以在任务详情中转交给其他家人。";
  if (
    new RegExp(
      `^${prefix}(?:如何|怎么|怎样)(?:预防|防止|避免)(?:(?:老人|长辈|家人)(?:的)?)?(?:摔倒|燃气泄漏|火灾)$`,
    ).test(text)
  )
    return "这是一条准备与预防方面的咨询，尚未报告现场异常。可以建立家庭任务记录检查安排和负责人。若有正在发生的情况，请补充人员状态、地点和观察到的线索，以便整理核实事项。";
  return undefined;
}

export function knownMemberName(
  value: unknown,
  profile: Record<string, unknown>,
) {
  if (typeof value !== "string" || !Array.isArray(profile.members))
    return "家人（待确认）";
  const name = value.trim();
  return profile.members.some(
    (member) =>
      member &&
      typeof member === "object" &&
      "name" in member &&
      member.name === name,
  )
    ? name
    : "家人（待确认）";
}
