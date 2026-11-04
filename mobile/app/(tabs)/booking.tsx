import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/lib/barber/api";
import type { AvailabilitySlot, Catalog } from "@/lib/barber/types";
import { formatBRL, formatTime, nextDateKeys } from "@/lib/barber/utils";
import {
  BARBER_COLORS,
  Button,
  Card,
  ChoiceChip,
  DateStrip,
  ErrorState,
  Field,
  Header,
  LoadingState,
  Notice,
  Screen,
  styles,
} from "@/components/barber/ui";

export default function BookingScreen() {
  const dates = useMemo(() => nextDateKeys(), []);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [barberId, setBarberId] = useState<number | null>(null);
  const [date, setDate] = useState(dates[0]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: number; status: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function loadCatalog() {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const result = await api.catalog();
      setCatalog(result);
      if (!serviceId && result.services[0]) setServiceId(result.services[0].id);
      if (!barberId && result.barbers[0]) setBarberId(result.barbers[0].id);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Não foi possível carregar o catálogo.");
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void loadCatalog(), 0);
    return () => clearTimeout(timer);
    // Catalog is loaded once; subsequent selection effects only query availability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!serviceId || !barberId || !date) return;
    let active = true;
    const timer = setTimeout(() => {
      setSlotsLoading(true);
      setSlotsError(null);
      api.availability(date, barberId, serviceId)
        .then((result) => {
          if (active) setSlots(result.slots ?? []);
        })
        .catch((error) => {
          if (active) setSlotsError(error instanceof Error ? error.message : "Não foi possível buscar horários.");
        })
        .finally(() => {
          if (active) setSlotsLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [date, barberId, serviceId]);

  async function confirmBooking() {
    if (!selectedSlot || !serviceId || !barberId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api.appointmentCreate({
        barber_id: barberId,
        service_id: serviceId,
        starts_at: selectedSlot.starts_at,
        ends_at: selectedSlot.ends_at,
        notes: notes.trim() || undefined,
      });
      setSuccess({ id: result.appointment_id, status: result.status });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível confirmar o agendamento.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetBooking() {
    setSuccess(null);
    setSelectedSlot(null);
    setNotes("");
    setSubmitError(null);
  }

  if (success) {
    return (
      <Screen contentStyle={{ justifyContent: "center" }}>
        <Card style={{ alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ color: BARBER_COLORS.success, fontSize: 42 }}>✓</Text>
          <Text style={styles.title}>Agendamento confirmado</Text>
          <Text style={styles.muted}>Seu pedido foi confirmado pelo servidor.</Text>
          <Text style={styles.gold}>Código #{success.id}</Text>
          <Text style={styles.muted}>Status: {success.status}</Text>
          <Button onPress={resetBooking} icon="calendar">Fazer outro agendamento</Button>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Agendar" subtitle="Escolha o serviço, profissional e melhor horário." />
      {catalogLoading ? <LoadingState label="Carregando catálogo..." /> : null}
      {!catalogLoading && catalogError ? <ErrorState message={catalogError} onRetry={() => void loadCatalog()} /> : null}
      {!catalogLoading && catalog ? (
        <>
          <Card>
            <Text style={styles.sectionTitle}>1. Serviço</Text>
            <View style={styles.wrap}>
              {catalog.services.length ? catalog.services.map((service) => <ChoiceChip key={service.id} label={`${service.name} · ${formatBRL(service.price_cents)}`} selected={service.id === serviceId} onPress={() => { setServiceId(service.id); setSubmitError(null); }} />) : <Text style={styles.muted}>Nenhum serviço disponível.</Text>}
            </View>
            {serviceId ? <Text style={styles.muted}>{catalog.services.find((item) => item.id === serviceId)?.duration_minutes ?? "—"} minutos de duração</Text> : null}
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>2. Barbeiro</Text>
            <View style={styles.wrap}>
              {catalog.barbers.length ? catalog.barbers.map((barber) => <ChoiceChip key={barber.id} label={barber.name} selected={barber.id === barberId} onPress={() => { setBarberId(barber.id); setSubmitError(null); }} />) : <Text style={styles.muted}>Nenhum barbeiro disponível.</Text>}
            </View>
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>3. Data</Text>
            <DateStrip dates={dates} selected={date} onSelect={(value) => { setDate(value); setSubmitError(null); }} />
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>4. Horário disponível</Text>
            {slotsLoading ? <LoadingState label="Buscando horários..." /> : null}
            {!slotsLoading && slotsError ? <ErrorState message={slotsError} /> : null}
            {!slotsLoading && !slotsError && !slots.length ? <Text style={styles.muted}>Nenhum horário disponível para esta combinação.</Text> : null}
            {!slotsLoading && slots.length ? <View style={styles.wrap}>{slots.map((slot) => <ChoiceChip key={`${slot.starts_at}-${slot.ends_at}`} label={formatTime(slot.starts_at)} selected={selectedSlot?.starts_at === slot.starts_at} onPress={() => setSelectedSlot(slot)} />)}</View> : null}
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>5. Observações (opcional)</Text>
            <Field label="Recado para o barbeiro" value={notes} onChangeText={setNotes} placeholder="Ex.: preferência de acabamento" multiline maxLength={300} />
            {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
            <Button onPress={() => void confirmBooking()} loading={submitting} disabled={!selectedSlot} icon="check">Confirmar agendamento</Button>
            <Text style={styles.muted}>A reserva só aparece após confirmação positiva do servidor.</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
