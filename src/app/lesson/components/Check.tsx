/** `<Check id="…">`: a knowledge check. The question types arrive with E5-03; until then it marks its place. */
export function Check({ id }: { id: string }) {
  return <div data-check={id} />
}
