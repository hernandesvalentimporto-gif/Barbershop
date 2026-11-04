export const PRICE_REFERENCE = [
  { name: "Corte Máquina", price_cents: 3500 },
  { name: "Corte Tesoura", price_cents: 4000 },
  { name: "Corte Navalhado", price_cents: 4000 },
  { name: "Barba Terapia", price_cents: 4000 },
  { name: "Barba", price_cents: 3000 },
  { name: "Reflexo", price_cents: 10000 },
  { name: "Nevou", price_cents: 12000 },
] as const;

// Não cadastrar por suposição os itens afetados por reflexo ou pela toalha.
export const PRICE_REFERENCE_PENDING =
  "Corte Infantil, Pezinho e os itens da parte inferior precisam de confirmação dos nomes e valores. A foto não informa duração de nenhum serviço.";
