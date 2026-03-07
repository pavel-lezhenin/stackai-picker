/** Renders a string with the matching query substring bolded. Case-insensitive. */
export function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const idx = lowerName.indexOf(lowerQuery);
  if (idx === -1) return <>{name}</>;

  const before = name.slice(0, idx);
  const match = name.slice(idx, idx + lowerQuery.length);
  const after = name.slice(idx + lowerQuery.length);

  return (
    <>
      {before}
      <span className="font-bold text-foreground">{match}</span>
      {after}
    </>
  );
}
