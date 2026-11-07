import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { Text, View } from "react-native";

import { api } from "@/lib/barber/api";
import { useBarber } from "@/lib/barber/context";
import type { BarberUser } from "@/lib/barber/types";
import {
  BARBER_COLORS,
  Button,
  Card,
  ChoiceChip,
  EmptyState,
  ErrorState,
  Field,
  Header,
  LoadingState,
  Notice,
  Screen,
  styles,
} from "@/components/barber/ui";

export default function ClientsScreen() {
  const { authReady, user } = useBarber();
  const [role, setRole] = useState<"client" | "barber">("client");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<BarberUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<BarberUser | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [saving, setSaving] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const saveLockRef = useRef(false);
  const toggleLocksRef = useRef(new Set<number>());

  const load = useCallback(async () => {
    if (!authReady || !user || user.role !== "admin") return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.users(role, search.trim() || undefined);
      setUsers(result.users ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, [authReady, role, search, user]);

  useEffect(() => {
    if (!authReady || !user || user.role !== "admin") return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
    // Search is submitted by the button; the role effect only initializes each role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, role, user?.id, user?.role]);

  function openNew() {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setPassword("");
    setStatus("active");
    setFormError(null);
    setNotice(null);
  }

  function openEdit(item: BarberUser) {
    setEditing(item);
    setName(item.name);
    setPhone(item.phone ?? "");
    setEmail(item.email);
    setPassword("");
    setStatus(item.status === "inactive" ? "inactive" : "active");
    setFormError(null);
    setNotice(null);
    setInviteUrl(null);
  }

  async function save() {
    if (saveLockRef.current) return;
    setFormError(null);
    setNotice(null);
    if (!name.trim() || (role === "client" ? !phone.trim() : !email.trim() || !email.includes("@"))) {
      setFormError(role === "client" ? "Informe nome e WhatsApp com DDD." : "Informe nome e um e-mail válido.");
      return;
    }
    if (!editing && password.length < 8) {
      setFormError("A senha inicial deve ter pelo menos 8 caracteres.");
      return;
    }
    if (editing && password && password.length < 8) {
      setFormError("Uma nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    saveLockRef.current = true;
    setSaving(true);
    try {
      const saved = await api.userSave({
        ...(editing ? { id: editing.id } : {}),
        name: name.trim(),
        ...(role === "client" ? { phone: phone.trim() } : { email: email.trim() }),
        role,
        status,
        ...(password ? { password } : {}),
      });
      if (!editing && role === "client" && saved.user.phone) {
        const digits = saved.user.phone.replace(/\D/g, "");
        const link = "https://sistemashp.com.br/barbershop/?view=login";
        const text = `Olá ${saved.user.name}! Seu acesso está pronto.\n\nAcesse: ${link}\nWhatsApp: ${saved.user.phone}\nSenha: ${password}`;
        setInviteUrl(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`);
      }
      setNotice(editing ? "Usuário atualizado após confirmação do servidor." : "Usuário criado após confirmação do servidor.");
      openNew();
      await load();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Não foi possível salvar o usuário.");
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  }

  async function toggleStatus(item: BarberUser) {
    if (toggleLocksRef.current.has(item.id)) return;
    toggleLocksRef.current.add(item.id);
    setTogglingIds((current) => new Set(current).add(item.id));
    setNotice(null);
    try {
      await api.userSave({ id: item.id, name: item.name, email: item.email, phone: item.phone ?? undefined, role, status: item.status === "inactive" ? "active" : "inactive" });
      setNotice("Status atualizado após confirmação do servidor.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível alterar o status.");
    } finally {
      toggleLocksRef.current.delete(item.id);
      setTogglingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  if (!authReady || !user || user.role !== "admin") return null;

  return (
    <Screen keyboard>
      <Header title="Pessoas" subtitle="Gerencie clientes e barbeiros sem excluir o histórico." />
      <View style={styles.wrap}>
        <ChoiceChip label="Clientes" selected={role === "client"} disabled={saving} onPress={() => { setRole("client"); setSearch(""); openNew(); }} />
        <ChoiceChip label="Barbeiros" selected={role === "barber"} disabled={saving} onPress={() => { setRole("barber"); setSearch(""); openNew(); }} />
      </View>
      <Card>
        <View style={styles.row}><Text style={styles.sectionTitle}>Buscar {role === "client" ? "clientes" : "barbeiros"}</Text><Button variant="ghost" icon="user-plus" disabled={saving} onPress={openNew}>Novo</Button></View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Field label="Nome ou e-mail" value={search} onChangeText={setSearch} placeholder="Digite para buscar" onSubmitEditing={() => void load()} /></View>
          <Button variant="secondary" icon="search" disabled={saving} onPress={() => void load()}>Buscar</Button>
        </View>
      </Card>
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Card>
        <Text style={styles.sectionTitle}>{editing ? "Editar usuário" : `Novo ${role === "client" ? "cliente" : "barbeiro"}`}</Text>
        <Field label="Nome" value={name} onChangeText={setName} placeholder="Nome completo" />
        <Field label={role === "client" ? "WhatsApp/telefone" : "E-mail"} value={role === "client" ? phone : email} onChangeText={role === "client" ? setPhone : setEmail} autoCapitalize="none" keyboardType={role === "client" ? "phone-pad" : "email-address"} placeholder={role === "client" ? "(00) 00000-0000" : "email@exemplo.com"} />
        <Field label={editing ? "Nova senha (opcional)" : "Senha inicial (mínimo 8 caracteres)"} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        <View style={styles.wrap}><ChoiceChip label="Ativo" selected={status === "active"} disabled={saving} onPress={() => setStatus("active")} /><ChoiceChip label="Inativo" selected={status === "inactive"} disabled={saving} onPress={() => setStatus("inactive")} /></View>
        <View style={styles.row}><Button variant="ghost" disabled={saving} onPress={openNew}>Limpar</Button><Button onPress={() => void save()} loading={saving} icon="save">Salvar</Button></View>
      </Card>
      {inviteUrl ? <Button variant="secondary" icon="message-circle" onPress={() => void Linking.openURL(inviteUrl)}>Enviar acesso pelo WhatsApp</Button> : null}
      {loading ? <LoadingState label="Carregando usuários..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !users.length ? <EmptyState icon="users" title="Nenhum usuário encontrado" text="A busca considera apenas o perfil selecionado." /> : null}
      {!loading && !error ? users.map((item) => <Card key={item.id}>
        <View style={styles.row}><View style={{ flex: 1, gap: 4 }}><Text style={styles.sectionTitle}>{item.name}</Text><Text style={styles.muted}>{role === "client" && item.phone ? item.phone : item.email}</Text></View><Text style={{ color: item.status === "inactive" ? BARBER_COLORS.danger : BARBER_COLORS.success, fontWeight: "800" }}>{item.status === "inactive" ? "Inativo" : "Ativo"}</Text></View>
        <View style={styles.row}><Button variant="secondary" icon="edit-2" disabled={togglingIds.size > 0 || saving} onPress={() => openEdit(item)}>Editar</Button><Button variant={item.status === "inactive" ? "secondary" : "danger"} loading={togglingIds.has(item.id)} disabled={togglingIds.size > 0 && !togglingIds.has(item.id) || saving} onPress={() => void toggleStatus(item)}>{item.status === "inactive" ? "Ativar" : "Inativar"}</Button></View>
      </Card>) : null}
    </Screen>
  );
}
