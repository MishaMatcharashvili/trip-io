import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Palette, usePalette } from "~/theme";

// The shell's few building blocks, in Mist's sizes (design/mobile/foundations).
// Every colour comes from usePalette.

type Tone = "agent" | "alert" | "ok";

const tones = (p: Palette, tone: Tone) =>
  ({
    agent: { ink: p.agent, line: p.agentLine, tint: p.agentTint },
    alert: { ink: p.alert, line: p.alertLine, tint: p.alertTint },
    ok: { ink: p.ok, line: p.okLine, tint: p.okTint },
  })[tone];

/** A scrolling screen on the canvas, clear of the notch and the home bar. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  bottomInset = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: boolean;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: p.canvas }}
      contentContainerStyle={[
        styles.screen,
        {
          paddingTop: insets.top + 12,
          paddingBottom: bottomInset ? insets.bottom + 24 : 24,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={p.inkMuted}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <Text style={[styles.eyebrow, { color: p.inkFaint }]}>{children}</Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.title, { color: p.ink }]}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.heading, { color: p.ink }]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  faint,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  faint?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const p = usePalette();
  const color = faint ? p.inkFaint : muted ? p.inkMuted : p.ink;
  return <Text style={[styles.body, { color }, style]}>{children}</Text>;
}

export function Card({
  children,
  tone,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const t = tone ? tones(p, tone) : null;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t ? t.tint : p.surface,
          borderColor: t ? t.line : p.hairline,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A tappable card or row. */
export function Tap({
  children,
  onPress,
  style,
  label,
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  busy,
  disabled,
  tone = "agent",
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "quiet";
  busy?: boolean;
  disabled?: boolean;
  tone?: Tone;
}) {
  const p = usePalette();
  const t = tones(p, tone);
  const off = disabled || busy;
  const fill =
    variant === "primary" ? t.ink : variant === "secondary" ? p.surface : null;
  const ink = variant === "primary" ? p.onAccent : p.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        fill ? { backgroundColor: fill } : null,
        variant === "secondary" ? { borderColor: p.control } : null,
        variant === "secondary" ? styles.bordered : null,
        off && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={ink} />
      ) : (
        <Text style={[styles.buttonLabel, { color: ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...input
}: TextInputProps & { label: string; hint?: string }) {
  const p = usePalette();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: p.inkMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={p.inkFaint}
        style={[
          styles.input,
          { backgroundColor: p.surface, borderColor: p.control, color: p.ink },
        ]}
        {...input}
      />
      {hint ? (
        <Text style={[styles.hint, { color: p.inkFaint }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** A small coloured word: the tone is the only thing that says how urgent. */
export function Pill({ children, tone }: { children: ReactNode; tone: Tone }) {
  const p = usePalette();
  const t = tones(p, tone);
  return (
    <View
      style={[styles.pill, { backgroundColor: t.tint, borderColor: t.line }]}
    >
      <Text style={[styles.pillLabel, { color: t.ink }]}>{children}</Text>
    </View>
  );
}

/** A notice that sits in the flow: an error, or a gentle empty state. */
export function Notice({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card tone={tone} style={styles.notice}>
      <Body muted={!tone}>{children}</Body>
    </Card>
  );
}

/** A setting with a label, a line of what it does, and a switch. */
export function SwitchRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={[styles.switchLabel, { color: p.ink }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.hint, { color: p.inkMuted }]}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: p.control, true: p.agent }}
        thumbColor={p.knob}
      />
    </View>
  );
}

export function Loading() {
  const p = usePalette();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={p.inkMuted} />
    </View>
  );
}

export function Hairline() {
  const p = usePalette();
  return <View style={[styles.hairline, { backgroundColor: p.hairline }]} />;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, gap: 14 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  heading: {
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: -0.4,
    lineHeight: 23,
  },
  body: { fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 6 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  button: {
    minHeight: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  bordered: { borderWidth: 1 },
  buttonLabel: { fontSize: 15, fontWeight: "600" },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: "500" },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  hint: { fontSize: 11.5 },
  pill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  pillLabel: { fontSize: 11.5, fontWeight: "600" },
  notice: { alignItems: "flex-start" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 14.5, fontWeight: "600" },
  loading: { paddingVertical: 48, alignItems: "center" },
  hairline: { height: StyleSheet.hairlineWidth },
});
