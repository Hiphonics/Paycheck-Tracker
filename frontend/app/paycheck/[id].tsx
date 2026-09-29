import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api, Goal, SavingsRec } from "@/src/api";
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
    mutationFn: async ({ amount, goalId }: { amount: number; goalId: string | null }) => {
      await api.updatePaycheck(id!, { savings_transfer: amount });
      if (goalId && amount > 0) {
        await api.contributeGoal(goalId, amount, `From paycheck ${q.data?.number ?? ""}`);
      }
      return { amount, goalId };
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["paycheck", id] }),
        qc.invalidateQueries({ queryKey: ["savings-rec", id] }),
        qc.invalidateQueries({ queryKey: ["months"] }),
        qc.invalidateQueries({ queryKey: ["month"] }),
        qc.invalidateQueries({ queryKey: ["month-full"] }),
        qc.invalidateQueries({ queryKey: ["summary"] }),
        qc.invalidateQueries({ queryKey: ["goals"] }),
        qc.invalidateQueries({ queryKey: ["streak"] }),
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

      {/* Savings Modal: dollar amount + optional goal */}
      <Modal visible={savingsOpen} animationType="slide" transparent onRequestClose={() => setSavingsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSavingsOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="savings-sheet">
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Icon name="trending-up" size={18} color={colors.onSurface} />
            <Text style={styles.sheetTitle}>Set savings amount</Text>
            <Pressable onPress={() => setSavingsOpen(false)} hitSlop={8}>
              <Icon name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          {savingsQ.isLoading || !savingsQ.data ? (
            <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.lg }} />
          ) : (
            <SavingsForm
              paycheckId={id!}
              rec={savingsQ.data}
              onApply={(amount, goalId) => applySavings.mutate({ amount, goalId })}
              submitting={applySavings.isPending}
            />
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

function SavingsForm({
  paycheckId,
  rec,
  onApply,
  submitting,
}: {
  paycheckId: string;
  rec: SavingsRec;
  onApply: (amount: number, goalId: string | null) => void;
  submitting: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [amount, setAmount] = useState(String(rec.current_savings_transfer || rec.recommendations.balanced || 0));
  const [goalId, setGoalId] = useState<string | null>(null);

  const goalsQ = useQuery({ queryKey: ["goals"], queryFn: api.listGoals });
  const parsed = parseFloat(amount) || 0;
  const overNet = parsed > rec.net_after_obligations && rec.net_after_obligations > 0;

  const presets = Array.from(new Set([
    ...(rec.presets || []),
    Math.round(rec.recommendations.conservative),
    Math.round(rec.recommendations.balanced),
    Math.round(rec.recommendations.aggressive),
  ].filter((n) => n > 0))).sort((a, b) => a - b).slice(0, 6);

  return (
    <KeyboardAwareScrollView contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
      <Text style={styles.aiHint}>
        Total available: <Text style={styles.formStrong}>{fmt(rec.total_cash)}</Text> · Fixed obligations:{" "}
        <Text style={styles.formStrong}>{fmt(rec.fixed_obligations)}</Text> · Free to save:{" "}
        <Text style={styles.formStrong}>{fmt(rec.net_after_obligations)}</Text>
      </Text>

      <View>
        <Text style={styles.formLabel}>How much to save this paycheck?</Text>
        <View style={styles.dollarInputWrap}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.dollarInput}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={colors.muted}
            testID="input-savings-amount"
            selectTextOnFocus
          />
        </View>
        {overNet ? (
          <Text style={styles.warnText}>Over your free-to-save balance — will pull from buffer.</Text>
        ) : (
          <Text style={styles.aiHint}>
            Was {fmt(rec.current_savings_transfer)} · Free {fmt(rec.net_after_obligations)}
          </Text>
        )}
      </View>

      {presets.length ? (
        <View>
          <Text style={styles.formLabel}>Quick picks</Text>
          <View style={styles.presetRow}>
            {presets.map((p) => (
              <Pressable
                key={p}
                onPress={() => setAmount(String(p))}
                style={[styles.presetChip, parsed === p && styles.presetChipActive]}
                testID={`preset-${p}`}
              >
                <Text style={[styles.presetText, parsed === p && styles.presetTextActive]}>
                  ${p}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <Text style={styles.formLabel}>Send to a goal (optional)</Text>
        {goalsQ.data && goalsQ.data.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}
          >
            <Pressable
              onPress={() => setGoalId(null)}
              style={[styles.goalPick, goalId === null && styles.goalPickActive]}
              testID="goal-pick-none"
            >
              <Text style={[styles.goalPickText, goalId === null && styles.goalPickTextActive]}>
                No goal
              </Text>
            </Pressable>
            {goalsQ.data.map((g: Goal) => {
              const c = colors[g.color as keyof typeof colors] as string;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => setGoalId(g.id)}
                  style={[
                    styles.goalPick,
                    goalId === g.id && { backgroundColor: c, borderColor: c },
                  ]}
                  testID={`goal-pick-${g.id}`}
                >
                  <Icon
                    name={g.icon as any}
                    size={14}
                    color={goalId === g.id ? colors.onCycle : colors.onSurface}
                  />
                  <Text
                    style={[
                      styles.goalPickText,
                      goalId === g.id && { color: colors.onCycle },
                    ]}
                  >
                    {g.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.aiHint}>
            No savings goals yet. Add one from the Tracker tab to route savings toward a car, house, etc.
          </Text>
        )}
      </View>

      <Pressable
        style={[styles.savePrimary, submitting && { opacity: 0.6 }]}
        disabled={submitting}
        onPress={() => onApply(parsed, goalId)}
        testID="apply-savings"
      >
        {submitting ? (
          <ActivityIndicator color={colors.onSurfaceInverse} />
        ) : (
          <Text style={styles.savePrimaryText}>
            Save {fmt(parsed)}
            {goalId ? " → goal" : ""}
          </Text>
        )}
      </Pressable>
    </KeyboardAwareScrollView>
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

  formStrong: { fontWeight: "700", color: colors.onSurface },
  formLabel: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
    marginBottom: 6,
  },
  dollarInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dollarSign: { fontSize: 24, fontWeight: "700", color: colors.muted, marginRight: 4 },
  dollarInput: { flex: 1, fontSize: 26, fontWeight: "700", color: colors.onSurface },
  warnText: { fontSize: 11, color: colors.warning, marginTop: 6 },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  presetChip: {
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  presetChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  presetText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },
  presetTextActive: { color: colors.onSurfaceInverse },

  goalPick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalPickActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  goalPickText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary },
  goalPickTextActive: { color: colors.onSurfaceInverse },

  savePrimary: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.md,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  savePrimaryText: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 15 },
}));
