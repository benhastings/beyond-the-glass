import { createContext, use } from 'react'
import type { Check } from '@/content/checks'

/** The checks of the lesson being shown, for `<Check id>` to find its definition (E5-03). */
export const ChecksContext = createContext<readonly Check[]>([])
export const useCheck = (id: string) => use(ChecksContext).find((c) => c.id === id)
