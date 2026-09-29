import { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { api, MonthSummary, Paycheck } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const monthsQ = useQuery({ queryKey: ["months"], queryFn: api.listMonths });
  const summaryQ = useQuery({ queryKey: ["summary"], queryFn: api.summary });

  const months = monthsQ.data ?? [];
  const activeKey = selectedKey ?? months[0]?.key ?? null;
  const activeMonth = months.find((m) => m.key === activeKey);

  const monthDetailQ = useQuery({
    queryKey: ["month", activeKey],
    queryFn: () => api.getMonth(activeKey!),
    enabled: !!activeKey,
  });

  const paychecks = monthDetailQ.data?.paychecks ?? [];

  const leftToBudget = useMemo(() => {
    if (!activeMonth) return 0;
    return activeMonth.total_buffer;
  }, [activeMonth]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["months"] }),
      qc.invalidateQueries({ queryKey: ["summary"] }),
      qc.invalidateQueries({ queryKey: ["month", activeKey] }),
    ]);
  };

  const loading = monthsQ.isLoading || summaryQ.isLoading;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="dashboard-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Paycheck Planner</Text>
        <Text style={styles.subtitle}>Your money, allocated with intention.</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={monthsQ.isFetching} onRefresh={refresh} />}
      >
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
              testID={`month-chip-${m.key}`}
            >
              <Text
                style={[styles.chipText, activeKey === m.key && styles.chipTextActive]}
              >
                {m.name.replace(" 2026", "")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color={colors.onSurface} style={{ marginTop: spacing.xxl }} />
        ) : (
          <>
            <View style={styles.hero} testID="left-to-budget-card">
              <Text style={styles.heroLabel}>Buffer this month</Text>
              <Text style={styles.heroValue}>{fmt(leftToBudget)}</Text>
              <View style={styles.heroRow}>
                <HeroStat label="Income" value={fmt(activeMonth?.total_income ?? 0)} />
                <View style={styles.heroDivider} />
                <HeroStat label="Bills" value={fmt(activeMonth?.total_expenses ?? 0)} />
                <View style={styles.heroDivider} />
                <HeroStat label="Saved" value={fmt(activeMonth?.total_saved ?? 0)} />
              </View>
            </View>

            <Text style={styles.sectionTitle}>Paychecks in {activeMonth?.name}</Text>
            <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
              {paychecks.map((p) => (
                <PaycheckCard
                  key={p.id}
                  paycheck={p}
                  onPress={() => router.push(`/paycheck/${p.id}`)}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Year to Date</Text>
            <View style={styles.ytdGrid}>
              <YtdTile label="Income" value={fmt(summaryQ.data?.ytd_income ?? 0)} tone="brand" />
              <YtdTile label="Spent" value={fmt(summaryQ.data?.ytd_spent ?? 0)} tone="surface" />
              <YtdTile label="Saved" value={fmt(summaryQ.data?.ytd_saved ?? 0)} tone="success" />
              <YtdTile label="Buffer" value={fmt(summaryQ.data?.total_buffer ?? 0)} tone="warning" />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue}>{value}</Text>
    </View>
  );
}

function PaycheckCard({ paycheck, onPress }: { paycheck: Paycheck; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const cycleBg = colors[paycheck.color_cycle as keyof ThemeColors] as string;
  const allocated =
    paycheck.vehicle_payment +
    paycheck.targeted_payoffs +
    paycheck.current_month_bills +
    paycheck.next_month_early_bills +
    paycheck.living_costs +
    paycheck.savings_transfer;
  const remaining = paycheck.total_cash - allocated;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.paycheckCard, { backgroundColor: cycleBg }]}
      testID={`paycheck-card-${paycheck.id}`}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={styles.paycheckNum}>Paycheck {paycheck.number}</Text>
          <Text style={styles.paycheckDate}>{paycheck.date_range}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.paycheckAmt}>{fmt(paycheck.total_cash)}</Text>
          <Text style={styles.paycheckLabel}>incoming</Text>
        </View>
      </View>
      <View style={styles.pcRow}>
        <PcMini label="Bills" value={fmt(paycheck.vehicle_payment + paycheck.targeted_payoffs + paycheck.current_month_bills)} />
        <PcMini label="Living" value={fmt(paycheck.living_costs)} />
        <PcMini label="Save" value={fmt(paycheck.savings_transfer)} />
        <PcMini label="Buffer" value={fmt(paycheck.unallocated_buffer || remaining)} />
      </View>
      <View style={styles.pcFooter}>
        <Text style={styles.pcTapHint}>Tap for allocation plan</Text>
        <Icon name="chevron-forward" size={16} color="#1A1A1A" />
      </View>
    </Pressable>
  );
}

function PcMini({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.pcMini}>
      <Text style={styles.pcMiniLabel}>{label}</Text>
      <Text style={styles.pcMiniValue}>{value}</Text>
    </View>
  );
}

function YtdTile({ label, value, tone }: { label: string; value: string; tone: "brand" | "surface" | "success" | "warning" }) {
  const styles = useStyles();
  const bg =
    tone === "brand" ? styles.ytdBrand :
    tone === "success" ? styles.ytdSuccess :
    tone === "warning" ? styles.ytdWarning : styles.ytdSurface;
  const fg =
    tone === "brand" ? styles.ytdBrandText :
    tone === "success" ? styles.ytdSuccessText :
    tone === "warning" ? styles.ytdWarningText : styles.ytdSurfaceText;
  return (
    <View style={[styles.ytdTile, bg]}>
      <Text style={[styles.ytdLabel, fg]}>{label}</Text>
      <Text style={[styles.ytdValue, fg]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: "700", color: colors.onSurface },
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

  hero: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceInverse,
    marginTop: spacing.sm,
  },
  heroLabel: { color: colors.onSurfaceInverse, fontSize: 13, opacity: 0.7 },
  heroValue: { color: colors.onSurfaceInverse, fontSize: 44, fontWeight: "700", marginTop: spacing.xs, letterSpacing: -1 },
  heroRow: { flexDirection: "row", marginTop: spacing.lg, alignItems: "center" },
  heroDivider: { width: 1, height: 28, backgroundColor: colors.muted, opacity: 0.3 },
  heroStatLabel: { color: colors.onSurfaceInverse, opacity: 0.65, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  heroStatValue: { color: colors.onSurfaceInverse, fontSize: 15, fontWeight: "700", marginTop: 4 },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },

  paycheckCard: { padding: spacing.lg, borderRadius: radius.lg },
  paycheckNum: { fontSize: 16, fontWeight: "700", color: colors.onCycle },
  paycheckDate: { fontSize: 12, color: colors.onCycle, opacity: 0.75, marginTop: 2 },
  paycheckAmt: { fontSize: 20, fontWeight: "700", color: colors.onCycle },
  paycheckLabel: { fontSize: 10, color: colors.onCycle, opacity: 0.7, textTransform: "uppercase" },
  pcRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.sm },
  pcMini: { flex: 1, backgroundColor: "rgba(255,255,255,0.5)", borderRadius: radius.md, padding: spacing.sm },
  pcMiniLabel: { fontSize: 10, color: colors.onCycle, opacity: 0.7, textTransform: "uppercase" },
  pcMiniValue: { fontSize: 13, fontWeight: "700", color: colors.onCycle, marginTop: 2 },
  pcFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  pcTapHint: { fontSize: 11, color: colors.onCycle, opacity: 0.7 },

  ytdGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  ytdTile: {
    width: "47%",
    padding: spacing.lg,
    borderRadius: radius.lg,
    minHeight: 90,
    justifyContent: "space-between",
  },
  ytdLabel: { fontSize: 12, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.5 },
  ytdValue: { fontSize: 22, fontWeight: "700", marginTop: spacing.sm },
  ytdSurface: { backgroundColor: colors.surfaceSecondary },
  ytdSurfaceText: { color: colors.onSurfaceSecondary },
  ytdBrand: { backgroundColor: colors.brandPrimary },
  ytdBrandText: { color: colors.onBrandPrimary },
  ytdSuccess: { backgroundColor: colors.success },
  ytdSuccessText: { color: colors.onSuccess },
  ytdWarning: { backgroundColor: colors.warning },
  ytdWarningText: { color: colors.onWarning },
}));
