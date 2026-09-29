import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Icon from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api, Goal } from "@/src/api";
import { makeStyles, spacing, radius, useTheme, ThemeColors } from "@/src/theme";
import { fmt } from "@/src/components/stat-tile";

const GOAL_ICONS = ["car", "home", "airplane", "school", "gift", "heart", "medkit", "leaf", "wallet"];
const GOAL_COLORS = ["cycleBlue", "cyclePurple", "cycleGreen", "cycleYellow", "cycleOrange"];

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const [contribute, setContribute] = useState<Goal | null>(null);
  const [contribAmt, setContribAmt] = useState("");

  const goalsQ = useQuery({ queryKey: ["goals"], queryFn: api.listGoals });

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["goals"] }),
      qc.invalidateQueries({ queryKey: ["streak"] }),
    ]);

  const removeGoal = useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
    },
  });

  const doContribute = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.contributeGoal(id, amount),
    onSuccess: async () => {
      await invalidate();
      setContribute(null);
      setContribAmt("");
    },
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="goals-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Savings goals</Text>
          <Text style={styles.subtitle}>Car, house, trip — anything you&apos;re saving toward.</Text>
        </View>
        <Pressable
          onPress={() => setCreating(true)}
          style={[styles.iconBtn, { backgroundColor: colors.surfaceInverse }]}
          testID="add-goal-btn"
        >
          <Icon name="add" size={20} color={colors.onSurfaceInverse} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}
      >
        {goalsQ.isLoading ? (
          <ActivityIndicator color={colors.onSurface} />
        ) : goalsQ.data && goalsQ.data.length > 0 ? (
          goalsQ.data.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={() => setEditing(g)}
              onContribute={() => setContribute(g)}
            />
          ))
        ) : (
          <View style={styles.empty}>
            <Icon name="wallet-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>No goals yet</Text>
            <Text style={styles.emptyHint}>
              Add a car, house, emergency fund, or trip — then route paycheck savings straight to it.
            </Text>
            <Pressable
              onPress={() => setCreating(true)}
              style={[styles.primary, { marginTop: spacing.md }]}
            >
              <Text style={styles.primaryText}>Create your first goal</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Create / Edit sheet */}
      <Modal
        visible={creating || !!editing}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="goal-form-sheet">
          <View style={styles.sheetHandle} />
          <GoalForm
            existing={editing}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
            onDelete={
              editing ? () => removeGoal.mutate(editing.id) : undefined
            }
          />
        </View>
      </Modal>

      {/* Contribute sheet */}
      <Modal
        visible={!!contribute}
        animationType="slide"
        transparent
        onRequestClose={() => setContribute(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setContribute(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Icon name={(contribute?.icon as any) || "wallet"} size={18} color={colors.onSurface} />
            <Text style={styles.sheetTitle}>Add to {contribute?.name}</Text>
            <Pressable onPress={() => setContribute(null)} hitSlop={8}>
              <Icon name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <View style={{ gap: spacing.md }}>
            <View style={styles.dollarWrap}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.dollarInput}
                keyboardType="decimal-pad"
                value={contribAmt}
                onChangeText={setContribAmt}
                placeholder="0"
                placeholderTextColor={colors.muted}
                testID="input-contribute"
                selectTextOnFocus
              />
            </View>
            <View style={styles.presetRow}>
              {[25, 50, 100, 200, 500].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setContribAmt(String(n))}
                  style={styles.presetChip}
                >
                  <Text style={styles.presetText}>${n}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.primary, !parseFloat(contribAmt) && { opacity: 0.4 }]}
              disabled={!parseFloat(contribAmt) || doContribute.isPending}
              onPress={() =>
                contribute && doContribute.mutate({ id: contribute.id, amount: parseFloat(contribAmt) })
              }
              testID="confirm-contribute"
            >
              {doContribute.isPending ? (
                <ActivityIndicator color={colors.onSurfaceInverse} />
              ) : (
                <Text style={styles.primaryText}>Add {fmt(parseFloat(contribAmt) || 0)}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function GoalCard({
  goal,
  onEdit,
  onContribute,
}: {
  goal: Goal;
  onEdit: () => void;
  onContribute: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const pct = goal.target_amount > 0 ? Math.min(1, goal.current_amount / goal.target_amount) : 0;
  const bg = colors[goal.color as keyof typeof colors] as string;
  const remaining = Math.max(0, goal.target_amount - goal.current_amount);

  return (
    <View style={[styles.card, { backgroundColor: bg }]} testID={`goal-${goal.id}`}>
      <View style={styles.cardRow}>
        <View style={styles.iconWrap}>
          <Icon name={goal.icon as any} size={22} color={colors.onCycle} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{goal.name}</Text>
          <Text style={styles.cardMeta}>
            {fmt(goal.current_amount)} of {fmt(goal.target_amount)}
          </Text>
        </View>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Icon name="pencil" size={16} color={colors.onCycle} />
        </Pressable>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>{Math.round(pct * 100)}% · {fmt(remaining)} to go</Text>
        <Pressable style={styles.contribBtn} onPress={onContribute} testID={`contribute-${goal.id}`}>
          <Icon name="add" size={14} color={colors.onSurface} />
          <Text style={styles.contribText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GoalForm({
  existing,
  onClose,
  onDelete,
}: {
  existing: Goal | null;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name || "");
  const [target, setTarget] = useState(String(existing?.target_amount ?? ""));
  const [icon, setIcon] = useState(existing?.icon || "car");
  const [color, setColor] = useState(existing?.color || "cycleBlue");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["goals"] });

  const save = useMutation({
    mutationFn: async () => {
      const targetNum = parseFloat(target) || 0;
      if (existing) {
        return api.updateGoal(existing.id, {
          name,
          target_amount: targetNum,
          icon,
          color,
        });
      }
      return api.createGoal({
        name,
        target_amount: targetNum,
        icon,
        color,
      });
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const canSave = name.trim().length > 0 && (parseFloat(target) || 0) > 0;

  return (
    <KeyboardAwareScrollView contentContainerStyle={{ gap: spacing.md }}>
      <View style={styles.sheetHeader}>
        <Icon name={icon as any} size={18} color={colors.onSurface} />
        <Text style={styles.sheetTitle}>{existing ? "Edit goal" : "New savings goal"}</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Icon name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <View>
        <Text style={styles.formLabel}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Emergency fund, House down payment…"
          placeholderTextColor={colors.muted}
          testID="input-goal-name"
        />
      </View>

      <View>
        <Text style={styles.formLabel}>Target amount</Text>
        <View style={styles.dollarWrap}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.dollarInput}
            keyboardType="decimal-pad"
            value={target}
            onChangeText={setTarget}
            placeholder="0"
            placeholderTextColor={colors.muted}
            testID="input-goal-target"
          />
        </View>
      </View>

      <View>
        <Text style={styles.formLabel}>Icon</Text>
        <View style={styles.presetRow}>
          {GOAL_ICONS.map((i) => (
            <Pressable
              key={i}
              onPress={() => setIcon(i)}
              style={[styles.iconChip, icon === i && styles.iconChipActive]}
              testID={`icon-${i}`}
            >
              <Icon
                name={i as any}
                size={18}
                color={icon === i ? colors.onSurfaceInverse : colors.onSurface}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text style={styles.formLabel}>Color</Text>
        <View style={styles.presetRow}>
          {GOAL_COLORS.map((c) => {
            const bg = colors[c as keyof typeof colors] as string;
            return (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.colorChip,
                  { backgroundColor: bg },
                  color === c && styles.colorChipActive,
                ]}
                testID={`color-${c}`}
              />
            );
          })}
        </View>
      </View>

      <Pressable
        style={[styles.primary, !canSave && { opacity: 0.4 }]}
        disabled={!canSave || save.isPending}
        onPress={() => save.mutate()}
        testID="save-goal"
      >
        {save.isPending ? (
          <ActivityIndicator color={colors.onSurfaceInverse} />
        ) : (
          <Text style={styles.primaryText}>{existing ? "Save changes" : "Create goal"}</Text>
        )}
      </Pressable>

      {onDelete ? (
        <Pressable onPress={onDelete} style={styles.deleteBtn} testID="delete-goal">
          <Icon name="trash" size={16} color={colors.error} />
          <Text style={styles.deleteText}>Delete goal</Text>
        </Pressable>
      ) : null}
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
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },

  card: { padding: spacing.lg, borderRadius: radius.lg, gap: spacing.md },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  cardName: { fontSize: 16, fontWeight: "700", color: colors.onCycle },
  cardMeta: { fontSize: 12, color: colors.onCycle, opacity: 0.8, marginTop: 2 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  contribBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  contribText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  progressBar: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.surface, borderRadius: radius.pill },

  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  emptyHint: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 20 },

  primary: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 15 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: "88%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.onSurface },

  formLabel: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
    marginBottom: 6,
  },
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
  dollarWrap: {
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
  presetText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceSecondary },

  iconChip: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  iconChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  colorChip: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: "transparent",
  },
  colorChipActive: { borderColor: colors.onSurface },

  deleteBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.md,
  },
  deleteText: { color: colors.error, fontWeight: "700", fontSize: 14 },
}));
