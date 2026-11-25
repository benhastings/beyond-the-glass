import { createContext, use } from 'react'

/** The step the lesson player is showing (E5-04); undefined shows every step, as outside the player. */
export const StepContext = createContext<string | undefined>(undefined)
export const useCurrentStep = () => use(StepContext)
