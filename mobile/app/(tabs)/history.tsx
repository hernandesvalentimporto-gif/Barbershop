import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/lib/barber/api";
import type { ClientHistoryAppointment } from "@/lib/barber/types";
import { formatDateTime, isAppointmentCancellable } from "@/lib/barber/utils";
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Header,
  LoadingState,
  Notice,
  Screen,
  StatusBadge,
  styles,
} from "@/components/barber/ui";

export default function HistoryScreen() {
  const [appointments, setAppointments] = useState<ClientHistoryAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ClientHistoryAppointment | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.history();
      setAppointments(result.appointments ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar seu histórico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function cancelAppointment() {
    if (!cancelTarget) return;
    setCancellingId(cancelTarget.id);
    setCancelError(null);
    try {
      await api.appointmentCancel(cancelTarget.id);
      setCancelTarget(null);
      await load();
    } catch (requestError) {
      setCancelError(requestError instanceof Error ? requestError.message : "Não foi possível cancelar o agendamento.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <Screen>
      <Header title="Histórico" subtitle="Seus agendamentos confirmados e anteriores." right={<Button variant="ghost" icon="refresh-cw" onPress={() => void load()}>Atualizar</Button>} />
      {cancelError ? <Notice tone="danger">{cancelError}</Notice> : null}
      {loading ? <LoadingState label="Carregando histórico..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !appointments.length ? <EmptyState icon="calendar" title="Nenhum agendamento encontrado" text="Quando você agendar um serviço, ele aparecerá aqui." /> : null}
      {!loading && !error ? appointments.map((appointment) => (
        <Card key={appointment.id}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.sectionTitle}>{appointment.service_name ?? "Serviço"}</Text>
              <Text style={styles.body}>{formatDateTime(appointment.starts_at)}</Text>
            </View>
            <StatusBadge status={appointment.status} />
          </View>
          {appointment.barber_name ? <Text style={styles.muted}>Barbeiro: {appointment.barber_name}</Text> : null}
          {isAppointmentCancellable(appointment) ? <Button variant="danger" icon="x-circle" loading={cancellingId === appointment.id} onPress={() => { setCancelError(null); setCancelTarget(appointment); }}>Cancelar agendamento</Button> : null}
        </Card>
      )) : null}
      <ConfirmModal
        visible={Boolean(cancelTarget)}
        title="Cancelar agendamento?"
        message={cancelTarget ? `${cancelTarget.service_name ?? "Este serviço"} em ${formatDateTime(cancelTarget.starts_at)} será cancelado somente após confirmação do servidor.` : ""}
        confirmLabel="Sim, cancelar"
        danger
        onCancel={() => { if (!cancellingId) setCancelTarget(null); }}
        onConfirm={() => void cancelAppointment()}
      />
    </Screen>
  );
}
