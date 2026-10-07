/** Notices in the browser, for when something waits for a signature and the app is closed. */
import { del, post } from "./api";

export type NoticesState = "unsupported" | "denied" | "granted" | "default";

export function noticesState(): NoticesState {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const padded = `${publicKey}${"=".repeat((4 - (publicKey.length % 4)) % 4)}`.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Asks for permission and tells the server where to send the notices. False if the person said no. */
export async function enableNotices(publicKey: string): Promise<boolean> {
  if (noticesState() === "unsupported") return false;
  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) }));
  await post("/api/push/subscribe", { subscription: subscription.toJSON() });
  return true;
}

/** Whether this browser is already set to get the notices. */
export async function noticesEnabled(): Promise<boolean> {
  if (noticesState() !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  return Boolean(await registration?.pushManager.getSubscription());
}

export async function disableNotices(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await del("/api/push/subscribe", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
