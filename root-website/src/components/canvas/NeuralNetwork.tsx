import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollStore } from '@/store/scrollStore'
import { mapProgress } from '@/hooks/useScrollProgress'

// Node positions for the institutional neural network (Scene 4)
const NODE_COUNT = 24
const MODULE_LABELS = [
  'Students', 'Faculty', 'HOD', 'IQAC', 'Attendance',
  'LMS', 'COE', 'Timetable', 'Academics', 'OBE',
  'Feedback', 'HR', 'Library', 'PBAS', 'Curriculum',
  'Reports', 'Salary', 'Requests', 'Gate', 'BI',
  'WhatsApp', 'Scanner', 'Applications', 'Announcements',
]

export function NeuralNetwork() {
  const linesRef = useRef<THREE.LineSegments>(null!)
  const nodeRefs = useRef<THREE.InstancedMesh>(null!)
  const opacityRef = useRef(0)

  // Generate node positions on a sphere
  const nodePositions = useMemo(() => {
    const pos: THREE.Vector3[] = []
    for (let i = 0; i < NODE_COUNT; i++) {
      const theta = (i / NODE_COUNT) * Math.PI * 2
      const phi   = Math.acos(1 - (2 * (i + 0.5)) / NODE_COUNT)
      const r     = 2.6 + (Math.random() - 0.5) * 0.5
      pos.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.9,
        r * Math.cos(phi),
      ))
    }
    return pos
  }, [])

  // Build line segments: each node connects to its 3 nearest neighbours
  const linePositions = useMemo(() => {
    const positions: number[] = []
    for (let i = 0; i < NODE_COUNT; i++) {
      const distances = nodePositions.map((p, j) => ({
        j,
        d: nodePositions[i].distanceTo(p),
      })).filter(({ j }) => j !== i).sort((a, b) => a.d - b.d)

      distances.slice(0, 3).forEach(({ j }) => {
        const a = nodePositions[i]
        const b = nodePositions[j]
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      })
    }
    return new Float32Array(positions)
  }, [nodePositions])

  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
    return geo
  }, [linePositions])

  const lineMat = useMemo(() =>
    new THREE.LineBasicMaterial({
      color:       new THREE.Color('#0060AA'),
      transparent: true,
      opacity:     0,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    }),
  [])

  // Instanced spheres for nodes
  const nodeMat = useMemo(() =>
    new THREE.MeshStandardMaterial({
      color:             new THREE.Color('#001122'),
      emissive:          new THREE.Color('#0090FF'),
      emissiveIntensity: 1.4,
      metalness:         0.8,
      roughness:         0.1,
    }),
  [])

  const nodeGeo = useMemo(() => new THREE.SphereGeometry(0.055, 8, 6), [])

  // Pre-compute instance matrices
  const matrices = useMemo(() => {
    return nodePositions.map((pos) => {
      const m = new THREE.Matrix4()
      m.setPosition(pos)
      return m
    })
  }, [nodePositions])

  useFrame(({ clock }) => {
    const t        = clock.getElapsedTime()
    const progress = scrollStore.progress

    // Visible in Scene 4 (0.46–0.82)
    const target = mapProgress(progress, 0.47, 0.54) * (1 - mapProgress(progress, 0.80, 0.86))
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, target, 0.035)

    lineMat.opacity = opacityRef.current * 0.55

    if (nodeRefs.current) {
      nodeRefs.current.material = nodeMat
      ;(nodeRefs.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.2 + Math.sin(t * 1.8) * 0.4

      // Pulse-rotate the whole network
      nodeRefs.current.rotation.y = t * 0.06
      nodeRefs.current.rotation.x = Math.sin(t * 0.04) * 0.12

      nodeRefs.current.scale.setScalar(opacityRef.current)
    }

    if (linesRef.current) {
      linesRef.current.rotation.y = t * 0.06
      linesRef.current.rotation.x = Math.sin(t * 0.04) * 0.12
      linesRef.current.scale.setScalar(opacityRef.current)
    }
  })

  return (
    <group>
      <lineSegments ref={linesRef} geometry={lineGeo} material={lineMat} />
      <instancedMesh
        ref={nodeRefs}
        args={[nodeGeo, nodeMat, NODE_COUNT]}
        castShadow
      >
        {matrices.map((m, i) => {
          // Seed each instance
          void i
          return null
        })}
      </instancedMesh>
      {/* Set instance matrices imperatively via useEffect alternative */}
      <NeuralNodesInstancer matrices={matrices} nodeGeo={nodeGeo} nodeMat={nodeMat} nodeRefs={nodeRefs} />
    </group>
  )
}

// Separate component to set instance matrices
function NeuralNodesInstancer({
  matrices,
  nodeGeo,
  nodeMat,
  nodeRefs,
}: {
  matrices: THREE.Matrix4[]
  nodeGeo:  THREE.SphereGeometry
  nodeMat:  THREE.MeshStandardMaterial
  nodeRefs: React.MutableRefObject<THREE.InstancedMesh>
}) {
  useFrame(() => {
    if (!nodeRefs.current) return
    matrices.forEach((m, i) => {
      nodeRefs.current.setMatrixAt(i, m)
    })
    nodeRefs.current.instanceMatrix.needsUpdate = true
  })
  return null
}
