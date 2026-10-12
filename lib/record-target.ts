import type { ProductState } from "./product-models";
type Target = { label: string; path?: string };
export function recordTargetIndex(state: ProductState) {
  const targets = new Map<string, Target>([
    [state.family.id, { label: state.family.name, path: "/settings" }],
  ]);
  for (const [records, route] of [
    [state.events, "events"],
    [state.tasks, "tasks"],
    [state.members, "members"],
    [state.devices, "devices"],
    [state.services, "services"],
  ] as const) {
    for (const item of records) {
      const label = "title" in item ? item.title : item.name;
      const target = {
        label,
        path: route === "services" ? "/services" : `/${route}/${item.id}`,
      };
      targets.set(item.id, target);
      if ("userId" in item && item.userId) targets.set(item.userId, target);
    }
  }
  for (const item of state.authorizations)
    targets.set(item.id, { label: item.action });
  return targets;
}
export function resolveRecordTarget(
  targets: Map<string, Target>,
  target: string,
): Target {
  return (
    targets.get(target) ??
    targets.get(target.split(/\s/, 1)[0]) ?? { label: target }
  );
}
