import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api, Bill } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";
import { scheduleBillReminder } from "@/src/notifications";

type Recurrence = "none" | "weekly" | "biweekly" | "monthly";

export default function BillEditor() {
  const params = useLocalSearchParams<{
    id?: string;
    month_key?: string;
    due_date?: string;
    paycheck_id?: string;
  }>();
  const isEdit = !!params.id && params.id !== "new";
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(params.due_date || "");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [category, setCategory] = useState("bill");
  const [occurrences, setOccurrences] = useState("12");
  const [notifOn, setNotifOn] = useState(true);

  const monthKey = params.month_key || (dueDate ? dueDate.slice(0, 7) : "");

  const existingQ = useQuery({
    queryKey: ["bill", params.id],
    queryFn: () => api.listBills().then((rows) => rows.find((b) => b.id === params.id)!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingQ.data) {
      const b = existingQ.data;
      setName(b.name);
      setAmount(String(b.amount));
      setDueDate(b.due_date || "");
      setRecurrence(((b.recurrence as Recurrence) || "none") as Recurrence);
      setCategory(b.category || "bill");
    }
  }, [existingQ.data]);

  const createOne = useMutation({
    mutationFn: () =>
      api.createBill({
        month_key: monthKey || dueDate.slice(0, 7),
        paycheck_id: params.paycheck_id,
        name,
        amount: parseFloat(amount) || 0,
        due_date: dueDate || null,
        recurrence: "none",
        category,
      }),
    onSuccess: async (b) => {
      if (notifOn && b.due_date) {
        await scheduleBillReminder({
          billId: b.id,
          title: `${b.name} due tomorrow`,
          body: `${fmt(b.amount)} — mark paid in Paycheck Planner`,
          dueDate: b.due_date,
        });
      }
      await qc.invalidateQueries();
      router.back();
    },
  });

  const update = useMutation({
    mutationFn: () =>
      api.updateBill(params.id!, {
        name,
        amount: parseFloat(amount) || 0,
        due_date: dueDate || null,
        recurrence,
        category,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      router.back();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteBill(params.id!),
    onSuccess: async () => {
      await qc.invalidateQueries();
      router.back();
    },
  });

  const generate = useMutation({
    mutationFn: () =>
      api.generateRecurring({
        name,
        amount: parseFloat(amount) || 0,
        recurrence: (recurrence === "none" ? "monthly" : recurrence) as
          | "weekly"
          | "biweekly"
          | "monthly",
        start_date: dueDate,
        occurrences: parseInt(occurrences, 10) || 12,
        category,
        fraction_prefix: true,
      }),
    onSuccess: async (res) => {
      if (notifOn) {
        for (const b of res.bills.slice(0, 20)) {
          if (b.due_date) {
            await scheduleBillReminder({
              billId: b.id,
              title: `${b.name} due tomorrow`,
              body: `${fmt(b.amount)} — mark paid in Paycheck Planner`,
              dueDate: b.due_date,
            });
          }
        }
      }
      await qc.invalidateQueries();
      router.back();
    },
  });

  const canSave = name.trim().length > 0 && parseFloat(amount) > 0;
  const canGenerate = canSave && !!dueDate && recurrence !== "none";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="bill-editor">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <Icon name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{isEdit ? "Edit bill" : "New bill"}</Text>
          <Text style={styles.subtitle}>
            {isEdit ? "Update or delete this bill" : "Add a one-off or a recurring bill"}
          </Text>
        </View>
        {isEdit ? (
          <Pressable
            onPress={() => remove.mutate()}
            style={[styles.iconBtn, { backgroundColor: colors.error }]}
            testID="delete-bill"
          >
            <Icon name="trash" size={18} color={colors.onError} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 120, gap: spacing.md }}
      >
        <Field label="Name">
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Rent, Netflix, Car…"
            placeholderTextColor={colors.muted}
            testID="input-name"
          />
        </Field>

        <Field label="Amount">
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            testID="input-amount"
          />
        </Field>

        <Field label="Due date (YYYY-MM-DD)">
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-10-15"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            testID="input-due"
          />
        </Field>

        <Field label="Category">
          <View style={styles.segRow}>
            {["bill", "subscription", "debt", "living"].map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.seg, category === c && styles.segActive]}
                testID={`seg-cat-${c}`}
              >
                <Text style={[styles.segText, category === c && styles.segTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Recurrence">
          <View style={styles.segRow}>
            {(["none", "weekly", "biweekly", "monthly"] as Recurrence[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRecurrence(r)}
                style={[styles.seg, recurrence === r && styles.segActive]}
                testID={`seg-rec-${r}`}
              >
                <Text style={[styles.segText, recurrence === r && styles.segTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        {recurrence !== "none" ? (
          <Field label="Occurrences (1–60)">
            <TextInput
              style={styles.input}
              value={occurrences}
              onChangeText={setOccurrences}
              keyboardType="number-pad"
              testID="input-occurrences"
            />
            <Text style={styles.hint}>
              Auto-creates {occurrences || 0} bills at {recurrence} cadence starting {dueDate || "your due date"}. Each will be tagged "1of{occurrences}", "2of{occurrences}", …
            </Text>
          </Field>
        ) : null}

        <Pressable
          onPress={() => setNotifOn(!notifOn)}
          style={styles.notifRow}
          testID="notif-toggle"
        >
          <Icon
            name={notifOn ? "notifications" : "notifications-off"}
            size={20}
            color={notifOn ? colors.onSurface : colors.muted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.notifTitle}>Remind me the day before</Text>
            <Text style={styles.notifHint}>
              {Platform.OS === "web"
                ? "Available on iOS & Android device only"
                : notifOn
                ? "You'll get a local notification at 9am"
                : "No reminders will be scheduled"}
            </Text>
          </View>
          <View
            style={[
              styles.switch,
              { backgroundColor: notifOn ? colors.success : colors.surfaceTertiary },
            ]}
          >
            <View style={[styles.knob, notifOn && { alignSelf: "flex-end" }]} />
          </View>
        </Pressable>
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {isEdit ? (
          <Pressable
            style={[styles.primary, !canSave && styles.disabled]}
            disabled={!canSave || update.isPending}
            onPress={() => update.mutate()}
            testID="save-bill"
          >
            {update.isPending ? (
              <ActivityIndicator color={colors.onSurfaceInverse} />
            ) : (
              <Text style={styles.primaryText}>Save changes</Text>
            )}
          </Pressable>
        ) : recurrence === "none" ? (
          <Pressable
            style={[styles.primary, !canSave && styles.disabled]}
            disabled={!canSave || createOne.isPending}
            onPress={() => createOne.mutate()}
            testID="save-bill"
          >
            {createOne.isPending ? (
              <ActivityIndicator color={colors.onSurfaceInverse} />
            ) : (
              <Text style={styles.primaryText}>Add bill</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primary, !canGenerate && styles.disabled]}
            disabled={!canGenerate || generate.isPending}
            onPress={() => generate.mutate()}
            testID="generate-bills"
          >
            {generate.isPending ? (
              <ActivityIndicator color={colors.onSurfaceInverse} />
            ) : (
              <Text style={styles.primaryText}>
                Generate {occurrences || 0} {recurrence} bills
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },

  label: { fontSize: 11, color: colors.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    color: colors.onSurface,
    fontSize: 15,
  },
  hint: { fontSize: 11, color: colors.muted, marginTop: 6 },

  segRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  seg: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  segActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  segText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary },
  segTextActive: { color: colors.onSurfaceInverse },

  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  notifTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  notifHint: { fontSize: 11, color: colors.muted, marginTop: 2 },
  switch: {
    width: 42,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
  },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  primary: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.md,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.4 },
}));
