import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api, Paycheck } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";

export default function TrackerScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const monthsQ = useQuery({ queryKey: ["months"], queryFn: api.listMonths });
  const summaryQ = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const months = monthsQ.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeKey = selectedKey ?? months[0]?.key ?? null;

  const detailQ = useQuery({
    queryKey: ["month", activeKey],
    queryFn: () => api.getMonth(activeKey!),
    enabled: !!activeKey,
  });

  const paychecks = detailQ.data?.paychecks ?? [];
  const totalTarget = paychecks.reduce((s, p) => s + p.weekly_target_spending, 0);
  const totalSpent = paychecks.reduce((s, p) => s + p.weekly_desired_spending, 0);
  const spendPct = totalTarget ? Math.min(1, totalSpent / totalTarget) : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top }]} testID="tracker-screen">
        <View style={styles.header}>
          <Text style={styles.title}>Tracker</Text>
          <Text style={styles.subtitle}>Weekly spending vs buffer & savings.</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          {/* YTD Summary Bento */}
          <View style={styles.bento}>
            <View style={[styles.bentoTile, styles.big]}>
              <Text style={styles.bentoLabel}>YTD Saved</Text>
              <Text style={styles.bentoBig}>{fmt(summaryQ.data?.ytd_saved ?? 0)}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (summaryQ.data?.savings_rate ?? 0) * 3)}%` }]} />
              </View>
              <Text style={styles.bentoHint}>{summaryQ.data?.savings_rate ?? 0}% savings rate</Text>
            </View>
            <View style={{ flex: 1, gap: spacing.md }}>
              <View style={[styles.bentoTile, styles.small, { backgroundColor: colors.warning }]}>
                <Text style={[styles.bentoLabel, { color: colors.onWarning }]}>Buffer</Text>
                <Text style={[styles.bentoSmallVal, { color: colors.onWarning }]}>{fmt(summaryQ.data?.total_buffer ?? 0)}</Text>
              </View>
              <View style={[styles.bentoTile, styles.small, { backgroundColor: colors.brandPrimary }]}>
                <Text style={[styles.bentoLabel, { color: colors.onBrandPrimary }]}>Income</Text>
                <Text style={[styles.bentoSmallVal, { color: colors.onBrandPrimary }]}>{fmt(summaryQ.data?.ytd_income ?? 0)}</Text>
              </View>
            </View>
          </View>

          {/* Month picker */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {months.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setSelectedKey(m.key)}
                style={[styles.chip, activeKey === m.key && styles.chipActive]}
                testID={`tracker-month-${m.key}`}
              >
                <Text style={[styles.chipText, activeKey === m.key && styles.chipTextActive]}>
                  {m.name.replace(" 2026", "")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Weekly spending vs target */}
          <View style={styles.weekCard} testID="weekly-summary-card">
            <Text style={styles.weekTitle}>Weekly spending this month</Text>
            <View style={styles.weekRow}>
              <Text style={styles.weekSpent}>{fmt(totalSpent)}</Text>
              <Text style={styles.weekTarget}>of {fmt(totalTarget)}</Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${spendPct * 100}%`,
                    backgroundColor: spendPct > 1 ? colors.error : spendPct > 0.8 ? colors.warning : colors.success,
                  },
                ]}
              />
            </View>
            <Text style={styles.weekHint}>
              {spendPct >= 1
                ? "Over target — pause spending"
                : `${fmt(Math.max(0, totalTarget - totalSpent))} left to spend`}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Per Paycheck</Text>
          {detailQ.isLoading ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {paychecks.map((p) => (
                <WeeklyTracker
                  key={p.id}
                  paycheck={p}
                  onSave={(spend, target) => {
                    api
                      .updatePaycheck(p.id, {
                        weekly_desired_spending: spend,
                        weekly_target_spending: target,
                      })
                      .then(() => qc.invalidateQueries({ queryKey: ["month", activeKey] }));
                  }}
                />
              ))}
            </View>
          )}

          {/* Multi-month trend */}
          <Text style={styles.sectionTitle}>Multi-Month Trend</Text>
          <View style={{ paddingHorizontal: spacing.lg }}>
            <View style={styles.trendCard}>
              {months.map((m) => {
                const max = Math.max(...months.map((x) => x.total_income), 1);
                return (
                  <View key={m.key} style={styles.trendRow}>
                    <Text style={styles.trendLabel}>{m.name.split(" ")[0].slice(0, 3)}</Text>
                    <View style={styles.trendBars}>
                      <View style={[styles.trendBar, { width: `${(m.total_income / max) * 100}%`, backgroundColor: colors.brandPrimary }]} />
                      <View style={[styles.trendBar, { width: `${(m.total_saved / max) * 100}%`, backgroundColor: colors.success }]} />
                    </View>
                    <Text style={styles.trendVal}>{fmt(m.total_saved)}</Text>
                  </View>
                );
              })}
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.brandPrimary }]} />
                  <Text style={styles.legendText}>Income</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.legendText}>Saved</Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function WeeklyTracker({
  paycheck,
  onSave,
}: {
  paycheck: Paycheck;
  onSave: (spent: number, target: number) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [spent, setSpent] = useState(String(paycheck.weekly_desired_spending || 0));
  const [target, setTarget] = useState(String(paycheck.weekly_target_spending || paycheck.living_costs || 300));
  const cycleColor = colors[paycheck.color_cycle as keyof ThemeColors] as string;
  const spentN = parseFloat(spent) || 0;
  const targetN = parseFloat(target) || 0;
  const pct = targetN ? Math.min(1, spentN / targetN) : 0;
  const left = Math.max(0, targetN - spentN);

  return (
    <View style={styles.trackerCard} testID={`tracker-paycheck-${paycheck.id}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={[styles.trackerDot, { backgroundColor: cycleColor }]} />
        <Text style={styles.trackerTitle}>Paycheck {paycheck.number}</Text>
        <Text style={styles.trackerSub}>· {paycheck.date_range}</Text>
      </View>

      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${pct * 100}%`,
              backgroundColor: pct > 1 ? colors.error : pct > 0.8 ? colors.warning : colors.success,
            },
          ]}
        />
      </View>
      <Text style={styles.trackerHint}>
        {fmt(spentN)} spent · {fmt(left)} left to buffer
      </Text>

      <View style={styles.inputRow}>
        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>Spent</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={spent}
            onChangeText={setSpent}
            placeholder="0"
            placeholderTextColor={colors.muted}
            testID={`input-spent-${paycheck.id}`}
          />
        </View>
        <View style={styles.inputWrap}>
          <Text style={styles.inputLabel}>Target</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={target}
            onChangeText={setTarget}
            placeholder="0"
            placeholderTextColor={colors.muted}
            testID={`input-target-${paycheck.id}`}
          />
        </View>
        <Pressable
          style={styles.saveBtn}
          onPress={() => onSave(spentN, targetN)}
          testID={`save-tracker-${paycheck.id}`}
        >
          <Icon name="checkmark" size={18} color={colors.onSurfaceInverse} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },

  bento: {
    flexDirection: "row",
    padding: spacing.lg,
    gap: spacing.md,
  },
  bentoTile: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  big: { flex: 1.4, minHeight: 160 },
  small: { minHeight: 72, backgroundColor: colors.surfaceSecondary },
  bentoLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: colors.onSurfaceInverse, opacity: 0.7 },
  bentoBig: { fontSize: 30, fontWeight: "700", color: colors.onSurfaceInverse, marginTop: spacing.sm },
  bentoSmallVal: { fontSize: 18, fontWeight: "700", marginTop: 4 },
  bentoHint: { fontSize: 11, color: colors.onSurfaceInverse, opacity: 0.6, marginTop: spacing.sm },

  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
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

  weekCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  weekTitle: { fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  weekRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginTop: spacing.sm },
  weekSpent: { fontSize: 24, fontWeight: "700", color: colors.onSurface },
  weekTarget: { fontSize: 13, color: colors.muted },
  weekHint: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },

  progressBar: {
    height: 8,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    overflow: "hidden",
    marginTop: spacing.md,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.success,
    borderRadius: radius.pill,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },

  trackerCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg },
  trackerDot: { width: 10, height: 10, borderRadius: 5 },
  trackerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  trackerSub: { fontSize: 12, color: colors.muted },
  trackerHint: { fontSize: 11, color: colors.muted, marginTop: spacing.sm },

  inputRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignItems: "flex-end" },
  inputWrap: { flex: 1 },
  inputLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    color: colors.onSurface,
    fontSize: 14,
  },
  saveBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceInverse,
    alignItems: "center",
    justifyContent: "center",
  },

  trendCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg },
  trendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  trendLabel: { width: 34, fontSize: 12, color: colors.muted, fontWeight: "600" },
  trendBars: { flex: 1, gap: 3 },
  trendBar: { height: 8, borderRadius: 4, minWidth: 4 },
  trendVal: { fontSize: 12, fontWeight: "700", color: colors.onSurface, width: 60, textAlign: "right" },
  legend: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.muted },
}));
