import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";

export default function PaycheckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [aiOpen, setAiOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);

  const q = useQuery({
    queryKey: ["paycheck", id],
    queryFn: () => api.getPaycheck(id!),
    enabled: !!id,
  });

  const savingsQ = useQuery({
    queryKey: ["savings-rec", id],
    queryFn: () => api.savingsRec(id!),
    enabled: !!id && savingsOpen,
  });

  const aiQ = useQuery({
    queryKey: ["ai-advice", id],
    queryFn: () => api.aiAdvice(id!),
    enabled: !!id && aiOpen,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const toggle = useMutation({
    mutationFn: ({ bId, paid }: { bId: string; paid: boolean }) => api.toggleBill(bId, paid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paycheck", id] }),
  });

  const applySavings = useMutation({
    mutationFn: (amount: number) => api.updatePaycheck(id!, { savings_transfer: amount }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["paycheck", id] }),
        qc.invalidateQueries({ queryKey: ["months"] }),
        qc.invalidateQueries({ queryKey: ["month"] }),
        qc.invalidateQueries({ queryKey: ["summary"] }),
      ]);
      setSavingsOpen(false);
    },
  });

  if (q.isLoading || !q.data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: "center" }]}>
        <ActivityIndicator color={colors.onSurface} />
      </View>
    );
  }

  const p = q.data;
  const cycleColor = colors[p.color_cycle as keyof ThemeColors] as string;
  const totalBills = p.bills.reduce((s, b) => s + b.amount, 0);
  const paidBills = p.bills.filter((b) => b.paid).reduce((s, b) => s + b.amount, 0);
  const allocated =
    p.vehicle_payment + p.targeted_payoffs + p.current_month_bills + p.next_month_early_bills + p.living_costs + p.savings_transfer;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="paycheck-detail">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="back-btn">
          <Icon name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Paycheck {p.number}</Text>
          <Text style={styles.date}>{p.date_range}</Text>
        </View>
        <View style={[styles.cycleTag, { backgroundColor: cycleColor }]} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        <View style={[styles.hero, { backgroundColor: cycleColor }]}>
          <Text style={styles.heroLabel}>Total Available</Text>
          <Text style={styles.heroValue}>{fmt(p.total_cash)}</Text>
          <View style={styles.heroRow}>
            <View style={styles.heroBox}>
              <Text style={styles.heroBoxLabel}>Allocated</Text>
              <Text style={styles.heroBoxVal}>{fmt(allocated)}</Text>
            </View>
            <View style={styles.heroBox}>
              <Text style={styles.heroBoxLabel}>Buffer</Text>
              <Text style={styles.heroBoxVal}>{fmt(p.unallocated_buffer)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setAiOpen(true)}
            style={[styles.action, styles.actionAI]}
            testID="ai-advice-btn"
          >
            <Icon name="sparkles" size={16} color={colors.onBrandPrimary} />
            <Text style={[styles.actionText, { color: colors.onBrandPrimary }]}>Ask AI what to pay</Text>
          </Pressable>
          <Pressable
            onPress={() => setSavingsOpen(true)}
            style={[styles.action, styles.actionSavings]}
            testID="savings-btn"
          >
            <Icon name="trending-up" size={16} color={colors.onSuccess} />
            <Text style={[styles.actionText, { color: colors.onSuccess }]}>Set savings</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>What to pay</Text>
        <View style={styles.card}>
          <AllocLine label="Vehicle payment" val={p.vehicle_payment} icon="car" />
          <AllocLine label="Targeted payoffs" val={p.targeted_payoffs} icon="flash" />
          <AllocLine label="Current month bills" val={p.current_month_bills} icon="receipt" />
          <AllocLine label="Next month bills" val={p.next_month_early_bills} icon="time" />
          <AllocLine label="Living costs" val={p.living_costs} icon="basket" />
          <AllocLine label="Savings transfer" val={p.savings_transfer} icon="trending-up" highlight />
        </View>

        <View style={styles.billsHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Bills ({p.bills.filter((b) => b.paid).length}/{p.bills.length})</Text>
            <Text style={styles.subHint}>
              {fmt(paidBills)} paid · {fmt(totalBills - paidBills)} remaining
            </Text>
          </View>
          <Pressable
            style={styles.addPill}
            onPress={() =>
              router.push({
                pathname: "/bill/new",
                params: {
                  month_key: p.month_key,
                  paycheck_id: p.id,
                  due_date: p.start_date || "",
                },
              })
            }
            testID="add-bill-inline"
          >
            <Icon name="add" size={16} color={colors.onSurfaceInverse} />
            <Text style={styles.addPillText}>Add bill</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {p.bills.map((b) => (
            <View key={b.id} style={styles.bill} testID={`detail-bill-${b.id}`}>
              <Pressable onPress={() => toggle.mutate({ bId: b.id, paid: !b.paid })} hitSlop={8}>
                <Icon
                  name={b.paid ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={b.paid ? colors.success : colors.muted}
                />
              </Pressable>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: "/bill/[id]", params: { id: b.id } })}
              >
                <Text style={[styles.billName, b.paid && styles.paid]}>{b.name}</Text>
                <Text style={styles.billMeta}>
                  {b.fraction ? `${b.fraction} · ` : ""}
                  {b.due_date ? `due ${b.due_date}` : "no date"}
                </Text>
              </Pressable>
              <Text style={[styles.billAmt, b.paid && styles.paid]}>{fmt(b.amount)}</Text>
            </View>
          ))}
          {p.bills.length === 0 && <Text style={styles.emptyText}>No bills yet — tap Add bill above.</Text>}
        </View>
      </ScrollView>

      {/* AI Advice Modal */}
      <Modal visible={aiOpen} animationType="slide" transparent onRequestClose={() => setAiOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAiOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="ai-sheet">
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Icon name="sparkles" size={18} color={colors.onSurface} />
            <Text style={styles.sheetTitle}>AI paycheck advice</Text>
            <Pressable onPress={() => setAiOpen(false)} hitSlop={8}>
              <Icon name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: spacing.md }}>
            {aiQ.isLoading ? (
              <View style={{ alignItems: "center", padding: spacing.xl }}>
                <ActivityIndicator color={colors.onSurface} />
                <Text style={styles.aiHint}>Thinking with Claude…</Text>
              </View>
            ) : aiQ.isError ? (
              <Text style={styles.aiError}>Couldn't get advice. Try again in a moment.</Text>
            ) : aiQ.data ? (
              <>
                {aiQ.data.summary ? <Text style={styles.aiSummary}>{aiQ.data.summary}</Text> : null}
                {aiQ.data.priority_order?.length ? (
                  <View style={{ gap: spacing.sm }}>
                    <Text style={styles.aiSection}>Pay in this order</Text>
                    {aiQ.data.priority_order.map((it, i) => (
                      <View key={i} style={styles.aiItem}>
                        <View style={styles.aiRank}>
                          <Text style={styles.aiRankText}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.aiItemName}>{it.name}</Text>
                          <Text style={styles.aiItemReason}>{it.reason}</Text>
                        </View>
                        <Text style={styles.aiItemAmt}>{fmt(it.amount)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {aiQ.data.recommended_savings != null ? (
                  <View style={styles.aiStat}>
                    <Text style={styles.aiStatLabel}>Recommended savings</Text>
                    <Text style={styles.aiStatVal}>{fmt(aiQ.data.recommended_savings)}</Text>
                  </View>
                ) : null}
                {aiQ.data.buffer_after != null ? (
                  <View style={styles.aiStat}>
                    <Text style={styles.aiStatLabel}>Estimated buffer after</Text>
                    <Text style={styles.aiStatVal}>{fmt(aiQ.data.buffer_after)}</Text>
                  </View>
                ) : null}
                {aiQ.data.raw ? <Text style={styles.aiRaw}>{aiQ.data.raw}</Text> : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {/* Savings Recommendation Modal */}
      <Modal visible={savingsOpen} animationType="slide" transparent onRequestClose={() => setSavingsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSavingsOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="savings-sheet">
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Icon name="trending-up" size={18} color={colors.onSurface} />
            <Text style={styles.sheetTitle}>Savings recommendation</Text>
            <Pressable onPress={() => setSavingsOpen(false)} hitSlop={8}>
              <Icon name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          {savingsQ.isLoading || !savingsQ.data ? (
            <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.lg }} />
          ) : (
            <>
              <Text style={styles.aiHint}>
                After ${savingsQ.data.fixed_obligations.toFixed(0)} fixed obligations and ${savingsQ.data.unpaid_bills.toFixed(0)} unpaid bills,
                you have <Text style={{ fontWeight: "700", color: colors.onSurface }}>{fmt(savingsQ.data.net_after_obligations)}</Text> free.
                Current savings transfer: <Text style={{ fontWeight: "700", color: colors.onSurface }}>{fmt(savingsQ.data.current_savings_transfer)}</Text>.
              </Text>
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <RecCard
                  label="Conservative · 10%"
                  amount={savingsQ.data.recommendations.conservative}
                  onPress={() => applySavings.mutate(savingsQ.data!.recommendations.conservative)}
                  testID="rec-conservative"
                />
                <RecCard
                  label="Balanced · 20%"
                  amount={savingsQ.data.recommendations.balanced}
                  onPress={() => applySavings.mutate(savingsQ.data!.recommendations.balanced)}
                  emphasize
                  testID="rec-balanced"
                />
                <RecCard
                  label="Aggressive · 35%"
                  amount={savingsQ.data.recommendations.aggressive}
                  onPress={() => applySavings.mutate(savingsQ.data!.recommendations.aggressive)}
                  testID="rec-aggressive"
                />
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

function AllocLine({
  label,
  val,
  icon,
  highlight,
}: {
  label: string;
  val: number;
  icon: string;
  highlight?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const dim = val === 0;
  return (
    <View style={styles.allocLine}>
      <View style={[styles.iconBox, highlight && { backgroundColor: colors.success }]}>
        <Icon name={icon as any} size={16} color={highlight ? colors.onSuccess : colors.onSurface} />
      </View>
      <Text style={[styles.allocLabel, dim && { opacity: 0.4 }]}>{label}</Text>
      <Text style={[styles.allocVal, dim && { opacity: 0.4 }]}>{fmt(val)}</Text>
    </View>
  );
}

function RecCard({
  label,
  amount,
  onPress,
  emphasize,
  testID,
}: {
  label: string;
  amount: number;
  onPress: () => void;
  emphasize?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={[styles.recCard, emphasize && styles.recCardEm]} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.recLabel, emphasize && styles.recLabelEm]}>{label}</Text>
        <Text style={[styles.recAmt, emphasize && styles.recAmtEm]}>{fmt(amount)}</Text>
      </View>
      <Text style={[styles.recCta, emphasize && styles.recCtaEm]}>Apply →</Text>
    </Pressable>
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
  back: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.onSurface },
  date: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cycleTag: { width: 14, height: 14, borderRadius: 7 },

  hero: { marginHorizontal: spacing.lg, borderRadius: radius.lg, padding: spacing.xl },
  heroLabel: { fontSize: 12, color: colors.onCycle, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 },
  heroValue: { fontSize: 40, fontWeight: "700", color: colors.onCycle, marginTop: spacing.sm },
  heroRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  heroBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.5)", padding: spacing.md, borderRadius: radius.md },
  heroBoxLabel: { fontSize: 11, color: colors.onCycle, opacity: 0.7 },
  heroBoxVal: { fontSize: 16, fontWeight: "700", color: colors.onCycle, marginTop: 2 },

  actionRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  actionAI: { backgroundColor: colors.brandPrimary },
  actionSavings: { backgroundColor: colors.success },
  actionText: { fontSize: 13, fontWeight: "700" },

  sectionTitle: {
    fontSize: 15, fontWeight: "700", color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm,
  },
  subHint: { fontSize: 12, color: colors.muted, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  billsHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingRight: spacing.lg },
  addPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.surfaceInverse,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  addPillText: { color: colors.onSurfaceInverse, fontSize: 12, fontWeight: "700" },

  card: { marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md },
  allocLine: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  iconBox: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  allocLabel: { flex: 1, fontSize: 14, color: colors.onSurface },
  allocVal: { fontSize: 14, fontWeight: "700", color: colors.onSurface },

  bill: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
  },
  billName: { fontSize: 14, color: colors.onSurfaceSecondary, fontWeight: "600" },
  billMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  billAmt: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  paid: { textDecorationLine: "line-through", opacity: 0.5 },
  emptyText: { fontSize: 12, color: colors.muted, fontStyle: "italic", textAlign: "center", padding: spacing.xl },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.onSurface },

  aiHint: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  aiError: { fontSize: 13, color: colors.error, padding: spacing.md },
  aiSummary: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  aiSection: { fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" },
  aiItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md },
  aiRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceInverse, alignItems: "center", justifyContent: "center" },
  aiRankText: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 12 },
  aiItemName: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  aiItemReason: { fontSize: 11, color: colors.muted, marginTop: 2 },
  aiItemAmt: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  aiStat: { flexDirection: "row", justifyContent: "space-between", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.success },
  aiStatLabel: { fontSize: 12, color: colors.onSuccess, fontWeight: "600" },
  aiStatVal: { fontSize: 14, color: colors.onSuccess, fontWeight: "700" },
  aiRaw: { fontSize: 12, color: colors.muted, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },

  recCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  recCardEm: { backgroundColor: colors.surfaceInverse },
  recLabel: { fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" },
  recLabelEm: { color: colors.onSurfaceInverse, opacity: 0.7 },
  recAmt: { fontSize: 20, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  recAmtEm: { color: colors.onSurfaceInverse },
  recCta: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  recCtaEm: { color: colors.onSurfaceInverse },
}));
