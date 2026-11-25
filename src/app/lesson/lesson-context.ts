import { createContext, use } from 'react'
import type { Domain } from '@/content'

/** Which lesson the components are in: its domain decides the default depth layer (E5-05). */
export const LessonContext = createContext<{ id?: string; domain?: Domain }>({})
export const useLessonInfo = () => use(LessonContext)
