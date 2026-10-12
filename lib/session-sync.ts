const key = "jyb-session-change-v1";
let tabId: string | undefined;
const currentTab = () => (tabId ??= crypto.randomUUID());
type Change = { source: string; revision: string };

export function announceSessionChange() {
  if (typeof window === "undefined") return;
  const change: Change = {
    source: currentTab(),
    revision: crypto.randomUUID(),
  };
  // Only random change markers are shared; credentials and family records stay out of storage.
  try {
    localStorage.setItem(key, JSON.stringify(change));
  } catch {
    /* BroadcastChannel can still work. */
  }
  try {
    const channel = new BroadcastChannel(key);
    channel.postMessage(change);
    channel.close();
  } catch {
    /* Storage events provide a fallback. */
  }
}

export function subscribeSessionChanges(onChange: () => void) {
  const seen = new Set<string>();
  const receive = (value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("source" in value) ||
      !("revision" in value)
    )
      return;
    if (
      typeof value.source !== "string" ||
      typeof value.revision !== "string" ||
      value.revision.length > 80 ||
      value.source === currentTab() ||
      seen.has(value.revision)
    )
      return;
    seen.add(value.revision);
    if (seen.size > 20) seen.delete(seen.values().next().value!);
    onChange();
  };
  const storage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      /* Ignore malformed browser storage. */
    }
  };
  window.addEventListener("storage", storage);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(key);
    channel.onmessage = (event) => receive(event.data);
  } catch {
    /* Storage fallback remains active. */
  }
  return () => {
    window.removeEventListener("storage", storage);
    channel?.close();
  };
}
