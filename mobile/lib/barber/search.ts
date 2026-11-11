export type SearchableItem = {
  label: string;
  description?: string | null;
  keywords?: string | null;
};

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function filterSearchableItems<T extends SearchableItem>(items: readonly T[], query: string): T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [...items];

  return items.filter((item) =>
    normalizeSearchText(`${item.label} ${item.description ?? ""} ${item.keywords ?? ""}`).includes(normalizedQuery),
  );
}
