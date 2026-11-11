export const PRICE_REFERENCE = [
  { name: "Corte Máquina", price_cents: 3500, category: "Serviços" },
  { name: "Corte Tesoura", price_cents: 4000, category: "Serviços" },
  { name: "Corte Navalhado", price_cents: 4000, category: "Serviços" },
  { name: "Barba Terapia", price_cents: 4000, category: "Serviços" },
  { name: "Barba", price_cents: 3000, category: "Serviços" },
  { name: "Reflexo", price_cents: 10000, category: "Serviços" },
  { name: "Nevou", price_cents: 12000, category: "Serviços" },
  { name: "Pigmentação de barba", price_cents: 3000, category: "Serviços" },
  { name: "Hidratação capilar", price_cents: 4000, category: "Serviços" },
  { name: "Platinado", price_cents: 15000, category: "Serviços" },
  { name: "Luzes", price_cents: 12000, category: "Serviços" },
  { name: "Relaxamento", price_cents: 6000, category: "Serviços" },
  { name: "Alisamento", price_cents: 8000, category: "Serviços" },
  { name: "Corte + Barba", price_cents: 6500, category: "Combos promocionais" },
  { name: "Corte + Sobrancelha", price_cents: 5000, category: "Combos promocionais" },
  { name: "Corte + Barba + Sobrancelha", price_cents: 7500, category: "Combos promocionais" },
  { name: "Corte + Hidratação", price_cents: 7000, category: "Combos promocionais" },
  { name: "Pacote VIP (corte + barba + toalha quente)", price_cents: 8500, category: "Combos promocionais" },
] as const;

export const PRICE_REFERENCE_PENDING =
  "Os itens entram como padrão de preço. A duração não foi informada: confirme a duração antes de ativar um item para agendamento. O administrador pode editar o preço, inativar/remover da agenda ou cadastrar outro serviço.";
