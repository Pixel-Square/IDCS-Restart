import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import { ParticleField }       from './ParticleField'
import { RoboticHand }         from './RoboticHand'
import { GlassDashboards }     from './GlassDashboard'
import { NeuralNetwork }       from './NeuralNetwork'
import { StudioEnvironment }   from './StudioEnvironment'
import { CinematicCamera }     from './CinematicCamera'

interface IDCSCanvasProps {
  className?: string
}

export function IDCSCanvas({ className }: IDCSCanvasProps) {
  return (
    <Canvas
      className={className}
      gl={{
        antialias:    true,
        alpha:        false,
        powerPreference: 'high-performance',
        toneMapping:  3, // THREE.ACESFilmicToneMapping
        toneMappingExposure: 1.1,
      }}
      shadows
      camera={{ position: [0, 0.2, 8.5], fov: 55, near: 0.1, far: 100 }}
      style={{ background: '#050508' }}
      dpr={[1, 1.5]}
    >
      <AdaptiveDpr pixelated />

      <Suspense fallback={null}>
        <CinematicCamera />
        <StudioEnvironment />
        <ParticleField />
        <RoboticHand />
        <GlassDashboards />
        <NeuralNetwork />
      </Suspense>
    </Canvas>
  )
}
