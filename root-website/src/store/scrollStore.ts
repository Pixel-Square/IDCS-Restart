// Global scroll progress store — read by Three.js useFrame without re-renders
export const scrollStore = {
  progress: 0,
  velocity: 0,
  direction: 1,
  _prev: 0,
}

export function updateScrollStore(progress: number) {
  scrollStore.velocity = progress - scrollStore._prev
  scrollStore.direction = scrollStore.velocity >= 0 ? 1 : -1
  scrollStore._prev = scrollStore.progress
  scrollStore.progress = progress
}
