import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { api } from "@/lib/barber/api";
import type { Service } from "@/lib/barber/types";
import { PRICE_REFERENCE, PRICE_REFERENCE_PENDING } from "@/lib/barber/price-reference";
import { formatBRL, isActive, parseMoneyToCents } from "@/lib/barber/utils";
import {
  BARBER_COLORS, Button, Card, ChoiceChip, EmptyState, ErrorState,
  Field, Header, LoadingState, Notice, Screen, styles,
} from "@/components/barber/ui";

export default function ServicesScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState<0 | 1>(1);
  const [saving, setSaving] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.services();
      setServices(result.services ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os serviços.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const filteredServices = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return term ? services.filter((service) => service.name.toLocaleLowerCase("pt-BR").includes(term)) : services;
  }, [search, services]);

  function clearForm() {
    setEditing(null); setName(""); setDuration(""); setPrice("");
    setDescription(""); setActive(1); setFormError(null);
  }

  function edit(item: Service) {
    setEditing(item); setName(item.name); setDuration(String(item.duration_minutes));
    setPrice((item.price_cents / 100).toFixed(2).replace(".", ","));
    setDescription(item.description ?? ""); setActive(isActive(item.active) ? 1 : 0);
    setFormError(null); setNotice(null);
  }

  function useReference(item: (typeof PRICE_REFERENCE)[number]) {
    clearForm();
    setName(item.name);
    setPrice((item.price_cents / 100).toFixed(2).replace(".", ","));
    setReferenceOpen(false);
    setNotice("Referência preenchida. Informe a duração e confirme o preço antes de salvar. Nenhum dado foi alterado no servidor.");
  }

  async function save() {
    if (saving) return;
    setFormError(null); setNotice(null);
    const cents = parseMoneyToCents(price);
    const minutes = Number(duration);
    if (!name.trim() || name.trim().length > 140) {
      setFormError("Informe o nome do serviço com até 140 caracteres."); return;
    }
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
      setFormError("Informe a duração entre 5 e 480 minutos. A foto de referência não informa esse dado."); return;
    }
    if (cents === null || cents > 100000000) {
      setFormError("Informe um preço válido, por exemplo 45,00, até R$ 1.000.000,00."); return;
    }
    setSaving(true);
    try {
      await api.serviceSave({
        ...(editing ? { id: editing.id } : {}), name: name.trim(), duration_minutes: minutes,
        price_cents: cents, active, description: description.trim(),
      });
      setNotice(editing ? "Serviço atualizado após confirmação do servidor." : "Serviço criado após confirmação do servidor.");
      clearForm(); await load();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Não foi possível salvar o serviço.");
    } finally { setSaving(false); }
  }

  async function toggle(item: Service) {
    setNotice(null);
    try {
      await api.serviceSave({ id: item.id, name: item.name, duration_minutes: item.duration_minutes, price_cents: item.price_cents, active: isActive(item.active) ? 0 : 1, description: item.description ?? "" });
      setNotice("Status do serviço atualizado após confirmação do servidor."); await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível alterar o status.");
    }
  }

  return (
    <Screen keyboard>
      <Header title="Serviços" subtitle="Duração, preço e disponibilidade." right={<Button variant="ghost" icon="refresh-cw" onPress={() => void load()}>Atualizar</Button>} />
      <Card>
        <View style={styles.row}><Text style={styles.sectionTitle}>Pesquisar catálogo</Text><Button variant="ghost" icon="plus" onPress={clearForm}>Novo</Button></View>
        <Field label="Nome do serviço" value={search} onChangeText={setSearch} placeholder="Ex.: Corte" />
        <Button variant="secondary" icon="list" onPress={() => setReferenceOpen(true)}>Tabela de referência</Button>
      </Card>
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Card>
        <Text style={styles.sectionTitle}>{editing ? "Editar serviço" : "Novo serviço"}</Text>
        <Field label="Nome" value={name} onChangeText={setName} maxLength={140} placeholder="Corte masculino" />
        <Field label="Duração em minutos — confirmar" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="Ex.: 30" />
        <Field label="Preço (R$)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="45,00" />
        <Field label="Descrição (opcional)" value={description} onChangeText={setDescription} placeholder="Detalhes do serviço" multiline maxLength={5000} />
        <View style={styles.wrap}><ChoiceChip label="Ativo" selected={active === 1} onPress={() => setActive(1)} /><ChoiceChip label="Inativo" selected={active === 0} onPress={() => setActive(0)} /></View>
        <View style={styles.row}><Button variant="ghost" onPress={clearForm}>Limpar</Button><Button onPress={() => void save()} loading={saving} icon="save">Salvar serviço</Button></View>
      </Card>
      {loading ? <LoadingState label="Carregando serviços..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !filteredServices.length ? <EmptyState icon="scissors" title="Nenhum serviço encontrado" text="Cadastre um serviço ou ajuste a busca." /> : null}
      {!loading && !error ? filteredServices.map((service) => <Card key={service.id}>
        <View style={styles.row}><View style={{ flex: 1, gap: 4 }}><Text style={styles.sectionTitle}>{service.name}</Text><Text style={styles.muted}>{service.duration_minutes} min · {formatBRL(service.price_cents)}</Text></View><Text style={{ color: isActive(service.active) ? BARBER_COLORS.success : BARBER_COLORS.danger, fontWeight: "800" }}>{isActive(service.active) ? "Ativo" : "Inativo"}</Text></View>
        {service.description ? <Text style={styles.muted}>{service.description}</Text> : null}
        <View style={styles.row}><Button variant="secondary" icon="edit-2" onPress={() => edit(service)}>Editar</Button><Button variant={isActive(service.active) ? "danger" : "secondary"} onPress={() => void toggle(service)}>{isActive(service.active) ? "Inativar" : "Ativar"}</Button></View>
      </Card>) : null}
      <Modal visible={referenceOpen} transparent animationType="fade" onRequestClose={() => setReferenceOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: "90%" }]}>
            <Text style={styles.modalTitle}>Tabela de referência</Text>
            <Text style={styles.modalMessage}>Preços legíveis da foto enviada. Escolher apenas preenche um novo cadastro; não altera os valores existentes.</Text>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {PRICE_REFERENCE.map((item) => <View key={item.name} style={styles.row}>
                <View style={{ flex: 1, gap: 4 }}><Text style={styles.body}>{item.name}</Text><Text style={[styles.muted, styles.gold]}>{formatBRL(item.price_cents)}</Text></View>
                <Button variant="secondary" onPress={() => useReference(item)}>Usar</Button>
              </View>)}
              <Notice>{PRICE_REFERENCE_PENDING}</Notice>
            </ScrollView>
            <Button variant="ghost" onPress={() => setReferenceOpen(false)}>Fechar</Button>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
