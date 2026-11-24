declare module '@/scenarios/*.yaml' {
  const scenario: import('@/sim/core/scenario').Scenario
  export default scenario
}
