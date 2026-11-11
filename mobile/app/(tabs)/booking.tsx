import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";

import { ApiError, api } from "@/lib/barber/api";
import { useBarber } from "@/lib/barber/context";
import type { AvailabilitySlot, BarberUser, Catalog } from "@/lib/barber/types";
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
  SearchablePicker,
  Screen,
  styles,
  type SearchablePickerOption,
} from "@/components/barber/ui";

export default function BookingScreen() {
  const { authReady, user } = useBarber();
  const dates = useMemo(() => nextDateKeys(), []);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [clients, setClients] = useState<BarberUser[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [barberId, setBarberId] = useState<number | null>(null);
  const [date, setDate] = useState(dates[0]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [busySlots, setBusySlots] = useState<AvailabilitySlot[]>([]);
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
  const selectionKey = `${date}|barber:${barberId ?? "none"}|services:${serviceIds.join(",") || "none"}`;
  const serviceOptions = useMemo<SearchablePickerOption[]>(() => (catalog?.services ?? []).map((service) => ({
    id: String(service.id),
    label: service.name,
    description: `${formatBRL(service.price_cents)} · ${service.duration_minutes} min`,
  })), [catalog?.services]);
  const barberOptions = useMemo<SearchablePickerOption[]>(() => (catalog?.barbers ?? []).map((barber) => ({
    id: String(barber.id),
    label: barber.name,
  })), [catalog?.barbers]);
  const clientOptions = useMemo<SearchablePickerOption[]>(() => clients.map((client) => {
    const phoneDigits = String(client.phone ?? "").replace(/\D/g, "");
    return {
      id: String(client.id),
      label: client.name,
      description: client.phone ?? client.email,
      keywords: `${client.phone ?? ""} ${phoneDigits} ${client.email ?? ""}`,
    };
  }), [clients]);
  const selectedServiceSummary = useMemo(() => {
    const selected = (catalog?.services ?? []).filter((service) => serviceIds.includes(service.id));
    if (!selected.length) return "";
    return selected.length <= 2 ? selected.map((service) => service.name).join(" · ") : `${selected.length} serviços selecionados`;
  }, [catalog?.services, serviceIds]);
  const timeOptions = useMemo(() => [
    ...slots.map((slot) => ({ ...slot, busy: false })),
    ...busySlots.map((slot) => ({ ...slot, busy: true })),
  ].sort((left, right) => left.starts_at.localeCompare(right.starts_at)), [busySlots, slots]);

  useEffect(() => {
    selectionKeyRef.current = selectionKey;
    selectedSlotKeyRef.current = selectedSlotKey;
  }, [selectionKey, selectedSlotKey]);

  async function loadCatalog() {
    if (!user || (user.role !== "client" && user.role !== "barber" && user.role !== "admin")) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const result = await api.catalog();
      setCatalog(result);
      if (user.role === "barber" || user.role === "admin") {
        const clientsResult = await api.users("client");
        setClients(clientsResult.users ?? []);
        if (user.role === "barber" && !barberId) setBarberId(user.id);
      } else if (!barberId && result.barbers[0]) {
        setBarberId(result.barbers[0].id);
      }
      if (!serviceIds.length && result.services[0]) {
        setServiceIds([result.services[0].id]);
      }
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Não foi possível carregar o catálogo.");
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    if (!authReady || !user || (user.role !== "client" && user.role !== "barber" && user.role !== "admin")) return;
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
    setBusySlots([]);
    setSlotsLoading(false);
    setSlotsError(null);
    setSelectedSlot(null);
    setSelectedSlotKey(null);
    setSubmitError(null);
  }

  useEffect(() => {
    if (!authReady || !user || (user.role !== "client" && user.role !== "barber" && user.role !== "admin") || !serviceIds.length || !barberId || !date || ((user.role === "barber" || user.role === "admin") && !clientId)) {
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
      api.availability(date, barberId, serviceIds)
        .then((result) => {
          if (isCurrent()) {
            setSlots(result.slots ?? []);
            setBusySlots(result.busy_slots ?? []);
          }
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
  }, [authReady, user, date, barberId, serviceIds, clientId, selectionKey, availabilityRetry]);

  function retryAvailability() {
    invalidateSelection();
    setAvailabilityRetry((current) => current + 1);
  }

  async function confirmBooking() {
    const slot = selectedSlot;
    if (confirmLockRef.current || !slot || !serviceIds.length || !barberId) return;
    const keyAtStart = selectionKey;
    if (selectedSlot && (selectedSlotKey !== keyAtStart || !serviceIds.length)) {
      setSelectedSlot(null);
      setSelectedSlotKey(null);
      setSubmitError("O horário selecionado não pertence mais à combinação atual. Escolha outro horário.");
      return;
    }
    confirmLockRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const slotAtStart = slot;
    try {
      const result = await api.appointmentCreate({
        ...(user?.role !== "client" && clientId ? { client_id: clientId } : {}),
        barber_id: barberId,
        service_id: serviceIds[0],
        service_ids: serviceIds,
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
      if (error instanceof ApiError && error.code === "appointment_conflict") {
        invalidateSelection();
        setAvailabilityRetry((current) => current + 1);
      }
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

  if (!authReady || !user || user.platform_admin || (user.role !== "client" && user.role !== "barber" && user.role !== "admin")) return null;

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
      <Header title="Agendar" subtitle="Escolha o serviço, profissional e melhor horário." right={<Button variant="ghost" icon="refresh-cw" onPress={() => void loadCatalog()}>Atualizar</Button>} />
      {catalogLoading ? <LoadingState label="Carregando catálogo..." /> : null}
      {!catalogLoading && catalogError ? <ErrorState message={catalogError} onRetry={() => void loadCatalog()} /> : null}
      {!catalogLoading && catalog ? (
        <>
          <Card>
            <Text style={styles.sectionTitle}>1. Serviços</Text>
            <SearchablePicker
              label="Pesquisar e selecionar serviços"
              title="Serviços"
              placeholder="Toque para buscar serviços"
              searchPlaceholder="Digite o nome do serviço"
              selectedSummary={selectedServiceSummary}
              selectedIds={serviceIds.map(String)}
              options={serviceOptions}
              multiple
              disabled={submitting || !serviceOptions.length}
              emptyText={catalog.services.length ? "Nenhum serviço corresponde à busca." : "Nenhum serviço disponível."}
              onSelectionChange={(ids) => {
                invalidateSelection();
                setServiceIds(ids.map(Number).filter(Number.isFinite));
              }}
            />
            {serviceIds.length ? <Text style={styles.muted}>{serviceIds.reduce((total, id) => total + (catalog.services.find((item) => item.id === id)?.duration_minutes ?? 0), 0)} minutos · {formatBRL(serviceIds.reduce((total, id) => total + (catalog.services.find((item) => item.id === id)?.price_cents ?? 0), 0))}</Text> : <Text style={styles.muted}>Selecione ao menos um serviço.</Text>}
          </Card>
          {user.role === "barber" ? (
            <Card><Text style={styles.sectionTitle}>2. Barbeiro</Text><Text style={styles.muted}>Este atendimento será criado para você: {user.name}.</Text></Card>
          ) : (
            <Card>
              <Text style={styles.sectionTitle}>2. Barbeiro</Text>
              <SearchablePicker
                label="Barbeiro"
                title="Escolher barbeiro"
                placeholder="Toque para pesquisar barbeiros"
                searchPlaceholder="Buscar por nome"
                selectedSummary={catalog.barbers.find((barber) => barber.id === barberId)?.name}
                selectedIds={barberId === null ? [] : [String(barberId)]}
                options={barberOptions}
                disabled={submitting || !barberOptions.length}
                emptyText={catalog.barbers.length ? "Nenhum barbeiro corresponde à busca." : "Nenhum barbeiro disponível."}
                onSelectionChange={(ids) => {
                  invalidateSelection();
                  setBarberId(ids[0] ? Number(ids[0]) : null);
                }}
              />
            </Card>
          )}
          {user.role !== "client" ? (
            <Card>
              <Text style={styles.sectionTitle}>3. Cliente</Text>
              <SearchablePicker
                label="Cliente"
                title="Escolher cliente"
                placeholder="Toque para pesquisar clientes"
                searchPlaceholder="Buscar nome, WhatsApp ou e-mail"
                selectedSummary={clients.find((client) => client.id === clientId)?.name}
                selectedIds={clientId === null ? [] : [String(clientId)]}
                options={clientOptions}
                disabled={submitting || !clientOptions.length}
                emptyText={clients.length ? "Nenhum cliente corresponde à busca." : "Nenhum cliente ativo disponível."}
                onSelectionChange={(ids) => {
                  invalidateSelection();
                  setClientId(ids[0] ? Number(ids[0]) : null);
                }}
              />
            </Card>
          ) : null}
          <Card>
            <Text style={styles.sectionTitle}>{user.role !== "client" ? "4. Data" : "3. Data"}</Text>
            <DateStrip dates={dates} selected={date} onSelect={(value) => { if (!submitting) { invalidateSelection(); setDate(value); } }} />
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>{user.role !== "client" ? "5. Horários" : "4. Horários disponíveis"}</Text>
            {slotsLoading ? <LoadingState label="Buscando horários..." /> : null}
            {!slotsLoading && slotsError ? <ErrorState message={slotsError} onRetry={retryAvailability} /> : null}
            {!slotsLoading && !slotsError && user.role !== "client" && !clientId ? <Text style={styles.muted}>Selecione um cliente para consultar os horários disponíveis.</Text> : null}
            {!slotsLoading && !slotsError && !slots.length && (user.role === "client" || !!clientId) ? (
              <Notice tone="danger">{busySlots.length ? "Não há horários livres para esta combinação. Os horários ocupados estão desabilitados." : "Não há horários livres para esta combinação."}</Notice>
            ) : null}
            {!slotsLoading && timeOptions.length ? (
              <View style={styles.wrap}>
                {timeOptions.map((slot) => (
                  <ChoiceChip
                    key={`${slot.starts_at}-${slot.ends_at}`}
                    label={`${formatTime(slot.starts_at)}${slot.busy ? " · Ocupado" : ""}`}
                    selected={!slot.busy && selectedSlot?.starts_at === slot.starts_at}
                    disabled={submitting || slot.busy}
                    onPress={slot.busy ? undefined : () => {
                      setSelectedSlot(slot);
                      setSelectedSlotKey(selectionKeyRef.current);
                      setSubmitError(null);
                    }}
                  />
                ))}
              </View>
            ) : null}
            {busySlots.length ? <Text style={styles.muted}>Horários ocupados ficam desabilitados. Apenas horários livres podem ser escolhidos.</Text> : null}
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>{user.role !== "client" ? "6. Observações (opcional)" : "5. Observações (opcional)"}</Text>
            <Field label="Recado para o barbeiro" value={notes} onChangeText={setNotes} placeholder="Ex.: preferência de acabamento" multiline maxLength={300} />
            {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
            <Button onPress={() => void confirmBooking()} loading={submitting} disabled={!selectedSlot} icon="check">{user.role !== "client" ? "Criar agenda" : "Confirmar agendamento"}</Button>
            <Text style={styles.muted}>A reserva só aparece após confirmação positiva do servidor.</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
