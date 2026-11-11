import Feather from "@expo/vector-icons/Feather";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

import { filterSearchableItems } from "@/lib/barber/search";
import { statusLabel } from "@/lib/barber/utils";

export const BARBER_COLORS = {
  background: "#090A0C",
  card: "#15171A",
  cardAlt: "#111316",
  border: "#303338",
  gold: "#E7B94E",
  goldMuted: "#9D7620",
  text: "#F7F2E8",
  textMuted: "#A8A49B",
  danger: "#EE8585",
  success: "#68CB9B",
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
      <Image source={require("@/assets/images/barber-logo.png")} style={styles.headerLogo} resizeMode="contain" accessibilityLabel="Logo Barber Shop Sistemas HP" />
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
  children?: React.ReactNode;
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
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...props}
        placeholderTextColor={BARBER_COLORS.textMuted}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export type SearchablePickerOption = {
  id: string;
  label: string;
  description?: string | null;
  keywords?: string | null;
};

export function SearchablePicker({
  label,
  title,
  placeholder,
  searchPlaceholder,
  selectedSummary,
  selectedIds,
  options,
  onSelectionChange,
  multiple = false,
  disabled = false,
  emptyText = "Nenhum resultado encontrado.",
}: {
  label: string;
  title: string;
  placeholder: string;
  searchPlaceholder: string;
  selectedSummary?: string;
  selectedIds: string[];
  options: SearchablePickerOption[];
  onSelectionChange: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  emptyText?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const filteredOptions = filterSearchableItems(options, query);

  function close() {
    setVisible(false);
    setQuery("");
  }

  function choose(option: SearchablePickerOption) {
    if (multiple) {
      onSelectionChange(
        selectedIds.includes(option.id)
          ? selectedIds.filter((id) => id !== option.id)
          : [...selectedIds, option.id],
      );
      return;
    }
    onSelectionChange([option.id]);
    close();
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => { setQuery(""); setVisible(true); }}
        style={({ pressed }) => [styles.pickerTrigger, disabled && styles.buttonDisabled, pressed && styles.pressed]}
      >
        <Text numberOfLines={2} style={[styles.pickerTriggerText, !selectedSummary && styles.pickerPlaceholder]}>
          {selectedSummary || placeholder}
        </Text>
        <Feather name="search" size={19} color={BARBER_COLORS.gold} />
      </Pressable>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.pickerBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar pesquisa"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView style={styles.pickerSheet} edges={["bottom"]}>
            <View style={styles.pickerHeader}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={styles.muted}>{multiple ? "Marque uma ou mais opções." : "Pesquise e toque em uma opção."}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={close} style={styles.pickerClose}>
                <Feather name="x" size={21} color={BARBER_COLORS.text} />
              </Pressable>
            </View>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={BARBER_COLORS.textMuted}
              returnKeyType="search"
              style={styles.input}
              value={query}
            />
            <Text style={styles.pickerResultCount} accessibilityLiveRegion="polite">
              {filteredOptions.length} {filteredOptions.length === 1 ? "resultado" : "resultados"}
              {multiple && selectedIds.length ? ` · ${selectedIds.length} selecionado(s)` : ""}
            </Text>
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.pickerList}
              contentContainerStyle={filteredOptions.length ? styles.pickerListContent : styles.pickerEmptyContent}
              renderItem={({ item }) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => choose(item)}
                    style={({ pressed }) => [styles.pickerOption, selected && styles.pickerOptionSelected, pressed && styles.pressed]}
                  >
                    <View style={styles.pickerOptionCopy}>
                      <Text numberOfLines={1} style={styles.pickerOptionLabel}>{item.label}</Text>
                      {item.description ? <Text numberOfLines={1} style={styles.pickerOptionDescription}>{item.description}</Text> : null}
                    </View>
                    <Feather
                      name={multiple ? (selected ? "check-square" : "square") : (selected ? "check-circle" : "circle")}
                      size={19}
                      color={selected ? BARBER_COLORS.gold : BARBER_COLORS.textMuted}
                    />
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.pickerEmptyText}>{query ? "Nenhum item corresponde à busca." : emptyText}</Text>}
            />
            <View style={styles.pickerFooter}>
              {multiple ? <Text style={styles.muted}>{selectedIds.length} serviço(s) selecionado(s)</Text> : <View />}
              <Button variant="secondary" onPress={close}>{multiple ? "Concluir" : "Fechar"}</Button>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
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

export function ConfirmModal({ visible, title, message, confirmLabel = "Confirmar", danger = false, loading = false, disabled = false, onCancel, onConfirm }: { visible: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean; disabled?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={loading || disabled ? undefined : onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <View style={styles.modalActions}>
            <Button variant="ghost" disabled={loading || disabled} onPress={onCancel}>Voltar</Button>
            <Button variant={danger ? "danger" : "primary"} loading={loading} disabled={disabled} onPress={onConfirm}>{confirmLabel}</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BARBER_COLORS.background },
  flex: { flex: 1 },
  scrollContent: { padding: 17, paddingBottom: 100, gap: 16 },
  brandHeader: { alignItems: "center", gap: 9, paddingTop: 10, paddingBottom: 20 },
  brandHeaderCompact: { paddingTop: 0, paddingBottom: 8 },
  logo: { width: 250, height: 232 },
  logoSmall: { width: 95, height: 68 },
  brandSubtitle: { color: BARBER_COLORS.textMuted, fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  headerLogo: { width: 62, height: 58, flexShrink: 0 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { color: BARBER_COLORS.gold, fontSize: 11, fontWeight: "800", letterSpacing: 2.4 },
  title: { color: BARBER_COLORS.text, fontSize: 27, fontWeight: "800", letterSpacing: -0.9 },
  subtitle: { color: BARBER_COLORS.textMuted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: BARBER_COLORS.card, borderColor: "#25282D", borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  button: { minHeight: 42, borderRadius: 10, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonPrimary: { backgroundColor: BARBER_COLORS.gold },
  buttonSecondary: { backgroundColor: "#22252A", borderColor: BARBER_COLORS.border, borderWidth: 1 },
  buttonDanger: { backgroundColor: "rgba(137, 44, 44, .22)", borderColor: "rgba(238, 133, 133, .35)", borderWidth: 1 },
  buttonGhost: { backgroundColor: "transparent", borderColor: "rgba(231, 185, 78, .42)", borderWidth: 1, paddingHorizontal: 12 },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  buttonText: { fontSize: 15, fontWeight: "800" },
  fieldWrap: { gap: 7 },
  label: { color: BARBER_COLORS.text, fontSize: 13, fontWeight: "700" },
  input: { minHeight: 43, borderRadius: 9, borderWidth: 1, borderColor: BARBER_COLORS.border, backgroundColor: BARBER_COLORS.cardAlt, color: BARBER_COLORS.text, paddingHorizontal: 12, fontSize: 16 },
  inputMultiline: { minHeight: 90, paddingTop: 13, textAlignVertical: "top" },
  fieldError: { color: BARBER_COLORS.danger, fontSize: 12 },
  pickerTrigger: { minHeight: 52, borderRadius: 10, borderWidth: 1, borderColor: BARBER_COLORS.border, backgroundColor: BARBER_COLORS.cardAlt, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  pickerTriggerText: { flex: 1, color: BARBER_COLORS.text, fontSize: 15, fontWeight: "700" },
  pickerPlaceholder: { color: BARBER_COLORS.textMuted, fontWeight: "500" },
  pickerBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.72)" },
  pickerSheet: { height: "86%", maxHeight: "90%", paddingHorizontal: 17, paddingTop: 18, paddingBottom: 10, gap: 11, backgroundColor: BARBER_COLORS.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: BARBER_COLORS.border },
  pickerHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  pickerClose: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BARBER_COLORS.border, backgroundColor: BARBER_COLORS.card },
  pickerResultCount: { color: BARBER_COLORS.textMuted, fontSize: 12, fontWeight: "700" },
  pickerList: { flex: 1, minHeight: 0 },
  pickerListContent: { gap: 8, paddingBottom: 8 },
  pickerEmptyContent: { flexGrow: 1, justifyContent: "center" },
  pickerEmptyText: { color: BARBER_COLORS.textMuted, fontSize: 14, textAlign: "center", padding: 20 },
  pickerOption: { minHeight: 59, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: BARBER_COLORS.border, borderRadius: 11, backgroundColor: BARBER_COLORS.card },
  pickerOptionSelected: { borderColor: BARBER_COLORS.gold, backgroundColor: "#302712" },
  pickerOptionCopy: { flex: 1, minWidth: 0, gap: 2 },
  pickerOptionLabel: { color: BARBER_COLORS.text, fontSize: 15, fontWeight: "700" },
  pickerOptionDescription: { color: BARBER_COLORS.textMuted, fontSize: 12 },
  pickerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 5 },
  chip: { minHeight: 38, borderRadius: 11, borderWidth: 1, borderColor: BARBER_COLORS.border, paddingHorizontal: 13, justifyContent: "center", backgroundColor: "#1B1D21" },
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
  sectionTitle: { color: BARBER_COLORS.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
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
