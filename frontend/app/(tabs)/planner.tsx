import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const monthsQ = useQuery({ queryKey: ["months"], queryFn: api.listMonths });
  const months = monthsQ.data ?? [];
  const activeKey = selectedKey ?? months[0]?.key ?? null;

  const detailQ = useQuery({
    queryKey: ["month", activeKey],
    queryFn: () => api.getMonth(activeKey!),
    enabled: !!activeKey,
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="planner-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Allocation Planner</Text>
        <Text style={styles.subtitle}>What each paycheck must pay.</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {months.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setSelectedKey(m.key)}
            style={[styles.chip, activeKey === m.key && styles.chipActive]}
            testID={`planner-month-${m.key}`}
          >
            <Text style={[styles.chipText, activeKey === m.key && styles.chipTextActive]}>
              {m.name.replace(" 2026", "")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl, gap: spacing.md, paddingHorizontal: spacing.lg }}>
        {detailQ.isLoading ? (
          <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.xxl }} />
        ) : (
          detailQ.data?.paychecks.map((p) => {
            const cycleColor = colors[p.color_cycle as keyof ThemeColors] as string;
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/paycheck/${p.id}`)}
                style={styles.card}
                testID={`planner-paycheck-${p.id}`}
              >
                <View style={styles.rowHeader}>
                  <View style={[styles.dot, { backgroundColor: cycleColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pcTitle}>Paycheck {p.number}</Text>
                    <Text style={styles.pcSub}>{p.date_range}</Text>
                  </View>
                  <Text style={styles.pcTotal}>{fmt(p.total_cash)}</Text>
                </View>

                <View style={styles.allocList}>
                  <AllocRow label="Vehicle payment" value={p.vehicle_payment} />
                  <AllocRow label="Targeted payoffs" value={p.targeted_payoffs} />
                  <AllocRow label="Current month bills" value={p.current_month_bills} />
                  <AllocRow label="Next month bills" value={p.next_month_early_bills} />
                  <AllocRow label="Living costs" value={p.living_costs} />
                  <AllocRow label="Savings transfer" value={p.savings_transfer} tone="success" />
                  <AllocRow label="Unallocated buffer" value={p.unallocated_buffer} tone="brand" />
                </View>

                <View style={styles.footer}>
                  <Text style={styles.tapHint}>View bills & spending</Text>
                  <Icon name="arrow-forward" size={14} color={colors.onSurface} />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function AllocRow({ label, value, tone }: { label: string; value: number; tone?: "success" | "brand" }) {
  const styles = useStyles();
  const dim = value === 0;
  return (
    <View style={styles.allocRow}>
      <Text style={[styles.allocLabel, dim && { opacity: 0.4 }]}>{label}</Text>
      <Text
        style={[
          styles.allocValue,
          tone === "success" && styles.allocValueSuccess,
          tone === "brand" && styles.allocValueBrand,
          dim && { opacity: 0.4 },
        ]}
      >
        {fmt(value)}
      </Text>
    </View>
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

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pcTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  pcSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pcTotal: { fontSize: 18, fontWeight: "700", color: colors.onSurface },

  allocList: { marginTop: spacing.md, gap: spacing.xs },
  allocRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs },
  allocLabel: { fontSize: 13, color: colors.onSurfaceSecondary },
  allocValue: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  allocValueSuccess: { color: colors.onSuccess, backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, overflow: "hidden" },
  allocValueBrand: { color: colors.onBrandPrimary, backgroundColor: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, overflow: "hidden" },

  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tapHint: { fontSize: 12, color: colors.onSurface, fontWeight: "600" },
}));
