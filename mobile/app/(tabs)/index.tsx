import Feather from "@expo/vector-icons/Feather";
import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";

import { api } from "@/lib/barber/api";
import { useBarber } from "@/lib/barber/context";
import { WEB_STORAGE_WARNING } from "@/lib/barber/storage";
import type { Appointment, SummaryResponse } from "@/lib/barber/types";
import { formatDateTime } from "@/lib/barber/utils";
import {
  BARBER_COLORS,
  BrandHeader,
  Button,
  Card,
  ErrorState,
  Field,
  Header,
  LoadingState,
  Notice,
  Screen,
  StatusBadge,
  styles,
} from "@/components/barber/ui";

function LoginScreen() {
  const { login, busy, authError, storageError, retryStorageCleanup, clearAuthError } = useBarber();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  async function submit() {
    setValidation(null);
    clearAuthError();
    if (!identifier.trim()) {
      setValidation("Informe seu WhatsApp/telefone ou e-mail.");
      return;
    }
    if (!password) {
      setValidation("Informe sua senha.");
      return;
    }
    try {
      await login(identifier, password);
    } catch {
      // The provider exposes the server/network message below the form.
    }
  }

  return (
    <Screen keyboard contentStyle={{ justifyContent: "center" }}>
      <BrandHeader subtitle="Sua agenda, do seu jeito" />
      <View style={{ gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Text style={styles.title}>Entrar</Text>
          <Text style={styles.subtitle}>Acesse sua conta para continuar.</Text>
        </View>
        <Field
          label="WhatsApp/telefone ou e-mail"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          placeholder="(00) 00000-0000 ou e-mail"
          onFocus={clearAuthError}
        />
        <View style={{ gap: 7 }}>
          <Text style={styles.label}>Senha</Text>
          <View style={{ position: "relative", justifyContent: "center" }}>
            <Field
              label=""
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              textContentType="password"
              placeholder="Sua senha"
              onSubmitEditing={submit}
              style={{ paddingRight: 48 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onPress={() => setShowPassword((current) => !current)}
              style={{ position: "absolute", right: 0, top: 0, width: 43, height: 43, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name={showPassword ? "eye-off" : "eye"} size={20} color={BARBER_COLORS.gold} />
            </Pressable>
          </View>
        </View>
        {validation || authError ? <Notice tone="danger">{validation ?? authError}</Notice> : null}
        {storageError ? <Button variant="secondary" loading={busy} onPress={() => void retryStorageCleanup()}>Tentar limpar sessão</Button> : null}
        <Button onPress={submit} loading={busy} icon="log-in">Entrar</Button>
        <Button variant="ghost" onPress={() => void Linking.openURL("https://github.com/hernandesvalentimporto-gif/Barbershop/releases/latest/download/BarberShop-SistemasHP-Teste-v2.apk")}>Baixar aplicativo para cliente</Button>
        <Notice>{WEB_STORAGE_WARNING}</Notice>
      </View>
    </Screen>
  );
}

function UpcomingCard({ appointment, onOpenAgenda, onNewBooking }: { appointment: Appointment | null; onOpenAgenda: () => void; onNewBooking?: () => void }) {
  return (
    <Card>
      <View style={styles.row}>
        <Text style={styles.sectionTitle}>{appointment ? "Próximo atendimento" : "Minha agenda"}</Text>
        {appointment ? <StatusBadge status={appointment.status} /> : null}
      </View>
      {appointment ? <>
        <Text style={styles.body}>{formatDateTime(appointment.starts_at)}</Text>
        {appointment.service_name ? <Text style={styles.muted}>{appointment.service_name}</Text> : null}
        {appointment.barber_name ? <Text style={styles.muted}>Com {appointment.barber_name}</Text> : null}
      </> : <Text style={styles.muted}>Você ainda não tem atendimento agendado.</Text>}
      <View style={{ gap: 10, marginTop: 14 }}>
        {onNewBooking ? <Button icon="plus" onPress={onNewBooking}>Novo agendamento</Button> : null}
        <Button variant="secondary" icon="calendar" onPress={onOpenAgenda}>Abrir agenda completa</Button>
      </View>
    </Card>
  );
}

function HomeScreen() {
  const { user } = useBarber();
  const router = useRouter();
  const isPlatformAdmin = Boolean(user?.platform_admin && !user?.barbershop_id);
  const [summary, setSummary] = useState<SummaryResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.summary();
      setSummary(result.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o resumo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isPlatformAdmin) {
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [user?.id, isPlatformAdmin]);

  if (!user) return null;
  const greeting = user.name ? `Olá, ${user.name.split(" ")[0]}` : "Olá";
  const isClient = user.role === "client";
  const isBarber = user.role === "barber";
  const upcoming = (summary as any)?.upcoming;
  const clientUpcoming = isClient ? (Array.isArray(upcoming) ? upcoming[0] : upcoming) : null;
  const barberTodayCount = isBarber && typeof (summary as any)?.today_appointments === "number" ? (summary as any).today_appointments : null;
  const barberAppointments = isBarber && Array.isArray((summary as any)?.appointments) ? (summary as any).appointments : null;

  return (
    <Screen>
      <Header title={greeting} subtitle={isClient ? "Pronto para cuidar do visual?" : isBarber ? "Aqui está sua agenda de hoje." : "Visão geral da operação."} />
      {isPlatformAdmin ? <Card><Text style={styles.sectionTitle}>Painel Master</Text><Text style={styles.muted}>Gerencie as barbearias clientes, o plano de R$ 30 por mês e os pagamentos pendentes.</Text><Button icon="briefcase" onPress={() => router.push("/master")}>Abrir painel Master</Button></Card> : null}
      {loading ? <LoadingState label="Carregando seu resumo..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && isClient ? <UpcomingCard appointment={clientUpcoming} onOpenAgenda={() => router.push("/agenda")} onNewBooking={() => router.push("/booking")} /> : null}
      {!loading && !error && isBarber ? (
        <Card>
          <Text style={styles.sectionTitle}>Atendimentos de hoje</Text>
          {barberTodayCount !== null ? <Text style={styles.gold}>{barberTodayCount} atendimento(s) pendente(s) ou confirmado(s)</Text> : null}
          {Array.isArray(barberAppointments) ? (
            barberAppointments.length ? barberAppointments.slice(0, 5).map((appointment: Appointment) => <View key={appointment.id} style={styles.row}><View style={{ flex: 1, gap: 3 }}><Text style={styles.body}>{appointment.client_name ?? "Cliente"}</Text><Text style={styles.muted}>{formatDateTime(appointment.starts_at)}{appointment.service_name ? ` · ${appointment.service_name}` : ""}</Text></View><StatusBadge status={appointment.status} /></View>) : <Text style={styles.muted}>Nenhum atendimento informado para hoje.</Text>
          ) : <Text style={styles.muted}>O servidor não retornou a agenda de hoje.</Text>}
          <View style={{ gap: 10, marginTop: 14 }}>
            <Button icon="calendar" onPress={() => router.push("/agenda")}>Abrir agenda completa</Button>
            <Button variant="secondary" icon="plus" onPress={() => router.push("/booking")}>Novo agendamento</Button>
          </View>
        </Card>
      ) : null}
      {!loading && !error && user.role === "admin" ? (
        <Card>
          <Text style={styles.sectionTitle}>Resumo administrativo</Text>
          <Text style={styles.muted}>Os números abaixo são exibidos somente quando retornados pelo servidor.</Text>
          <View style={styles.wrap}>
            {typeof (summary as any)?.users === "number" ? <Metric label="Usuários" value={String((summary as any).users)} /> : null}
            {typeof (summary as any)?.barbers === "number" ? <Metric label="Barbeiros" value={String((summary as any).barbers)} /> : null}
            {typeof (summary as any)?.appointments === "number" ? <Metric label="Atendimentos" value={String((summary as any).appointments)} /> : null}
          </View>
        </Card>
      ) : null}
      <Card>
        <Text style={styles.sectionTitle}>Sessão ativa</Text>
        <Text style={styles.muted}>{user.email}</Text>
        <Text style={styles.gold}>{user.role === "client" ? "Cliente" : user.role === "barber" ? "Barbeiro" : "Administrador"}</Text>
      </Card>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={{ minWidth: 90, flex: 1, gap: 3 }}><Text style={styles.title}>{value}</Text><Text style={styles.muted}>{label}</Text></View>;
}

export default function IndexScreen() {
  const { authReady, authStatus, authError, retryRestore, user } = useBarber();
  if (!authReady) return <Screen scroll={false}><LoadingState label="Verificando sessão..." /></Screen>;
  if (authStatus === "restore_error" && !user) {
    return <Screen contentStyle={{ justifyContent: "center" }}><BrandHeader subtitle="Sua agenda, do seu jeito" /><ErrorState message={authError ?? "Não foi possível restaurar a sessão."} onRetry={() => void retryRestore()} /></Screen>;
  }
  if (user) {
    if (user.platform_admin && !user.barbershop_id) return <Redirect href="/master" />;
    if (user.role === "barber" || user.role === "admin") return <Redirect href="/agenda" />;
    return <Redirect href="/booking" />;
  }
  return <LoginScreen />;
}
