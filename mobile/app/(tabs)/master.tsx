import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { api } from "@/lib/barber/api";
import { useBarber } from "@/lib/barber/context";
import type { MasterDashboardResponse, MasterShop } from "@/lib/barber/types";
import { BARBER_COLORS, Button, Card, ErrorState, Header, LoadingState, Notice, Screen, styles } from "@/components/barber/ui";

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MasterScreen() {
  const { user } = useBarber();
  const [data, setData] = useState<MasterDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.platform_admin || user.barbershop_id !== null) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.masterDashboard());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o painel Master.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  if (!user?.platform_admin || user.barbershop_id !== null) return null;

  async function setPayment(shop: MasterShop, status: "paid" | "pending") {
    setBusyId(shop.id);
    setNotice(null);
    try {
      await api.masterBilling(shop.id, status);
      setNotice(`${shop.name}: pagamento marcado como ${status === "paid" ? "pago" : "pendente"}.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível atualizar o pagamento.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <Header title="Master" subtitle="Barbearias clientes e financeiro da plataforma." />
      {loading ? <LoadingState label="Carregando barbearias..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {data ? <>
        <Card>
          <Text style={styles.sectionTitle}>Plano da plataforma</Text>
          <Text style={styles.title}>{money(data.plan_monthly_cents)} / mês</Text>
          <Text style={styles.muted}>Equivalente a R$ 1 por dia. Controle manual de pagamentos das barbearias.</Text>
          <View style={styles.wrap}>
            <Metric label="Barbearias" value={String(data.totals.shops)} />
            <Metric label="Pagas" value={String(data.totals.paid)} color={BARBER_COLORS.success} />
            <Metric label="Pendentes" value={String(data.totals.pending)} color={BARBER_COLORS.danger} />
          </View>
        </Card>
        {data.shops.map((shop) => <Card key={shop.id}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 3 }}><Text style={styles.sectionTitle}>{shop.name}</Text><Text style={styles.muted}>Plano: {money(shop.monthly_amount_cents)} · Vencimento: {shop.due_date}</Text></View>
            <Text style={{ color: shop.payment_status === "paid" ? BARBER_COLORS.success : BARBER_COLORS.danger, fontWeight: "800" }}>{shop.payment_status === "paid" ? "PAGO" : "PENDENTE"}</Text>
          </View>
          <Text style={styles.body}>{shop.clients_count} cliente(s) · {shop.barbers_count} barbeiro(s)</Text>
          <View style={styles.wrap}>
            <Button variant={shop.payment_status === "paid" ? "secondary" : "primary"} loading={busyId === shop.id} disabled={busyId !== null} onPress={() => void setPayment(shop, "paid")}>Marcar pago</Button>
            <Button variant="danger" loading={busyId === shop.id} disabled={busyId !== null} onPress={() => void setPayment(shop, "pending")}>Marcar pendente</Button>
          </View>
        </Card>)}
        {!data.shops.length ? <Card><Text style={styles.muted}>Nenhuma barbearia cadastrada.</Text></Card> : null}
      </> : null}
    </Screen>
  );
}

function Metric({ label, value, color = BARBER_COLORS.text }: { label: string; value: string; color?: string }) {
  return <View style={{ minWidth: 90, flex: 1, gap: 3 }}><Text style={{ color, fontSize: 27, fontWeight: "800" }}>{value}</Text><Text style={styles.muted}>{label}</Text></View>;
}
