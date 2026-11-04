import React, { useState } from "react";
import { Text } from "react-native";

import { useBarber } from "@/lib/barber/context";
import { BARBER_COLORS, Button, Card, ConfirmModal, Header, Notice, Screen, styles } from "@/components/barber/ui";

export default function MoreScreen() {
  const { user, logout, busy, storageNotice } = useBarber();
  const [confirming, setConfirming] = useState(false);
  if (!user) return null;
  return (
    <Screen>
      <Header title="Mais" subtitle="Conta e informações da sessão." />
      <Card>
        <Text style={styles.sectionTitle}>{user.name || "Usuário"}</Text>
        <Text style={styles.muted}>{user.email}</Text>
        <Text style={styles.gold}>{user.role === "client" ? "Cliente" : user.role === "barber" ? "Barbeiro" : "Administrador"}</Text>
      </Card>
      {storageNotice ? <Notice>{storageNotice}</Notice> : null}
      <Card>
        <Text style={styles.sectionTitle}>Sessão</Text>
        <Text style={styles.muted}>Ao sair, o token local é removido e será necessário entrar novamente.</Text>
        <Button variant="danger" icon="log-out" loading={busy} onPress={() => setConfirming(true)}>Sair da conta</Button>
      </Card>
      <Text style={{ color: BARBER_COLORS.textMuted, fontSize: 12, textAlign: "center" }}>Sistemas HP · Agenda de barbearia</Text>
      <ConfirmModal visible={confirming} title="Sair da conta?" message="A sessão será encerrada neste dispositivo." confirmLabel="Sair" danger onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void logout(); }} />
    </Screen>
  );
}
