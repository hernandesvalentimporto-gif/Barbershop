import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/lib/barber/api";
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
  const [role, setRole] = useState<"client" | "barber">("client");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<BarberUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<BarberUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
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
  }, [role, search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
    // Search is submitted by the button; the role effect only initializes each role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]); // Search is explicitly submitted below.

  function openNew() {
    setEditing(null);
    setName("");
    setEmail("");
    setPassword("");
    setStatus("active");
    setFormError(null);
    setNotice(null);
  }

  function openEdit(item: BarberUser) {
    setEditing(item);
    setName(item.name);
    setEmail(item.email);
    setPassword("");
    setStatus(item.status === "inactive" ? "inactive" : "active");
    setFormError(null);
    setNotice(null);
  }

  async function save() {
    setFormError(null);
    setNotice(null);
    if (!name.trim() || !email.trim() || !email.includes("@")) {
      setFormError("Informe nome e um e-mail válido.");
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
    setSaving(true);
    try {
      await api.userSave({
        ...(editing ? { id: editing.id } : {}),
        name: name.trim(),
        email: email.trim(),
        role,
        status,
        ...(password ? { password } : {}),
      });
      setNotice(editing ? "Usuário atualizado após confirmação do servidor." : "Usuário criado após confirmação do servidor.");
      openNew();
      await load();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Não foi possível salvar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(item: BarberUser) {
    setNotice(null);
    try {
      await api.userSave({ id: item.id, name: item.name, email: item.email, role, status: item.status === "inactive" ? "active" : "inactive" });
      setNotice("Status atualizado após confirmação do servidor.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível alterar o status.");
    }
  }

  return (
    <Screen keyboard>
      <Header title="Pessoas" subtitle="Gerencie clientes e barbeiros sem excluir o histórico." />
      <View style={styles.wrap}>
        <ChoiceChip label="Clientes" selected={role === "client"} onPress={() => { setRole("client"); setSearch(""); openNew(); }} />
        <ChoiceChip label="Barbeiros" selected={role === "barber"} onPress={() => { setRole("barber"); setSearch(""); openNew(); }} />
      </View>
      <Card>
        <View style={styles.row}><Text style={styles.sectionTitle}>Buscar {role === "client" ? "clientes" : "barbeiros"}</Text><Button variant="ghost" icon="user-plus" onPress={openNew}>Novo</Button></View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Field label="Nome ou e-mail" value={search} onChangeText={setSearch} placeholder="Digite para buscar" onSubmitEditing={() => void load()} /></View>
          <Button variant="secondary" icon="search" onPress={() => void load()}>Buscar</Button>
        </View>
      </Card>
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Card>
        <Text style={styles.sectionTitle}>{editing ? "Editar usuário" : `Novo ${role === "client" ? "cliente" : "barbeiro"}`}</Text>
        <Field label="Nome" value={name} onChangeText={setName} placeholder="Nome completo" />
        <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="email@exemplo.com" />
        <Field label={editing ? "Nova senha (opcional)" : "Senha inicial (mínimo 8 caracteres)"} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        <View style={styles.wrap}><ChoiceChip label="Ativo" selected={status === "active"} onPress={() => setStatus("active")} /><ChoiceChip label="Inativo" selected={status === "inactive"} onPress={() => setStatus("inactive")} /></View>
        <View style={styles.row}><Button variant="ghost" onPress={openNew}>Limpar</Button><Button onPress={() => void save()} loading={saving} icon="save">Salvar</Button></View>
      </Card>
      {loading ? <LoadingState label="Carregando usuários..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !users.length ? <EmptyState icon="users" title="Nenhum usuário encontrado" text="A busca considera apenas o perfil selecionado." /> : null}
      {!loading && !error ? users.map((item) => <Card key={item.id}>
        <View style={styles.row}><View style={{ flex: 1, gap: 4 }}><Text style={styles.sectionTitle}>{item.name}</Text><Text style={styles.muted}>{item.email}</Text></View><Text style={{ color: item.status === "inactive" ? BARBER_COLORS.danger : BARBER_COLORS.success, fontWeight: "800" }}>{item.status === "inactive" ? "Inativo" : "Ativo"}</Text></View>
        <View style={styles.row}><Button variant="secondary" icon="edit-2" onPress={() => openEdit(item)}>Editar</Button><Button variant={item.status === "inactive" ? "secondary" : "danger"} onPress={() => void toggleStatus(item)}>{item.status === "inactive" ? "Ativar" : "Inativar"}</Button></View>
      </Card>) : null}
    </Screen>
  );
}
