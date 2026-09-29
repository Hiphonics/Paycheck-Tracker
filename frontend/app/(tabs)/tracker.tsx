import { useEffect, useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { api, Paycheck } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";
import { ensureNotificationPermission } from "@/src/notifications";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

const IS_EXPO_GO = Constants.appOwnership === "expo";

export default function TrackerScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const router = useRouter();

  const yearsQ = useQuery({ queryKey: ["years"], queryFn: api.listYears });
  const [year, setYear] = useState<number | null>(null);
  const activeYear = year ?? yearsQ.data?.years[yearsQ.data.years.length - 1] ?? 2026;

  const monthsQ = useQuery({
    queryKey: ["months", activeYear],
    queryFn: () => api.listMonths(activeYear),
    enabled: !!activeYear,
  });
  const summaryQ = useQuery({ queryKey: ["summary"], queryFn: api.summary });
  const streakQ = useQuery({ queryKey: ["streak"], queryFn: api.streak });
  const goalsQ = useQuery({ queryKey: ["goals"], queryFn: api.listGoals });

  const months = monthsQ.data ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // default to first non-template month
  const activeKey =
    selectedKey ?? months.find((m) => !m.is_template)?.key ?? months[0]?.key ?? null;

  // Schedule a monthly streak-reminder on first mount (device-only)
  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") return;
      if (IS_EXPO_GO) return; // scheduling APIs unreliable in Expo Go; skip until real build
      try {
        const ok = await ensureNotificationPermission();
        if (!ok) return;
        const existing = await Notifications.getAllScheduledNotificationsAsync();
        const hasStreakReminder = existing.some(
          (n) => (n.content.data as { streak?: boolean } | null)?.streak === true,
        );
        if (hasStreakReminder) return;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Keep your savings streak alive 🔥",
            body: "Set aside anything above $0 this month to extend your streak.",
            data: { streak: true },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
            day: 3,
            hour: 9,
            minute: 0,
          },
        });
      } catch (_e) {
        // Non-fatal: silently no-op in preview environments that lack notification support.
      }
    })();
  }, []);

  const detailQ = useQuery({
    queryKey: ["month", activeKey],
    queryFn: () => api.getMonth(activeKey!),
    enabled: !!activeKey,
  });

  const paychecks = detailQ.data?.paychecks ?? [];
  const totalTarget = paychecks.reduce((s, p) => s + p.weekly_target_spending, 0);
  const totalSpent = paychecks.reduce((s, p) => s + p.weekly_desired_spending, 0);
  const spendPct = totalTarget ? Math.min(1, totalSpent / totalTarget) : 0;

  const years = yearsQ.data?.years ?? [2026];
  const yearOptions = Array.from(new Set([...years, activeYear, activeYear - 1, activeYear + 1])).sort();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top }]} testID="tracker-screen">
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Tracker</Text>
            <Text style={styles.subtitle}>Weekly spending, savings & streak.</Text>
          </View>
          <Pressable
            onPress={() => router.push("/goals")}
            style={styles.goalsBtn}
            testID="open-goals"
          >
            <Icon name="wallet" size={16} color={colors.onSurfaceInverse} />
            <Text style={styles.goalsBtnText}>Goals</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
          {/* Streak card */}
          {streakQ.data ? (
            <View style={styles.streakCard} testID="streak-card">
              <View style={{ flex: 1 }}>
                <Text style={styles.streakLabel}>Savings streak</Text>
                <Text style={styles.streakBig}>
                  {streakQ.data.current_streak}{" "}
                  <Text style={styles.streakUnit}>
                    month{streakQ.data.current_streak === 1 ? "" : "s"}
                  </Text>
                </Text>
                <Text style={styles.streakMsg}>{streakQ.data.message}</Text>
                <Text style={styles.streakSub}>
                  Best: {streakQ.data.best_streak} · YTD saved: {fmt(streakQ.data.ytd_saved)}
                </Text>
              </View>
              <Icon name="flame" size={44} color={colors.onSurfaceInverse} style={{ opacity: 0.85 }} />
            </View>
          ) : null}

          {/* YTD bento */}
          <View style={styles.bento}>
            <View style={[styles.bentoTile, styles.big]}>
              <Text style={styles.bentoLabel}>YTD Saved</Text>
              <Text style={styles.bentoBig}>{fmt(summaryQ.data?.ytd_saved ?? 0)}</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, (summaryQ.data?.savings_rate ?? 0) * 3)}%` },
                  ]}
                />
              </View>
              <Text style={styles.bentoHint}>{summaryQ.data?.savings_rate ?? 0}% savings rate</Text>
            </View>
            <View style={{ flex: 1, gap: spacing.md }}>
              <View style={[styles.bentoTile, styles.small, { backgroundColor: colors.warning }]}>
                <Text style={[styles.bentoLabel, { color: colors.onWarning }]}>Buffer</Text>
                <Text style={[styles.bentoSmallVal, { color: colors.onWarning }]}>
                  {fmt(summaryQ.data?.total_buffer ?? 0)}
                </Text>
              </View>
              <View style={[styles.bentoTile, styles.small, { backgroundColor: colors.brandPrimary }]}>
                <Text style={[styles.bentoLabel, { color: colors.onBrandPrimary }]}>Income</Text>
                <Text style={[styles.bentoSmallVal, { color: colors.onBrandPrimary }]}>
                  {fmt(summaryQ.data?.ytd_income ?? 0)}
                </Text>
              </View>
            </View>
          </View>

          {/* Year selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {yearOptions.map((y) => (
              <Pressable
                key={y}
                onPress={() => {
                  setYear(y);
                  setSelectedKey(null);
                }}
                style={[styles.chip, activeYear === y && styles.chipActive]}
                testID={`tracker-year-${y}`}
              >
                <Text style={[styles.chipText, activeYear === y && styles.chipTextActive]}>
                  {y}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Month picker (all 12) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {months.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setSelectedKey(m.key)}
                style={[
                  styles.chip,
                  activeKey === m.key && styles.chipActive,
                  m.is_template && styles.chipTemplate,
                ]}
                testID={`tracker-month-${m.key}`}
              >
                <Text style={[styles.chipText, activeKey === m.key && styles.chipTextActive]}>
                  {m.name.split(" ")[0].slice(0, 3)}
                </Text>
                {m.is_template ? (
                  <View style={styles.chipDotEmpty} />
                ) : null}
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
                    backgroundColor:
                      spendPct > 1 ? colors.error : spendPct > 0.8 ? colors.warning : colors.success,
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

          {/* Goals inline (top 3) */}
          {goalsQ.data && goalsQ.data.length > 0 ? (
            <>
              <View style={styles.sectionHeadRow}>
                <Text style={styles.sectionTitle}>Savings goals</Text>
                <Pressable onPress={() => router.push("/goals")}>
                  <Text style={styles.sectionLink}>See all →</Text>
                </Pressable>
              </View>
              <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
                {goalsQ.data.slice(0, 3).map((g) => {
                  const bg = colors[g.color as keyof typeof colors] as string;
                  const pct = g.target_amount ? Math.min(1, g.current_amount / g.target_amount) : 0;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => router.push("/goals")}
                      style={[styles.goalPreview, { backgroundColor: bg }]}
                      testID={`goal-preview-${g.id}`}
                    >
                      <Icon name={g.icon as any} size={20} color={colors.onCycle} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.goalName}>{g.name}</Text>
                        <View style={styles.goalBar}>
                          <View style={[styles.goalFill, { width: `${pct * 100}%` }]} />
                        </View>
                      </View>
                      <Text style={styles.goalAmt}>
                        {fmt(g.current_amount)} / {fmt(g.target_amount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
              <Pressable style={styles.goalEmpty} onPress={() => router.push("/goals")} testID="goal-empty">
                <Icon name="add-circle-outline" size={20} color={colors.onSurface} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalEmptyTitle}>Save for something specific</Text>
                  <Text style={styles.goalEmptyHint}>Car, house, trip — tap to add your first goal.</Text>
                </View>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            </View>
          )}

          {/* Per Paycheck weekly tracker */}
          <Text style={styles.sectionTitle}>Per paycheck</Text>
          {detailQ.isLoading ? (
            <ActivityIndicator color={colors.onSurface} />
          ) : paychecks.length === 0 ? (
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Text style={styles.emptyMonth}>
                No paychecks in {months.find((m) => m.key === activeKey)?.name}. Add bills or open Dashboard to plan a month with paychecks.
              </Text>
            </View>
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

          {/* Multi-month trend for this year */}
          <Text style={styles.sectionTitle}>{activeYear} trend</Text>
          <View style={{ paddingHorizontal: spacing.lg }}>
            <View style={styles.trendCard}>
              {months.map((m) => {
                const max = Math.max(...months.map((x) => x.total_income), 1);
                return (
                  <View key={m.key} style={styles.trendRow}>
                    <Text style={styles.trendLabel}>{m.name.split(" ")[0].slice(0, 3)}</Text>
                    <View style={styles.trendBars}>
                      <View
                        style={[
                          styles.trendBar,
                          { width: `${(m.total_income / max) * 100}%`, backgroundColor: colors.brandPrimary },
                        ]}
                      />
                      <View
                        style={[
                          styles.trendBar,
                          { width: `${(m.total_saved / max) * 100}%`, backgroundColor: colors.success },
                        ]}
                      />
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
  const [target, setTarget] = useState(
    String(paycheck.weekly_target_spending || paycheck.living_costs || 300),
  );
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
              backgroundColor:
                pct > 1 ? colors.error : pct > 0.8 ? colors.warning : colors.success,
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
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 26, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  goalsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceInverse,
  },
  goalsBtnText: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 12 },

  streakCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceInverse,
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  streakLabel: {
    fontSize: 11,
    color: colors.onSurfaceInverse,
    opacity: 0.7,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  streakBig: { fontSize: 40, fontWeight: "700", color: colors.onSurfaceInverse, marginTop: 2 },
  streakUnit: { fontSize: 16, fontWeight: "600", color: colors.onSurfaceInverse, opacity: 0.8 },
  streakMsg: { fontSize: 13, color: colors.onSurfaceInverse, marginTop: spacing.sm },
  streakSub: { fontSize: 11, color: colors.onSurfaceInverse, opacity: 0.6, marginTop: 4 },

  bento: { flexDirection: "row", padding: spacing.lg, gap: spacing.md },
  bentoTile: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  big: { flex: 1.4, minHeight: 160 },
  small: { minHeight: 72, backgroundColor: colors.surfaceSecondary },
  bentoLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.onSurfaceInverse,
    opacity: 0.7,
  },
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
    flexDirection: "row",
    gap: 4,
  },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipTemplate: { opacity: 0.55 },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onSurfaceInverse },
  chipDotEmpty: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.muted },

  weekCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  weekTitle: {
    fontSize: 12,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
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
  progressFill: { height: "100%", backgroundColor: colors.success, borderRadius: radius.pill },

  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sectionLink: { fontSize: 13, fontWeight: "700", color: colors.onSurface },

  goalPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  goalName: { fontSize: 14, fontWeight: "700", color: colors.onCycle },
  goalAmt: { fontSize: 12, fontWeight: "700", color: colors.onCycle },
  goalBar: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: radius.pill,
    marginTop: 6,
    overflow: "hidden",
  },
  goalFill: { height: "100%", backgroundColor: colors.surface, borderRadius: radius.pill },

  goalEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  goalEmptyTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  goalEmptyHint: { fontSize: 12, color: colors.muted, marginTop: 2 },

  trackerCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg },
  trackerDot: { width: 10, height: 10, borderRadius: 5 },
  trackerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  trackerSub: { fontSize: 12, color: colors.muted },
  trackerHint: { fontSize: 11, color: colors.muted, marginTop: spacing.sm },

  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: "flex-end",
  },
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

  emptyMonth: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    fontStyle: "italic",
  },

  trendCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg },
  trendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  trendLabel: { width: 34, fontSize: 12, color: colors.muted, fontWeight: "600" },
  trendBars: { flex: 1, gap: 3 },
  trendBar: { height: 8, borderRadius: 4, minWidth: 2 },
  trendVal: { fontSize: 12, fontWeight: "700", color: colors.onSurface, width: 60, textAlign: "right" },
  legend: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.muted },
}));
