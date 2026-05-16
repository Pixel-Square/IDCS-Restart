import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollStore } from '@/store/scrollStore'

// ─── Camera keyframes ──────────────────────────────────────────────────────────
interface CameraKeyframe {
  progress:  number
  position:  [number, number, number]
  target:    [number, number, number]
  fov:       number
}

const KEYFRAMES: CameraKeyframe[] = [
  { progress: 0.00, position: [ 0.0,  0.2,  8.5], target: [0, 0, 0],   fov: 55 },
  { progress: 0.12, position: [ 0.8,  0.5,  7.0], target: [0.3, 0, 0], fov: 52 },
  { progress: 0.28, position: [-0.8,  0.2,  6.0], target: [0, 0, 0],   fov: 58 },
  { progress: 0.45, position: [ 1.2,  0.8,  7.5], target: [0, 0.2, 0], fov: 54 },
  { progress: 0.63, position: [ 0.0,  2.5, 10.0], target: [0, 0, 0],   fov: 62 },
  { progress: 0.82, position: [ 0.0,  0.0,  6.5], target: [0, 0, 0],   fov: 50 },
  { progress: 1.00, position: [ 0.0, -0.2,  5.5], target: [0, -0.1, 0],fov: 48 },
]

function lerpKeyframes(progress: number): {
  position: THREE.Vector3
  target:   THREE.Vector3
  fov:      number
} {
  let a = KEYFRAMES[0]
  let b = KEYFRAMES[1]
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (progress >= KEYFRAMES[i].progress && progress <= KEYFRAMES[i + 1].progress) {
      a = KEYFRAMES[i]
      b = KEYFRAMES[i + 1]
      break
    }
  }
  const t = (progress - a.progress) / Math.max(b.progress - a.progress, 0.0001)
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

  return {
    position: new THREE.Vector3(
      a.position[0] + (b.position[0] - a.position[0]) * ease,
      a.position[1] + (b.position[1] - a.position[1]) * ease,
      a.position[2] + (b.position[2] - a.position[2]) * ease,
    ),
    target: new THREE.Vector3(
      a.target[0] + (b.target[0] - a.target[0]) * ease,
      a.target[1] + (b.target[1] - a.target[1]) * ease,
      a.target[2] + (b.target[2] - a.target[2]) * ease,
    ),
    fov: a.fov + (b.fov - a.fov) * ease,
  }
}

export function CinematicCamera() {
  const { camera } = useThree()
  const currentPos    = useRef(new THREE.Vector3(0, 0.2, 8.5))
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0))
  const currentFov    = useRef(55)

  useEffect(() => {
    ;(camera as THREE.PerspectiveCamera).fov = 55
    camera.position.set(0, 0.2, 8.5)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera])

  useFrame(({ clock }) => {
    const progress = scrollStore.progress
    const t        = clock.getElapsedTime()
    const { position, target, fov } = lerpKeyframes(progress)

    // Add cinematic micro-shake (hand-held rig feeling)
    const shake = 0.008
    position.x += Math.sin(t * 0.7)  * shake
    position.y += Math.cos(t * 0.55) * shake
    position.z += Math.sin(t * 0.4)  * shake * 0.5

    // Smooth camera lerp — feels like a fluid robotic rig
    currentPos.current.lerp(position, 0.035)
    currentTarget.current.lerp(target, 0.04)
    currentFov.current += (fov - currentFov.current) * 0.02

    camera.position.copy(currentPos.current)
    camera.lookAt(currentTarget.current)
    ;(camera as THREE.PerspectiveCamera).fov = currentFov.current
    camera.updateProjectionMatrix()
  })

  return null
}
