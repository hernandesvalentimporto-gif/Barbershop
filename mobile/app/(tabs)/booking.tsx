import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/lib/barber/api";
import { useBarber } from "@/lib/barber/context";
import type { AvailabilitySlot, BarberUser, Catalog } from "@/lib/barber/types";
import { bookingSelectionKey, formatBRL, formatTime, nextDateKeys } from "@/lib/barber/utils";
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
  const { authReady, user } = useBarber();
  const dates = useMemo(() => nextDateKeys(), []);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [clients, setClients] = useState<BarberUser[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [barberId, setBarberId] = useState<number | null>(null);
  const [date, setDate] = useState(dates[0]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: number; status: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const availabilitySequenceRef = useRef(0);
  const selectionKeyRef = useRef("");
  const selectedSlotKeyRef = useRef<string | null>(null);
  const confirmLockRef = useRef(false);
  const selectionKey = bookingSelectionKey({ date, barberId, serviceId });

  useEffect(() => {
    selectionKeyRef.current = selectionKey;
    selectedSlotKeyRef.current = selectedSlotKey;
  }, [selectionKey, selectedSlotKey]);

  async function loadCatalog() {
    if (!user || (user.role !== "client" && user.role !== "barber")) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const result = await api.catalog();
      setCatalog(result);
      if (user.role === "barber") {
        const clientsResult = await api.users("client");
        setClients(clientsResult.users ?? []);
        if (!barberId) setBarberId(user.id);
      } else if (!barberId && result.barbers[0]) {
        setBarberId(result.barbers[0].id);
      }
      if (!serviceId && result.services[0]) setServiceId(result.services[0].id);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Não foi possível carregar o catálogo.");
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    if (!authReady || !user || (user.role !== "client" && user.role !== "barber")) return;
    const timer = setTimeout(() => void loadCatalog(), 0);
    return () => clearTimeout(timer);
    // Catalog is loaded once per authenticated client; selection effects only query availability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user?.id, user?.role]);

  function invalidateSelection() {
    // Increment before React re-renders so a response resolving in this same
    // tick cannot repopulate slots for the previous dimensions.
    availabilitySequenceRef.current += 1;
    setSlots([]);
    setSlotsLoading(false);
    setSlotsError(null);
    setSelectedSlot(null);
    setSelectedSlotKey(null);
    setSubmitError(null);
  }

  useEffect(() => {
    if (!authReady || !user || (user.role !== "client" && user.role !== "barber") || !serviceId || !barberId || !date || (user.role === "barber" && !clientId)) {
      return;
    }
    const requestSequence = availabilitySequenceRef.current;
    const requestKey = selectionKey;
    let active = true;
    const isCurrent = () =>
      active &&
      requestSequence === availabilitySequenceRef.current &&
      selectionKeyRef.current === requestKey;

    const timer = setTimeout(() => {
      setSlotsLoading(true);
      setSlotsError(null);
      api.availability(date, barberId, serviceId)
        .then((result) => {
          if (isCurrent()) setSlots(result.slots ?? []);
        })
        .catch((error) => {
          if (isCurrent()) setSlotsError(error instanceof Error ? error.message : "Não foi possível buscar horários.");
        })
        .finally(() => {
          if (isCurrent()) setSlotsLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [authReady, user, date, barberId, serviceId, clientId, selectionKey, availabilityRetry]);

  function retryAvailability() {
    invalidateSelection();
    setAvailabilityRetry((current) => current + 1);
  }

  async function confirmBooking() {
    if (confirmLockRef.current || !selectedSlot || !serviceId || !barberId) return;
    const keyAtStart = selectionKey;
    if (selectedSlotKey !== keyAtStart || !bookingSelectionKey({ date, barberId, serviceId })) {
      setSelectedSlot(null);
      setSelectedSlotKey(null);
      setSubmitError("O horário selecionado não pertence mais à combinação atual. Escolha outro horário.");
      return;
    }
    confirmLockRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const slotAtStart = selectedSlot;
    try {
      const result = await api.appointmentCreate({
        ...(user?.role === "barber" && clientId ? { client_id: clientId } : {}),
        barber_id: barberId,
        service_id: serviceId,
        starts_at: slotAtStart.starts_at,
        ends_at: slotAtStart.ends_at,
        notes: notes.trim() || undefined,
      });
      if (selectionKeyRef.current !== keyAtStart || selectedSlotKeyRef.current !== keyAtStart) {
        setSubmitError("O agendamento foi processado, mas a seleção mudou antes da confirmação visual. Consulte seu histórico.");
        return;
      }
      setSuccess({ id: result.appointment_id, status: result.status });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível confirmar o agendamento.");
    } finally {
      confirmLockRef.current = false;
      setSubmitting(false);
    }
  }

  function resetBooking() {
    setSuccess(null);
    setSelectedSlot(null);
    setSelectedSlotKey(null);
    setNotes("");
    setSubmitError(null);
  }

  if (!authReady || !user || (user.role !== "client" && user.role !== "barber")) return null;

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
              {catalog.services.length ? catalog.services.map((service) => <ChoiceChip key={service.id} label={`${service.name} · ${formatBRL(service.price_cents)}`} selected={service.id === serviceId} disabled={submitting} onPress={() => { invalidateSelection(); setServiceId(service.id); }} />) : <Text style={styles.muted}>Nenhum serviço disponível.</Text>}
            </View>
            {serviceId ? <Text style={styles.muted}>{catalog.services.find((item) => item.id === serviceId)?.duration_minutes ?? "—"} minutos de duração</Text> : null}
          </Card>
          {user.role === "barber" ? (
            <Card><Text style={styles.sectionTitle}>2. Barbeiro</Text><Text style={styles.muted}>Este atendimento será criado para você: {user.name}.</Text></Card>
          ) : (
            <Card>
              <Text style={styles.sectionTitle}>2. Barbeiro</Text>
              <View style={styles.wrap}>
                {catalog.barbers.length ? catalog.barbers.map((barber) => <ChoiceChip key={barber.id} label={barber.name} selected={barber.id === barberId} disabled={submitting} onPress={() => { invalidateSelection(); setBarberId(barber.id); }} />) : <Text style={styles.muted}>Nenhum barbeiro disponível.</Text>}
              </View>
            </Card>
          )}
          {user.role === "barber" ? (
            <Card>
              <Text style={styles.sectionTitle}>3. Cliente</Text>
              <View style={styles.wrap}>
                {clients.length ? clients.map((client) => <ChoiceChip key={client.id} label={client.phone ? `${client.name} · ${client.phone}` : client.name} selected={client.id === clientId} disabled={submitting} onPress={() => { invalidateSelection(); setClientId(client.id); }} />) : <Text style={styles.muted}>Nenhum cliente ativo disponível.</Text>}
              </View>
            </Card>
          ) : null}
          <Card>
            <Text style={styles.sectionTitle}>{user.role === "barber" ? "4. Data" : "3. Data"}</Text>
            <DateStrip dates={dates} selected={date} onSelect={(value) => { if (!submitting) { invalidateSelection(); setDate(value); } }} />
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>{user.role === "barber" ? "5. Horário disponível" : "4. Horário disponível"}</Text>
            {slotsLoading ? <LoadingState label="Buscando horários..." /> : null}
            {!slotsLoading && slotsError ? <ErrorState message={slotsError} onRetry={retryAvailability} /> : null}
            {!slotsLoading && !slotsError && !slots.length ? <Text style={styles.muted}>Nenhum horário disponível para esta combinação.</Text> : null}
            {!slotsLoading && slots.length ? <View style={styles.wrap}>{slots.map((slot) => <ChoiceChip key={`${slot.starts_at}-${slot.ends_at}`} label={formatTime(slot.starts_at)} selected={selectedSlot?.starts_at === slot.starts_at} disabled={submitting} onPress={() => { setSelectedSlot(slot); setSelectedSlotKey(selectionKeyRef.current); setSubmitError(null); }} />)}</View> : null}
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>{user.role === "barber" ? "6. Observações (opcional)" : "5. Observações (opcional)"}</Text>
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
