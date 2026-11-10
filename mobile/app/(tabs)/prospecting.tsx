import React, { useCallback, useState } from "react";
import { Linking, Text, View } from "react-native";

import { Button, Card, EmptyState, ErrorState, Field, Header, LoadingState, Screen, styles } from "@/components/barber/ui";
import { api } from "@/lib/barber/api";
import { useBarber } from "@/lib/barber/context";
import type { MasterProspectFilters, MasterProspectLead } from "@/lib/barber/types";
import { BARBER_COLORS } from "@/components/barber/ui";

function leadList(payload: { leads?: MasterProspectLead[] } | undefined): MasterProspectLead[] {
  return Array.isArray(payload?.leads) ? payload.leads : [];
}

function cleanPhone(phone?: string | null) {
  return phone?.replace(/\D/g, "") ?? "";
}

function ensureUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function openContact(url: string) {
  if (await Linking.canOpenURL(url)) await Linking.openURL(url);
}

export default function ProspectingScreen() {
  const { user } = useBarber();
  const [filters, setFilters] = useState<MasterProspectFilters>({ state: "", city: "", term: "" });
  const [leads, setLeads] = useState<MasterProspectLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      await api.masterProspectSearch(filters);
      const response = await api.masterProspectLeads(filters);
      setLeads(leadList(response));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível buscar barbearias.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  if (!user?.platform_admin || user.barbershop_id !== null) return null;

  return (
    <Screen keyboard>
      <Header title="Prospecção" subtitle="Encontre novas barbearias para a plataforma." />
      <Card>
        <Text style={styles.sectionTitle}>Buscar barbearias</Text>
        <Text style={styles.muted}>Refine a busca por localização ou nome. O contato é sempre iniciado manualmente por você.</Text>
        <Field label="Estado" placeholder="Ex.: SP" autoCapitalize="characters" value={filters.state} onChangeText={(state) => setFilters((current) => ({ ...current, state }))} />
        <Field label="Cidade" placeholder="Ex.: São Paulo" value={filters.city} onChangeText={(city) => setFilters((current) => ({ ...current, city }))} />
        <Field label="Termo" placeholder="Ex.: barbearia masculina" value={filters.term} onChangeText={(term) => setFilters((current) => ({ ...current, term }))} returnKeyType="search" onSubmitEditing={() => void search()} />
        <Button icon="search" loading={loading} onPress={() => void search()}>Buscar barbearias</Button>
      </Card>

      {loading ? <LoadingState label="Buscando barbearias..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={() => void search()} /> : null}
      {!loading && !error && searched && !leads.length ? <EmptyState icon="map-pin" title="Nenhuma barbearia encontrada" text="Tente alterar o estado, a cidade ou o termo da busca." /> : null}
      {!loading && !error && leads.length ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>{leads.length} lead(s) encontrado(s)</Text>
          {leads.map((lead, index) => {
            const phone = cleanPhone(lead.phone);
            const website = lead.website?.trim();
            const email = lead.email?.trim();
            return (
              <Card key={String(lead.id ?? `${lead.name}-${index}`)}>
                <View style={styles.row}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.sectionTitle}>{lead.name}</Text>
                    {lead.address ? <Text style={styles.muted}>{lead.address}</Text> : null}
                    {lead.city || lead.state ? <Text style={styles.muted}>{[lead.city, lead.state].filter(Boolean).join(" / ")}</Text> : null}
                  </View>
                  <Text style={{ color: lead.status === "contacted" ? BARBER_COLORS.success : BARBER_COLORS.gold, fontWeight: "800", fontSize: 12 }}>{lead.status_label ?? lead.status ?? "NOVO"}</Text>
                </View>
                <View style={styles.wrap}>
                  {phone ? <Button variant="secondary" icon="message-circle" onPress={() => void openContact(`https://wa.me/${phone}`)}>WhatsApp</Button> : null}
                  {website ? <Button variant="secondary" icon="globe" onPress={() => void openContact(ensureUrl(website))}>Site</Button> : null}
                  {email ? <Button variant="secondary" icon="mail" onPress={() => void openContact(`mailto:${email}`)}>E-mail</Button> : null}
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}
