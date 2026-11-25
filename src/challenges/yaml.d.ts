declare module '@/challenges/*.yaml' {
  const challenge: import('@/sim/challenges/schema').Challenge
  export default challenge
}
