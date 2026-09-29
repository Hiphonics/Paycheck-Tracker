import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
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

  const q = useQuery({
    queryKey: ["paycheck", id],
    queryFn: () => api.getPaycheck(id!),
    enabled: !!id,
  });

  const toggle = useMutation({
    mutationFn: ({ bId, paid }: { bId: string; paid: boolean }) => api.toggleBill(bId, paid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paycheck", id] }),
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

        <Text style={styles.sectionTitle}>What to pay</Text>
        <View style={styles.card}>
          <AllocLine label="Vehicle payment" val={p.vehicle_payment} icon="car" />
          <AllocLine label="Targeted payoffs" val={p.targeted_payoffs} icon="flash" />
          <AllocLine label="Current month bills" val={p.current_month_bills} icon="receipt" />
          <AllocLine label="Next month bills" val={p.next_month_early_bills} icon="time" />
          <AllocLine label="Living costs" val={p.living_costs} icon="basket" />
          <AllocLine label="Savings transfer" val={p.savings_transfer} icon="trending-up" highlight />
        </View>

        <Text style={styles.sectionTitle}>
          Bills ({p.bills.filter((b) => b.paid).length}/{p.bills.length})
        </Text>
        <Text style={styles.subHint}>
          {fmt(paidBills)} paid · {fmt(totalBills - paidBills)} remaining
        </Text>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {p.bills.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => toggle.mutate({ bId: b.id, paid: !b.paid })}
              style={styles.bill}
              testID={`detail-bill-${b.id}`}
            >
              <Icon
                name={b.paid ? "checkmark-circle" : "ellipse-outline"}
                size={24}
                color={b.paid ? colors.success : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.billName, b.paid && styles.paid]}>{b.name}</Text>
                {b.fraction ? <Text style={styles.billFrac}>{b.fraction}</Text> : null}
              </View>
              <Text style={[styles.billAmt, b.paid && styles.paid]}>{fmt(b.amount)}</Text>
            </Pressable>
          ))}
          {p.bills.length === 0 && <Text style={styles.emptyText}>No bills for this paycheck.</Text>}
        </View>
      </ScrollView>
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

  sectionTitle: {
    fontSize: 15, fontWeight: "700", color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm,
  },
  subHint: { fontSize: 12, color: colors.muted, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  card: { marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md },
  allocLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
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
  billFrac: { fontSize: 11, color: colors.muted, marginTop: 2 },
  billAmt: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  paid: { textDecorationLine: "line-through", opacity: 0.5 },
  emptyText: { fontSize: 12, color: colors.muted, fontStyle: "italic", textAlign: "center", padding: spacing.xl },
}));
