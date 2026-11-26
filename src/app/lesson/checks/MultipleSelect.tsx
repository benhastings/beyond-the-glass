import { displayOptions } from '@/content/checks'
import type { TypeProps } from './types'

export function MultipleSelect({ check, value, onChange }: TypeProps<'multiple'>) {
  return (
    <div className="grid gap-2">
      {displayOptions(check).map((o) => (
        <label key={o.id} className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={value.includes(o.id)}
            onChange={(e) => {
              onChange(e.target.checked ? [...value, o.id] : value.filter((v) => v !== o.id))
            }}
            className="size-5"
          />
          {o.text}
        </label>
      ))}
    </div>
  )
}
