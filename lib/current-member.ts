import type { FamilyMember, User } from "./product-models";
export function currentMember(members: FamilyMember[], user: User, demoMode = false) {
  const linked = members.find((member) => member.userId === user.id || member.id === user.id || member.id === `M_${user.id}`);
  if (linked) return linked;
  const names = members.filter((member) => member.name === user.name);
  if (names.length === 1) return names[0];
  if (demoMode && ["家庭管理员", "admin"].includes(user.role)) {
    const admins = members.filter((member) => member.role === "家庭管理员");
    if (admins.length === 1) return admins[0];
  }
  return undefined;
}
