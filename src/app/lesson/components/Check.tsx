import { KnowledgeCheck } from '../checks/KnowledgeCheck'
import { useCheck } from '../checks/context'

/** `<Check id="…">`: a knowledge check defined in the lesson's `.checks.yaml` (E5-03). */
export function Check({ id }: { id: string }) {
  const check = useCheck(id)
  return check ? <KnowledgeCheck check={check} /> : null
}
