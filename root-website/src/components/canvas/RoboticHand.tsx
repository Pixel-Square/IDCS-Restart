import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollStore } from '@/store/scrollStore'
import { mapProgress } from '@/hooks/useScrollProgress'

// Chrome-steel material shared across all finger segments
function steelMaterial(emissiveIntensity = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color:              new THREE.Color('#2a3a4a'),
    metalness:          0.95,
    roughness:          0.08,
    emissive:           new THREE.Color('#002244'),
    emissiveIntensity,
  })
}

function glowMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color:             new THREE.Color('#001122'),
    metalness:         0.7,
    roughness:         0.1,
    emissive:          new THREE.Color('#0090FF'),
    emissiveIntensity: 1.2,
    transparent:       true,
    opacity:           0.9,
  })
}

// ─── Finger: 3 phalanges + knuckle joints ─────────────────────────────────────
interface FingerProps {
  basePos:   [number, number, number]
  rotations: [number, number, number][]  // [x,y,z] per phalanx
  lengths:   [number, number, number]
  radius:    number
  curl:      number   // 0 = straight, 1 = fully curled
}

function Finger({ basePos, rotations, lengths, radius, curl }: FingerProps) {
  const mat  = useMemo(() => steelMaterial(0.05), [])
  const gmat = useMemo(() => glowMaterial(),       [])

  const segPositions: [number, number, number][] = [
    [0, 0, 0],
    [0, lengths[0] + 0.02, 0],
    [0, lengths[0] + lengths[1] + 0.04, 0],
  ]

  return (
    <group position={basePos}>
      {[0, 1, 2].map((seg) => {
        const curlRot = curl * 0.8 * (seg + 1) * 0.5
        return (
          <group
            key={seg}
            position={segPositions[seg]}
            rotation={[rotations[seg][0] + curlRot, rotations[seg][1], rotations[seg][2]]}
          >
            {/* Segment cylinder */}
            <mesh material={mat} castShadow>
              <cylinderGeometry args={[radius * 0.85, radius, lengths[seg], 8]} />
            </mesh>
            {/* Knuckle joint */}
            <mesh position={[0, lengths[seg] * 0.5, 0]} material={mat}>
              <sphereGeometry args={[radius * 1.05, 8, 6]} />
            </mesh>
            {/* Metallic joint ring */}
            <mesh position={[0, lengths[seg] * 0.5, 0]}>
              <torusGeometry args={[radius * 1.1, 0.018, 6, 12]} />
              <meshStandardMaterial color="#445566" metalness={0.99} roughness={0.05} />
            </mesh>
          </group>
        )
      })}
      {/* Fingertip glow */}
      <mesh position={[0, lengths[0] + lengths[1] + lengths[2] + 0.06, 0]} material={gmat}>
        <sphereGeometry args={[radius * 0.8, 8, 6]} />
      </mesh>
    </group>
  )
}

// ─── Robotic Hand (entire group) ──────────────────────────────────────────────
export function RoboticHand() {
  const groupRef = useRef<THREE.Group>(null!)
  const matRef   = useMemo(() => steelMaterial(0.08), [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t        = clock.getElapsedTime()
    const progress = scrollStore.progress

    // Emerge from below: starts at y = -6, rises to y = -0.8 as scroll 0→0.15
    const emergeY = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      -6 + mapProgress(progress, 0.04, 0.2) * 5.2,
      0.03
    )
    groupRef.current.position.y = emergeY

    // Slight idle float
    groupRef.current.position.x = Math.sin(t * 0.3) * 0.06 + 1.1
    groupRef.current.position.z = Math.sin(t * 0.2) * 0.04

    // Gentle wrist rotation based on scroll
    const wristTilt = mapProgress(progress, 0.1, 0.5) * 0.35
    groupRef.current.rotation.z = -0.15 + wristTilt + Math.sin(t * 0.25) * 0.015
    groupRef.current.rotation.x = -0.2  + Math.sin(t * 0.3) * 0.02

    // Scale up on emergence
    const scale = 0.55 + mapProgress(progress, 0.04, 0.18) * 0.45
    groupRef.current.scale.setScalar(scale)
  })

  const fingerCurl = 0.05  // slightly closed resting pose

  return (
    <group ref={groupRef} position={[1.1, -6, 0.5]} rotation={[0, 0.15, 0]}>
      {/* Palm */}
      <mesh material={matRef} castShadow receiveShadow>
        <boxGeometry args={[0.9, 1.1, 0.28]} />
      </mesh>
      {/* Palm groove details */}
      {[-0.25, 0, 0.25].map((xOffset, i) => (
        <mesh key={i} position={[xOffset, 0, 0.145]} material={matRef}>
          <boxGeometry args={[0.22, 0.9, 0.02]} />
        </mesh>
      ))}
      {/* Wrist */}
      <mesh position={[0, -0.7, 0]} material={matRef}>
        <cylinderGeometry args={[0.3, 0.38, 0.42, 10]} />
      </mesh>
      <mesh position={[0, -0.92, 0]}>
        <torusGeometry args={[0.34, 0.025, 8, 20]} />
        <meshStandardMaterial color="#0090FF" metalness={0.8} roughness={0.1} emissive="#0090FF" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, -0.72, 0]}>
        <torusGeometry args={[0.31, 0.018, 8, 20]} />
        <meshStandardMaterial color="#00FFDD" metalness={0.8} roughness={0.1} emissive="#00FFDD" emissiveIntensity={0.4} />
      </mesh>

      {/* Index finger */}
      <Finger
        basePos={[-0.27, 0.55, 0]}
        rotations={[[0.08, 0, -0.1], [0, 0, -0.05], [0, 0, -0.02]]}
        lengths={[0.36, 0.28, 0.22]}
        radius={0.075}
        curl={fingerCurl}
      />
      {/* Middle finger */}
      <Finger
        basePos={[-0.08, 0.58, 0]}
        rotations={[[0.05, 0, 0], [0, 0, 0], [0, 0, 0]]}
        lengths={[0.40, 0.30, 0.24]}
        radius={0.08}
        curl={fingerCurl}
      />
      {/* Ring finger */}
      <Finger
        basePos={[0.11, 0.56, 0]}
        rotations={[[0.08, 0, 0.06], [0, 0, 0.03], [0, 0, 0.02]]}
        lengths={[0.37, 0.28, 0.22]}
        radius={0.074}
        curl={fingerCurl}
      />
      {/* Pinky */}
      <Finger
        basePos={[0.29, 0.50, 0]}
        rotations={[[0.12, 0, 0.12], [0, 0, 0.06], [0, 0, 0.03]]}
        lengths={[0.30, 0.22, 0.17]}
        radius={0.064}
        curl={fingerCurl + 0.05}
      />
      {/* Thumb */}
      <Finger
        basePos={[-0.48, 0.22, 0.08]}
        rotations={[[-0.3, 0, -0.55], [0.1, 0, -0.2], [0.05, 0, -0.1]]}
        lengths={[0.30, 0.24, 0.18]}
        radius={0.088}
        curl={0}
      />

      {/* Data vein lines along palm */}
      {[0.15, -0.15].map((xOff, i) => (
        <mesh key={i} position={[xOff, 0.2, 0.15]}>
          <cylinderGeometry args={[0.008, 0.008, 0.7, 4]} />
          <meshStandardMaterial
            color="#00FFDD"
            emissive="#00FFDD"
            emissiveIntensity={0.8 + Math.sin(i) * 0.2}
            metalness={0.5}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* Point light from fingertips — cinematic glow */}
      <pointLight position={[0, 0.9, 0.2]} color="#0090FF" intensity={2.5} distance={3} decay={2} />
      <pointLight position={[0, -0.2, 0.3]} color="#00FFDD" intensity={1.2} distance={2} decay={2} />
    </group>
  )
}
