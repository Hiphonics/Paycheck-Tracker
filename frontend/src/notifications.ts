import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

export async function scheduleBillReminder(opts: {
  billId: string;
  title: string;
  body: string;
  dueDate: string; // ISO YYYY-MM-DD
  daysBefore?: number;
}) {
  if (Platform.OS === "web") return null;
  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  const days = opts.daysBefore ?? 1;
  const [y, m, d] = opts.dueDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const trigger = new Date(y, m - 1, d, 9, 0, 0);
  trigger.setDate(trigger.getDate() - days);
  if (trigger.getTime() < Date.now() + 60_000) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: opts.title,
      body: opts.body,
      data: { billId: opts.billId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: trigger,
    },
  });
}

export async function cancelAll() {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function listScheduled() {
  if (Platform.OS === "web") return [];
  return Notifications.getAllScheduledNotificationsAsync();
}
