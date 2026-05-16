import { useEffect, useRef, useState } from 'react'
import { scrollStore } from '@/store/scrollStore'

/**
 * Returns current scroll progress [0–1] as React state.
 * For Three.js components, read scrollStore.progress directly in useFrame.
 */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    let last = -1
    const update = () => {
      if (scrollStore.progress !== last) {
        last = scrollStore.progress
        setProgress(scrollStore.progress)
      }
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return progress
}

/** Map scroll progress [0,1] to a value between start and end, clamped */
export function mapProgress(
  progress: number,
  inStart: number,
  inEnd: number,
  outStart = 0,
  outEnd = 1
): number {
  const t = Math.max(0, Math.min(1, (progress - inStart) / (inEnd - inStart)))
  return outStart + t * (outEnd - outStart)
}
