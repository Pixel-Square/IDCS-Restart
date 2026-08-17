import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Volumetric floor — matte black reflective studio surface */
export function StudioEnvironment() {
  const floorRef  = useRef<THREE.Mesh>(null!)
  const fogRef    = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    if (fogRef.current) {
      const mat = fogRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.22 + Math.sin(clock.getElapsedTime() * 0.2) * 0.04
    }
  })

  return (
    <group>
      {/* Studio floor */}
      <mesh ref={floorRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.5, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial
          color="#06080A"
          metalness={0.7}
          roughness={0.3}
          envMapIntensity={0.4}
        />
      </mesh>

      {/* Floor reflection gradient */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.49, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial
          color="#0090FF"
          transparent
          opacity={0.02}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Volumetric fog plane */}
      <mesh ref={fogRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial
          color="#060A14"
          transparent
          opacity={0.22}
          blending={THREE.NormalBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Key light — warm top-right cinematic */}
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.8}
        color="#D4E8FF"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      {/* Fill light — cool blue left */}
      <directionalLight position={[-5, 2, -1]} intensity={0.6} color="#0044AA" />

      {/* Rim light — backlight cinematic separation */}
      <directionalLight position={[0, -1, -5]} intensity={0.4} color="#00FFDD" />

      {/* Ambient — very dark */}
      <ambientLight intensity={0.06} color="#050510" />

      {/* Floor bounce */}
      <pointLight position={[0, -2, 0]} intensity={0.8} color="#0022AA" distance={8} decay={2} />

      {/* Distant volumetric atmosphere lights */}
      <pointLight position={[-6, 3, -4]} intensity={0.5} color="#0055CC" distance={12} decay={1.5} />
      <pointLight position={[ 6, 4, -3]} intensity={0.3} color="#003388" distance={10} decay={1.5} />
    </group>
  )
}
