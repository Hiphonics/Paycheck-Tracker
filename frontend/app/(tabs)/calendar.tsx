import { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/ionicons";
import { api, Bill } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const monthsQ = useQuery({ queryKey: ["months"], queryFn: api.listMonths });
  const months = monthsQ.data ?? [];
  const activeKey = selectedKey ?? months[0]?.key ?? null;
  const activeMonth = months.find((m) => m.key === activeKey);

  const detailQ = useQuery({
    queryKey: ["month", activeKey],
    queryFn: () => api.getMonth(activeKey!),
    enabled: !!activeKey,
  });
  const billsQ = useQuery({
    queryKey: ["bills-month", activeKey],
    queryFn: () => api.listBills({ month_key: activeKey! }),
    enabled: !!activeKey,
  });

  const toggle = useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) => api.toggleBill(id, paid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills-month", activeKey] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const paychecks = detailQ.data?.paychecks ?? [];
  const bills = billsQ.data ?? [];

  // day -> paychecks starting, bills due, colored dots
  const dayIndex = useMemo(() => {
    const idx = new Map<number, { pcColors: string[]; bills: Bill[] }>();
    if (!activeMonth) return idx;
    for (const p of paychecks) {
      if (p.start_date) {
        const [, , dd] = p.start_date.split("-").map(Number);
        if (dd) {
          const rec = idx.get(dd) ?? { pcColors: [], bills: [] };
          rec.pcColors.push(p.color_cycle);
          idx.set(dd, rec);
        }
      }
    }
    for (const b of bills) {
      if (b.due_date) {
        const parts = b.due_date.split("-").map(Number);
        // only show bills falling in the active month
        if (parts[0] === activeMonth.year && parts[1] === activeMonth.month) {
          const dd = parts[2];
          const rec = idx.get(dd) ?? { pcColors: [], bills: [] };
          rec.bills.push(b);
          idx.set(dd, rec);
        }
      }
    }
    return idx;
  }, [activeMonth, paychecks, bills]);

  const daysGrid = useMemo(() => {
    if (!activeMonth) return [] as (number | null)[];
    const firstDow = new Date(activeMonth.year, activeMonth.month - 1, 1).getDay();
    const total = daysInMonth(activeMonth.year, activeMonth.month);
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [activeMonth]);

  const selectedBills = useMemo(() => {
    if (!activeMonth || !selectedDay) return [] as Bill[];
    return bills.filter((b) => {
      if (!b.due_date) return false;
      const parts = b.due_date.split("-").map(Number);
      return parts[0] === activeMonth.year && parts[1] === activeMonth.month && parts[2] === selectedDay;
    });
  }, [activeMonth, selectedDay, bills]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="calendar-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>Tap any day to see bills.</Text>
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => {
            const dd = selectedDay ?? new Date().getDate();
            const y = activeMonth?.year ?? new Date().getFullYear();
            const m = activeMonth?.month ?? new Date().getMonth() + 1;
            const due = `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
            router.push({
              pathname: "/bill/new",
              params: { month_key: activeKey ?? "", due_date: due },
            });
          }}
          testID="add-bill-btn"
        >
          <Icon name="add" size={22} color={colors.onSurfaceInverse} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {months.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => {
              setSelectedKey(m.key);
              setSelectedDay(null);
            }}
            style={[styles.chip, activeKey === m.key && styles.chipActive]}
            testID={`calendar-month-${m.key}`}
          >
            <Text style={[styles.chipText, activeKey === m.key && styles.chipTextActive]}>
              {m.name.replace(" 2026", "")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.gridWrap}>
          <View style={styles.dowRow}>
            {DOW.map((d, i) => (
              <Text key={i} style={styles.dow}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {daysGrid.map((day, i) => {
              const isEmpty = day == null;
              const info = day ? dayIndex.get(day) : undefined;
              const isSelected = selectedDay === day;
              const hasBills = info && info.bills.length > 0;
              const bgColor = info && info.pcColors[0] ? colors[info.pcColors[0] as keyof ThemeColors] as string : undefined;
              return (
                <Pressable
                  key={i}
                  onPress={() => day && setSelectedDay(day)}
                  style={[
                    styles.cell,
                    isEmpty && styles.cellEmpty,
                    bgColor ? { backgroundColor: bgColor } : null,
                    isSelected && styles.cellSelected,
                  ]}
                  testID={day ? `day-${day}` : undefined}
                >
                  {day ? (
                    <>
                      <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
                        {day}
                      </Text>
                      {hasBills ? (
                        <View style={styles.billDot} />
                      ) : null}
                    </>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            <LegendDot color={colors.cycleBlue} label="Paycheck start" />
            <LegendDot color={colors.error} label="Bill due" />
          </View>
        </View>

        {/* Selected day panel */}
        {selectedDay ? (
          <View style={styles.selectedPanel}>
            <View style={styles.selectedHeader}>
              <Text style={styles.selectedTitle}>
                {activeMonth?.name.split(" ")[0]} {selectedDay}
              </Text>
              <Text style={styles.selectedSub}>
                {selectedBills.length} bill{selectedBills.length === 1 ? "" : "s"}
              </Text>
            </View>
            {selectedBills.length === 0 ? (
              <Text style={styles.emptyText}>No bills on this day.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {selectedBills.map((b) => (
                  <BillRow
                    key={b.id}
                    bill={b}
                    onToggle={() => toggle.mutate({ id: b.id, paid: !b.paid })}
                    onEdit={() => router.push({ pathname: "/bill/[id]", params: { id: b.id } })}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}

        {/* Paychecks in month with bills */}
        <Text style={styles.sectionTitle}>Paycheck cycles</Text>
        {detailQ.isLoading ? (
          <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.xl }} />
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {paychecks.map((p) => {
              const pcBills = bills.filter((b) => b.paycheck_id === p.id);
              const paid = pcBills.filter((b) => b.paid).length;
              const total = pcBills.reduce((s, b) => s + b.amount, 0);
              const cycleColor = colors[p.color_cycle as keyof ThemeColors] as string;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/paycheck/${p.id}`)}
                  style={styles.pcRow}
                  testID={`cal-paycheck-${p.id}`}
                >
                  <View style={[styles.pcDot, { backgroundColor: cycleColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pcName}>Paycheck {p.number}</Text>
                    <Text style={styles.pcMeta}>
                      {p.date_range} · {paid}/{pcBills.length} paid
                    </Text>
                  </View>
                  <Text style={styles.pcAmt}>{fmt(total)}</Text>
                  <Icon name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function BillRow({
  bill,
  onToggle,
  onEdit,
}: {
  bill: Bill;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.billRow} testID={`bill-row-${bill.id}`}>
      <Pressable onPress={onToggle} hitSlop={8}>
        <Icon
          name={bill.paid ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={bill.paid ? colors.success : colors.muted}
        />
      </Pressable>
      <Pressable style={{ flex: 1 }} onPress={onEdit}>
        <Text style={[styles.billName, bill.paid && styles.billPaid]}>{bill.name}</Text>
        {bill.fraction ? <Text style={styles.billFrac}>{bill.fraction}</Text> : null}
      </Pressable>
      <Text style={[styles.billAmt, bill.paid && styles.billPaid]}>{fmt(bill.amount)}</Text>
      <Pressable onPress={onEdit} hitSlop={8}>
        <Icon name="pencil" size={14} color={colors.muted} />
      </Pressable>
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
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceInverse,
    alignItems: "center", justifyContent: "center",
  },

  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.md },
  chip: {
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onSurfaceInverse },

  gridWrap: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
  },
  dowRow: { flexDirection: "row", paddingBottom: spacing.sm },
  dow: { flex: 1, textAlign: "center", fontSize: 11, color: colors.muted, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  cellEmpty: { opacity: 0 },
  cellSelected: { borderWidth: 2, borderColor: colors.onSurface },
  dayNum: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  dayNumSelected: { fontWeight: "800" },
  billDot: {
    position: "absolute",
    bottom: 6,
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: colors.error,
  },

  legend: { flexDirection: "row", gap: spacing.md, paddingTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.muted },

  selectedPanel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
  },
  selectedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.md,
  },
  selectedTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  selectedSub: { fontSize: 12, color: colors.muted },

  billRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  billName: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  billFrac: { fontSize: 11, color: colors.muted, marginTop: 2 },
  billAmt: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  billPaid: { textDecorationLine: "line-through", opacity: 0.5 },
  emptyText: { fontSize: 12, color: colors.muted, fontStyle: "italic" },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  pcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
  },
  pcDot: { width: 12, height: 12, borderRadius: 6 },
  pcName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  pcMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pcAmt: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
}));
