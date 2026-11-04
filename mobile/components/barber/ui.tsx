import Feather from "@expo/vector-icons/Feather";
import React from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { statusLabel } from "@/lib/barber/utils";

export const BARBER_COLORS = {
  background: "#080808",
  card: "#181816",
  cardAlt: "#11110f",
  border: "#5A4820",
  gold: "#E7B94E",
  goldMuted: "#A98A3A",
  text: "#FFFFFF",
  textMuted: "#B9B4A8",
  danger: "#F07A68",
  success: "#75C99A",
};

export function Screen({
  children,
  scroll = true,
  contentStyle,
  keyboard = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  keyboard?: boolean;
}) {
  const content = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scrollContent, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function BrandHeader({ subtitle, compact = false }: { subtitle?: string; compact?: boolean }) {
  return (
    <View style={[styles.brandHeader, compact && styles.brandHeaderCompact]}>
      <Image source={require("@/assets/images/barber-logo.png")} style={compact ? styles.logoSmall : styles.logo} resizeMode="contain" />
      {subtitle ? <Text style={styles.brandSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>SISTEMAS HP</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  children,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Feather>["name"];
  style?: ViewStyle;
}) {
  const textColor = variant === "primary" ? BARBER_COLORS.background : variant === "danger" ? BARBER_COLORS.danger : BARBER_COLORS.gold;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        variant === "ghost" && styles.buttonGhost,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : icon ? <Feather name={icon} size={18} color={textColor} /> : null}
      {!loading ? <Text style={[styles.buttonText, { color: textColor }]}>{children}</Text> : null}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={BARBER_COLORS.textMuted}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function ChoiceChip({ label, selected, onPress, disabled = false }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function DateStrip({ dates, selected, onSelect }: { dates: string[]; selected: string; onSelect: (date: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
      {dates.map((date) => {
        const [, month, day] = date.split("-");
        const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(Number(date.slice(0, 4)), Number(month) - 1, Number(day)));
        return (
          <Pressable key={date} onPress={() => onSelect(date)} style={[styles.dateItem, selected === date && styles.dateItemSelected]}>
            <Text style={[styles.dateWeekday, selected === date && styles.dateTextSelected]}>{weekday.replace(".", "")}</Text>
            <Text style={[styles.dateDay, selected === date && styles.dateTextSelected]}>{day}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function LoadingState({ label = "Carregando..." }: { label?: string }) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator color={BARBER_COLORS.gold} size="large" />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={styles.stateCard}>
      <Feather name="alert-circle" size={25} color={BARBER_COLORS.danger} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <Button variant="secondary" icon="refresh-cw" onPress={onRetry}>Tentar novamente</Button> : null}
    </Card>
  );
}

export function EmptyState({ icon = "inbox", title, text }: { icon?: React.ComponentProps<typeof Feather>["name"]; title: string; text?: string }) {
  return (
    <View style={styles.emptyState}>
      <Feather name={icon} size={28} color={BARBER_COLORS.goldMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.stateText}>{text}</Text> : null}
    </View>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "danger" | "success" }) {
  const color = tone === "danger" ? BARBER_COLORS.danger : tone === "success" ? BARBER_COLORS.success : BARBER_COLORS.gold;
  return (
    <View style={[styles.notice, { borderColor: color }]}>
      <Feather name={tone === "danger" ? "alert-triangle" : "info"} size={17} color={color} />
      <Text style={[styles.noticeText, { color }]}>{children}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color = status === "confirmed" || status === "completed" ? BARBER_COLORS.success : status === "cancelled" || status === "no_show" ? BARBER_COLORS.danger : BARBER_COLORS.gold;
  return <Text style={[styles.statusBadge, { color, borderColor: color }]}>{statusLabel(status)}</Text>;
}

export function ConfirmModal({ visible, title, message, confirmLabel = "Confirmar", danger = false, onCancel, onConfirm }: { visible: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <View style={styles.modalActions}>
            <Button variant="ghost" onPress={onCancel}>Voltar</Button>
            <Button variant={danger ? "danger" : "primary"} onPress={onConfirm}>{confirmLabel}</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BARBER_COLORS.background },
  flex: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 36, gap: 16 },
  brandHeader: { alignItems: "center", gap: 9, paddingTop: 12, paddingBottom: 24 },
  brandHeaderCompact: { paddingTop: 0, paddingBottom: 8 },
  logo: { width: 170, height: 120 },
  logoSmall: { width: 95, height: 68 },
  brandSubtitle: { color: BARBER_COLORS.textMuted, fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  eyebrow: { color: BARBER_COLORS.gold, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { color: BARBER_COLORS.text, fontSize: 27, fontWeight: "800" },
  subtitle: { color: BARBER_COLORS.textMuted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: BARBER_COLORS.card, borderColor: BARBER_COLORS.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  button: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  buttonPrimary: { backgroundColor: BARBER_COLORS.gold },
  buttonSecondary: { backgroundColor: "transparent", borderColor: BARBER_COLORS.gold, borderWidth: 1 },
  buttonDanger: { backgroundColor: "transparent", borderColor: BARBER_COLORS.danger, borderWidth: 1 },
  buttonGhost: { backgroundColor: "transparent", paddingHorizontal: 12 },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  buttonText: { fontSize: 15, fontWeight: "800" },
  fieldWrap: { gap: 7 },
  label: { color: BARBER_COLORS.text, fontSize: 13, fontWeight: "700" },
  input: { minHeight: 50, borderRadius: 10, borderWidth: 1, borderColor: BARBER_COLORS.border, backgroundColor: BARBER_COLORS.cardAlt, color: BARBER_COLORS.text, paddingHorizontal: 14, fontSize: 16 },
  inputMultiline: { minHeight: 90, paddingTop: 13, textAlignVertical: "top" },
  fieldError: { color: BARBER_COLORS.danger, fontSize: 12 },
  chip: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: BARBER_COLORS.border, paddingHorizontal: 14, justifyContent: "center", backgroundColor: BARBER_COLORS.cardAlt },
  chipSelected: { borderColor: BARBER_COLORS.gold, backgroundColor: "#302712" },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: BARBER_COLORS.textMuted, fontWeight: "700", fontSize: 14 },
  chipTextSelected: { color: BARBER_COLORS.gold },
  dateStrip: { gap: 8, paddingVertical: 4 },
  dateItem: { minWidth: 66, minHeight: 64, borderRadius: 12, borderWidth: 1, borderColor: BARBER_COLORS.border, backgroundColor: BARBER_COLORS.cardAlt, justifyContent: "center", alignItems: "center", gap: 4 },
  dateItemSelected: { backgroundColor: BARBER_COLORS.gold, borderColor: BARBER_COLORS.gold },
  dateWeekday: { color: BARBER_COLORS.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  dateDay: { color: BARBER_COLORS.text, fontSize: 18, fontWeight: "800" },
  dateTextSelected: { color: BARBER_COLORS.background },
  sectionTitle: { color: BARBER_COLORS.text, fontSize: 17, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  muted: { color: BARBER_COLORS.textMuted, fontSize: 14, lineHeight: 20 },
  body: { color: BARBER_COLORS.text, fontSize: 15, lineHeight: 21 },
  gold: { color: BARBER_COLORS.gold },
  centerState: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14, padding: 28 },
  stateText: { color: BARBER_COLORS.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  stateCard: { alignItems: "center", marginTop: 8 },
  errorText: { color: BARBER_COLORS.danger, fontSize: 14, lineHeight: 20, textAlign: "center" },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 30 },
  emptyTitle: { color: BARBER_COLORS.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  notice: { borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", gap: 9, alignItems: "flex-start" },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  statusBadge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: BARBER_COLORS.card, borderColor: BARBER_COLORS.border, borderWidth: 1, borderRadius: 16, padding: 20, gap: 14 },
  modalTitle: { color: BARBER_COLORS.text, fontSize: 19, fontWeight: "800" },
  modalMessage: { color: BARBER_COLORS.textMuted, fontSize: 15, lineHeight: 21 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 },
});
