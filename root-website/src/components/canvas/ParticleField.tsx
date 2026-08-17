import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  dormantPositions,
  awakenedPositions,
  dataFlowPositions,
  dashboardPositions,
  brainPositions,
  logoPositions,
  generateColors,
  PARTICLE_COUNT_EXPORT as PC,
} from '@/utils/particlePositions'
import { scrollStore } from '@/store/scrollStore'
import { mapProgress } from '@/hooks/useScrollProgress'

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;
  uniform float uSize;
  uniform float uOpacity;

  attribute vec3 aPositionA;
  attribute vec3 aPositionB;
  attribute float aRandom;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  float easeInOut(float t) {
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }

  void main() {
    float morph = easeInOut(clamp(uMorph, 0.0, 1.0));
    vec3 pos = mix(aPositionA, aPositionB, morph);

    // Organic floating motion — quiets down as morph increases
    float calm = 1.0 - morph * 0.75;
    pos.x += sin(uTime * 0.4 + aRandom * 6.28) * 0.07 * calm;
    pos.y += cos(uTime * 0.35 + aRandom * 3.14) * 0.07 * calm;
    pos.z += sin(uTime * 0.5 + aRandom * 9.42) * 0.04 * calm;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Perspective-correct point size with pulse
    float pulse = 0.8 + 0.2 * sin(uTime * 2.0 + aRandom * 6.28);
    gl_PointSize = uSize * pulse * (350.0 / -mvPosition.z);
    gl_PointSize = max(gl_PointSize, 1.0);

    vColor = aColor;
    float dist = -mvPosition.z;
    vAlpha = uOpacity * smoothstep(14.0, 1.5, dist);
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv) * 2.0;
    if (dist > 1.0) discard;

    // Soft disc with bright core
    float alpha = (1.0 - dist * dist) * vAlpha;
    float core  = smoothstep(0.35, 0.0, dist);
    vec3 color  = mix(vColor, vec3(1.0), core * 0.6);

    // Additive glow ring
    float ring = smoothstep(0.6, 0.4, dist) * smoothstep(1.0, 0.7, dist) * 0.3;
    color += vColor * ring;

    gl_FragColor = vec4(color, alpha);
  }
`

// Scroll range at which each state becomes the "B" target
const STATE_TRANSITIONS = [
  { from: 0.00, to: 0.12 },  // dormant   → awakened
  { from: 0.12, to: 0.28 },  // awakened  → data
  { from: 0.28, to: 0.46 },  // data      → dashboard
  { from: 0.46, to: 0.65 },  // dashboard → brain
  { from: 0.65, to: 0.82 },  // brain     → logo
]

type StatePositions = {
  dormant: Float32Array
  awakened: Float32Array
  dataFlow: Float32Array
  dashboard: Float32Array
  brain: Float32Array
  logo: Float32Array
}

const ALL_STATES: (keyof StatePositions)[] = [
  'dormant', 'awakened', 'dataFlow', 'dashboard', 'brain', 'logo',
]

export function ParticleField() {
  const meshRef = useRef<THREE.Points>(null!)
  const morphRef = useRef(0)
  const stateIndexRef = useRef(0) // current A state index

  // Generate all state positions once (logo requires DOM, so lazy inside useMemo)
  const statePositions = useMemo<StatePositions>(() => ({
    dormant:   dormantPositions(PC),
    awakened:  awakenedPositions(PC),
    dataFlow:  dataFlowPositions(PC),
    dashboard: dashboardPositions(PC),
    brain:     brainPositions(PC),
    logo:      logoPositions(PC),
  }), [])

  const colors = useMemo(() => generateColors(PC, 'mix'), [])
  const randoms = useMemo(() => {
    const r = new Float32Array(PC)
    for (let i = 0; i < PC; i++) r[i] = Math.random()
    return r
  }, [])

  const uniformsRef = useRef({
    uTime:    { value: 0 },
    uMorph:   { value: 0 },
    uSize:    { value: 1.8 },
    uOpacity: { value: 0.0 },
  })

  // Build initial geometry with dormant → awakened
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('aPositionA', new THREE.BufferAttribute(statePositions.dormant.slice(), 3))
    geo.setAttribute('aPositionB', new THREE.BufferAttribute(statePositions.awakened.slice(), 3))
    geo.setAttribute('aColor',     new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('aRandom',    new THREE.BufferAttribute(randoms, 1))
    return geo
  }, [statePositions, colors, randoms])

  useEffect(() => {
    return () => geometry.dispose()
  }, [geometry])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    const progress = scrollStore.progress

    uniformsRef.current.uTime.value = t

    // Fade in particles early
    uniformsRef.current.uOpacity.value = THREE.MathUtils.lerp(
      uniformsRef.current.uOpacity.value,
      Math.min(1, progress * 12 + 0.15),
      0.04
    )

    // Find which transition we're in
    let targetStateIdx = 0
    let morphProgress = 0
    for (let i = 0; i < STATE_TRANSITIONS.length; i++) {
      const { from, to } = STATE_TRANSITIONS[i]
      if (progress >= from) {
        targetStateIdx = i + 1
        morphProgress = mapProgress(progress, from, to)
      }
    }
    if (progress >= STATE_TRANSITIONS[STATE_TRANSITIONS.length - 1].to) {
      targetStateIdx = ALL_STATES.length - 1
      morphProgress = 1
    }

    // If we've entered a new segment, swap A←B and set new B
    if (targetStateIdx !== stateIndexRef.current) {
      const newAState = ALL_STATES[Math.min(targetStateIdx, ALL_STATES.length - 1)]
      const newBState = ALL_STATES[Math.min(targetStateIdx + 1, ALL_STATES.length - 1)]
      const geo = meshRef.current.geometry as THREE.BufferGeometry

      const posA = statePositions[newAState]
      const posB = statePositions[newBState]
      ;(geo.getAttribute('aPositionA') as THREE.BufferAttribute).set(posA)
      ;(geo.getAttribute('aPositionA') as THREE.BufferAttribute).needsUpdate = true
      ;(geo.getAttribute('aPositionB') as THREE.BufferAttribute).set(posB)
      ;(geo.getAttribute('aPositionB') as THREE.BufferAttribute).needsUpdate = true

      stateIndexRef.current = targetStateIdx
      morphRef.current = 0
    }

    // Smoothly chase morph target
    morphRef.current = THREE.MathUtils.lerp(morphRef.current, morphProgress, 0.05)
    uniformsRef.current.uMorph.value = morphRef.current

    // Apply uniforms
    const mat = meshRef.current.material as THREE.ShaderMaterial
    mat.uniforms.uTime.value    = uniformsRef.current.uTime.value
    mat.uniforms.uMorph.value   = uniformsRef.current.uMorph.value
    mat.uniforms.uOpacity.value = uniformsRef.current.uOpacity.value
  })

  return (
    <points ref={meshRef} geometry={geometry}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniformsRef.current}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
