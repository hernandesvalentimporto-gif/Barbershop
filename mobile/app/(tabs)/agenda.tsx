import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { api, isEndpointMissing } from "@/lib/barber/api";
import { useBarber } from "@/lib/barber/context";
import type { Appointment } from "@/lib/barber/types";
import { formatBRL, formatDateTime, nextDateKeys } from "@/lib/barber/utils";
import {
  Button,
  Card,
  ChoiceChip,
  DateStrip,
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  Notice,
  Screen,
  StatusBadge,
  styles,
} from "@/components/barber/ui";

const STATUS_OPTIONS: ("confirmed" | "completed" | "no_show" | "cancelled")[] = ["confirmed", "completed", "no_show", "cancelled"];

export default function AgendaScreen() {
  const { user } = useBarber();
  const dates = useMemo(() => nextDateKeys(), []);
  const [date, setDate] = useState(dates[0]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [changingId, setChangingId] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFallbackNotice(null);
    try {
      const result = await api.appointmentList(date);
      setAppointments(result.appointments ?? []);
    } catch (requestError) {
      if (isEndpointMissing(requestError)) {
        try {
          const summary = await api.summary();
          const data = summary.data as any;
          const fallback = Array.isArray(data?.today_appointments) ? data.today_appointments : Array.isArray(data?.appointments) ? data.appointments : [];
          setAppointments(fallback);
          setFallbackNotice(`${requestError.message} Exibindo apenas o resumo devolvido pelo servidor; ele pode não corresponder à data selecionada.`);
        } catch (fallbackError) {
          setError(fallbackError instanceof Error ? fallbackError.message : requestError.message);
        }
      } else {
        setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar a agenda.");
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, user]);

  async function changeStatus(appointment: Appointment, status: (typeof STATUS_OPTIONS)[number]) {
    setChangingId(appointment.id);
    setStatusError(null);
    try {
      await api.appointmentStatus(appointment.id, status);
      await load();
    } catch (requestError) {
      setStatusError(requestError instanceof Error ? requestError.message : "Não foi possível alterar o status.");
    } finally {
      setChangingId(null);
    }
  }

  if (!user) return null;
  return (
    <Screen>
      <Header title="Agenda" subtitle={user.role === "admin" ? "Acompanhe os atendimentos da equipe." : "Seus atendimentos e respectivos status."} right={<Button variant="ghost" icon="refresh-cw" onPress={() => void load()}>Atualizar</Button>} />
      <Card>
        <Text style={styles.sectionTitle}>Escolha a data</Text>
        <DateStrip dates={dates} selected={date} onSelect={setDate} />
      </Card>
      {fallbackNotice ? <Notice>{fallbackNotice}</Notice> : null}
      {statusError ? <Notice tone="danger">{statusError}</Notice> : null}
      {loading ? <LoadingState label="Carregando agenda..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !appointments.length ? <EmptyState icon="calendar" title="Nenhum atendimento nesta data" text="Os dados exibidos dependem da agenda retornada pelo servidor." /> : null}
      {!loading && !error ? appointments.map((appointment) => (
        <Card key={appointment.id}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.sectionTitle}>{appointment.client_name ?? "Cliente"}</Text>
              <Text style={styles.body}>{formatDateTime(appointment.starts_at)}</Text>
            </View>
            <StatusBadge status={appointment.status} />
          </View>
          <Text style={styles.muted}>{appointment.service_name ?? "Serviço não informado"}{appointment.barber_name && user.role === "admin" ? ` · ${appointment.barber_name}` : ""}</Text>
          {typeof appointment.price_cents === "number" ? <Text style={styles.gold}>{formatBRL(appointment.price_cents)}</Text> : null}
          {appointment.notes ? <Text style={styles.muted}>Observação: {appointment.notes}</Text> : null}
          <View style={styles.wrap}>
            {STATUS_OPTIONS.map((status) => <ChoiceChip key={status} label={status.replace("_", " ")} selected={appointment.status === status} disabled={changingId === appointment.id} onPress={() => void changeStatus(appointment, status)} />)}
          </View>
        </Card>
      )) : null}
    </Screen>
  );
}
