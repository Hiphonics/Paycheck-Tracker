import { View, Text } from "react-native";
import { makeStyles, spacing, radius } from "@/src/theme";
import type { ThemeColors } from "@/src/theme";

export function StatTile({
  label,
  value,
  tone = "surface",
  testID,
}: {
  label: string;
  value: string;
  tone?: "surface" | "brand" | "success" | "warning";
  testID?: string;
}) {
  const styles = useStyles();
  const bg =
    tone === "brand"
      ? styles.brand
      : tone === "success"
      ? styles.success
      : tone === "warning"
      ? styles.warning
      : styles.surface;
  const fg =
    tone === "brand"
      ? styles.brandText
      : tone === "success"
      ? styles.successText
      : tone === "warning"
      ? styles.warningText
      : styles.surfaceText;

  return (
    <View style={[styles.tile, bg]} testID={testID}>
      <Text style={[styles.label, fg]}>{label}</Text>
      <Text style={[styles.value, fg]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors: ThemeColors) => ({
  tile: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.lg,
    minHeight: 92,
    justifyContent: "space-between",
  },
  surface: { backgroundColor: colors.surfaceSecondary },
  brand: { backgroundColor: colors.brandPrimary },
  success: { backgroundColor: colors.success },
  warning: { backgroundColor: colors.warning },
  label: { fontSize: 12, fontWeight: "500", opacity: 0.85 },
  value: { fontSize: 22, fontWeight: "700", marginTop: spacing.sm, fontFamily: "System" },
  surfaceText: { color: colors.onSurfaceSecondary },
  brandText: { color: colors.onBrandPrimary },
  successText: { color: colors.onSuccess },
  warningText: { color: colors.onWarning },
}));

export function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
