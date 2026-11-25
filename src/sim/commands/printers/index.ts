import {
  configMapPrinter,
  eventPrinter,
  namespacePrinter,
  nodePrinter,
  secretPrinter,
} from './cluster-objects.ts'
import { endpointsPrinter, servicePrinter } from './network.ts'
import { podPrinter } from './pod.ts'
import type { Printer } from './types.ts'
import { deploymentPrinter, replicaSetPrinter } from './workloads.ts'

/** Every type `kubectl get` can list. To add one: a printer, plus one line here. */
export const PRINTERS: readonly Printer[] = [
  podPrinter,
  deploymentPrinter,
  replicaSetPrinter,
  servicePrinter,
  endpointsPrinter,
  nodePrinter,
  namespacePrinter,
  configMapPrinter,
  secretPrinter,
  eventPrinter,
]

export const printerFor = (plural: string) => PRINTERS.find((p) => p.type === plural)

export * from './types.ts'
export { endpointsText } from './network.ts'
