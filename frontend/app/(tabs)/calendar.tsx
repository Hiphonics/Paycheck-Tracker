import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api, Bill } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const monthsQ = useQuery({ queryKey: ["months"], queryFn: api.listMonths });
  const months = monthsQ.data ?? [];
  const activeKey = selectedKey ?? months[0]?.key ?? null;

  const detailQ = useQuery({
    queryKey: ["month-full", activeKey],
    queryFn: async () => {
      const m = await api.getMonth(activeKey!);
      const pcs = await Promise.all(m.paychecks.map((p) => api.getPaycheck(p.id)));
      return { ...m, paychecks: pcs };
    },
    enabled: !!activeKey,
  });

  const toggle = useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) => api.toggleBill(id, paid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["month-full", activeKey] }),
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="calendar-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Bill Calendar</Text>
        <Text style={styles.subtitle}>Bills grouped by paycheck cycle.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {months.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setSelectedKey(m.key)}
            style={[styles.chip, activeKey === m.key && styles.chipActive]}
            testID={`calendar-month-${m.key}`}
          >
            <Text style={[styles.chipText, activeKey === m.key && styles.chipTextActive]}>
              {m.name.replace(" 2026", "")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {detailQ.isLoading ? (
          <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.xxl }} />
        ) : (
          detailQ.data?.paychecks.map((p) => {
            const cycleColor = colors[p.color_cycle as keyof ThemeColors] as string;
            const totalBills = p.bills.reduce((s, b) => s + b.amount, 0);
            const paidCount = p.bills.filter((b) => b.paid).length;
            return (
              <View key={p.id} style={styles.group}>
                <View style={styles.groupHeader}>
                  <View style={[styles.timelineDot, { backgroundColor: cycleColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupTitle}>Paycheck {p.number}</Text>
                    <Text style={styles.groupSub}>
                      {p.date_range} · {paidCount}/{p.bills.length} paid · {fmt(totalBills)}
                    </Text>
                  </View>
                </View>
                <View style={styles.timelineLine} />
                <View style={{ gap: spacing.sm, paddingLeft: 30 }}>
                  {p.bills.length === 0 && (
                    <Text style={styles.emptyText}>No bills scheduled</Text>
                  )}
                  {p.bills.map((b) => (
                    <BillRow
                      key={b.id}
                      bill={b}
                      onToggle={() => toggle.mutate({ id: b.id, paid: !b.paid })}
                    />
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function BillRow({ bill, onToggle }: { bill: Bill; onToggle: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onToggle} style={styles.billRow} testID={`bill-row-${bill.id}`}>
      <Icon
        name={bill.paid ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={bill.paid ? colors.success : colors.muted}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.billName, bill.paid && styles.billNamePaid]}>{bill.name}</Text>
        {bill.fraction ? <Text style={styles.billFrac}>{bill.fraction}</Text> : null}
      </View>
      <Text style={[styles.billAmt, bill.paid && styles.billNamePaid]}>{fmt(bill.amount)}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },

  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.md },
  chip: {
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onSurfaceInverse },

  group: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    position: "relative",
  },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  timelineDot: { width: 14, height: 14, borderRadius: 7 },
  timelineLine: {
    position: "absolute",
    left: spacing.lg + 6,
    top: spacing.lg + 20,
    bottom: 0,
    width: 2,
    backgroundColor: colors.border,
  },
  groupTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  groupSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

  billRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  billName: { fontSize: 14, color: colors.onSurfaceSecondary, fontWeight: "600" },
  billFrac: { fontSize: 11, color: colors.muted, marginTop: 2 },
  billNamePaid: { textDecorationLine: "line-through", opacity: 0.5 },
  billAmt: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  emptyText: { fontSize: 12, color: colors.muted, fontStyle: "italic", paddingVertical: spacing.sm },
}));
