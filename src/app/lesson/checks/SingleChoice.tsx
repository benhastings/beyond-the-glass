import { displayOptions } from '@/content/checks'
import type { TypeProps } from './types'

export function SingleChoice({ check, value, onChange, idBase }: TypeProps<'single'>) {
  return (
    <div className="grid gap-2">
      {displayOptions(check).map((o) => (
        <label key={o.id} className="flex min-h-11 items-center gap-3">
          <input
            type="radio"
            name={idBase}
            value={o.id}
            checked={value[0] === o.id}
            onChange={() => {
              onChange([o.id])
            }}
            className="size-5"
          />
          {o.text}
        </label>
      ))}
    </div>
  )
}
