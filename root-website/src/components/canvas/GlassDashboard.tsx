import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollStore } from '@/store/scrollStore'
import { mapProgress } from '@/hooks/useScrollProgress'

const glassVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal   = normalize(normalMatrix * normal);
    vec4 wp   = modelMatrix * vec4(position, 1.0);
    vViewDir  = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const glassFrag = /* glsl */ `
  uniform sampler2D uContent;
  uniform float     uTime;
  uniform float     uOpacity;
  uniform float     uEdgeGlow;
  uniform vec3      uGlowColor;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    // Fresnel rim
    float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
    fresnel = pow(fresnel, 2.8);

    // Content texture
    vec4 content = texture2D(uContent, vUv);

    // Glass body
    vec3 glassBody = vec3(0.03, 0.07, 0.12) + uGlowColor * 0.04;

    // Subtle scan lines
    float scan = sin(vUv.y * 180.0 + uTime * 1.5) * 0.015;
    glassBody += scan;

    // Edge scratches
    float scratchX = step(0.996, fract(vUv.x * 40.0)) * 0.04;
    float scratchY = step(0.994, fract(vUv.y * 60.0)) * 0.03;
    glassBody += (scratchX + scratchY);

    vec3 finalColor = mix(glassBody, content.rgb, content.a * 0.85);
    finalColor += uGlowColor * fresnel * uEdgeGlow;

    // Corner highlight
    vec2 edge = abs(vUv - 0.5) * 2.0;
    float corner = max(edge.x, edge.y);
    float cornerGlow = smoothstep(0.88, 1.0, corner) * 0.25;
    finalColor += uGlowColor * cornerGlow;

    float alpha = uOpacity * (0.18 + fresnel * 0.35) + content.a * 0.55;
    gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 0.95));
  }
`

/** Draw a mini chart onto a canvas, returns a THREE.CanvasTexture */
function createChartTexture(
  type: 'bar' | 'line' | 'donut' | 'heatmap' | 'scatter',
  label: string,
  color: string
): THREE.CanvasTexture {
  const W = 512, H = 320
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background — transparent
  ctx.clearRect(0, 0, W, H)

  // Header
  ctx.fillStyle = 'rgba(0,144,255,0.08)'
  ctx.fillRect(0, 0, W, 44)
  ctx.fillStyle = color
  ctx.font = 'bold 15px Inter, sans-serif'
  ctx.fillText(label, 16, 27)

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let y = 60; y < H - 20; y += 40) {
    ctx.beginPath(); ctx.moveTo(16, y); ctx.lineTo(W - 16, y); ctx.stroke()
  }

  const barW = (W - 32) / 10 - 6

  if (type === 'bar') {
    for (let i = 0; i < 10; i++) {
      const h = 50 + Math.random() * 150
      const x = 16 + i * ((W - 32) / 10)
      const grad = ctx.createLinearGradient(x, H - 24 - h, x, H - 24)
      grad.addColorStop(0, color)
      grad.addColorStop(1, color + '33')
      ctx.fillStyle = grad
      ctx.fillRect(x, H - 24 - h, barW, h)
    }
  } else if (type === 'line') {
    const points: [number, number][] = []
    for (let i = 0; i <= 12; i++) {
      points.push([
        16 + (i / 12) * (W - 32),
        H - 24 - (60 + Math.random() * 140),
      ])
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) {
      const [cx, cy] = [
        (points[i - 1][0] + points[i][0]) / 2,
        (points[i - 1][1] + points[i][1]) / 2,
      ]
      ctx.quadraticCurveTo(points[i - 1][0], points[i - 1][1], cx, cy)
    }
    ctx.stroke()
    // Fill under
    ctx.shadowBlur = 0
    ctx.lineTo(points[points.length - 1][0], H - 24)
    ctx.lineTo(points[0][0], H - 24)
    ctx.closePath()
    ctx.fillStyle = color + '18'
    ctx.fill()
    // Dots
    points.forEach(([x, y]) => {
      ctx.beginPath()
      ctx.arc(x, y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
  } else if (type === 'donut') {
    const cx = W / 2, cy = H / 2 + 10, r = 90, innerR = 55
    const segments = [0.35, 0.25, 0.22, 0.18]
    const segColors = [color, '#00FFDD', '#FF6600', '#8B5CF6']
    let startAngle = -Math.PI / 2
    segments.forEach((seg, i) => {
      const endAngle = startAngle + seg * 2 * Math.PI
      ctx.beginPath()
      ctx.arc(cx, cy, r, startAngle, endAngle)
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true)
      ctx.closePath()
      ctx.fillStyle = segColors[i]
      ctx.fill()
      startAngle = endAngle
    })
    ctx.fillStyle = 'rgba(5,5,8,0.9)'
    ctx.beginPath(); ctx.arc(cx, cy, innerR - 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; ctx.textAlign = 'center'
    ctx.fillText('87%', cx, cy + 7)
  } else if (type === 'heatmap') {
    const cols = 12, rows = 5
    const cw = (W - 32) / cols, ch = (H - 80) / rows
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = Math.random()
        ctx.fillStyle = `rgba(0,144,255,${v * 0.8 + 0.1})`
        ctx.fillRect(16 + c * cw + 2, 52 + r * ch + 2, cw - 4, ch - 4)
      }
    }
  } else {
    // scatter
    for (let i = 0; i < 40; i++) {
      const x = 30 + Math.random() * (W - 60)
      const y = 55 + Math.random() * (H - 90)
      ctx.beginPath(); ctx.arc(x, y, 4 + Math.random() * 5, 0, Math.PI * 2)
      ctx.fillStyle = i % 3 === 0 ? '#FF6600' : color
      ctx.globalAlpha = 0.6 + Math.random() * 0.4
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  return new THREE.CanvasTexture(canvas)
}

// Panel config
interface PanelConfig {
  position: [number, number, number]
  rotation: [number, number, number]
  size:     [number, number]
  chart:    'bar' | 'line' | 'donut' | 'heatmap' | 'scatter'
  label:    string
  color:    string
  delay:    number  // scroll progress to start appearing
}

const PANELS: PanelConfig[] = [
  { position: [-2.2,  0.8, -1.0], rotation: [0.05, 0.25, -0.03], size: [2.4, 1.5], chart: 'bar',     label: 'Student Attendance',   color: '#0090FF', delay: 0.28 },
  { position: [ 2.4,  0.4, -0.8], rotation: [0.03,-0.20,  0.02], size: [2.2, 1.4], chart: 'line',    label: 'Academic Performance', color: '#00FFDD', delay: 0.32 },
  { position: [-0.2,  2.0, -1.5], rotation: [0.08, 0.05,  0.01], size: [2.6, 1.6], chart: 'heatmap', label: 'Timetable Grid',       color: '#0090FF', delay: 0.36 },
  { position: [ 1.2, -1.4, -0.5], rotation: [-0.1, 0.15,  0.05], size: [2.0, 1.3], chart: 'donut',   label: 'Department Metrics',   color: '#FF6600', delay: 0.40 },
  { position: [-3.0, -0.6,  0.0], rotation: [0.04, 0.35,  0.02], size: [1.8, 1.2], chart: 'scatter', label: 'CQI Analytics',        color: '#8B5CF6', delay: 0.44 },
  { position: [ 3.4,  1.6, -1.2], rotation: [0.06,-0.28,  0.03], size: [2.0, 1.3], chart: 'line',    label: 'Faculty Workload',     color: '#00FFDD', delay: 0.38 },
]

function GlassPanel({ cfg }: { cfg: PanelConfig }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const opacityRef = useRef(0)

  const texture = useMemo(() => createChartTexture(cfg.chart, cfg.label, cfg.color), [cfg])
  useEffect(() => () => texture.dispose(), [texture])

  const uniforms = useRef({
    uContent:   { value: texture },
    uTime:      { value: 0 },
    uOpacity:   { value: 0 },
    uEdgeGlow:  { value: 0.45 },
    uGlowColor: { value: new THREE.Color(cfg.color) },
  })

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const progress = scrollStore.progress
    uniforms.current.uTime.value = clock.getElapsedTime()

    const targetOpacity = mapProgress(progress, cfg.delay, cfg.delay + 0.06) *
                          (1 - mapProgress(progress, 0.78, 0.86))
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, targetOpacity, 0.04)
    uniforms.current.uOpacity.value = opacityRef.current

    // Gentle float
    meshRef.current.position.y =
      cfg.position[1] + Math.sin(clock.getElapsedTime() * 0.4 + cfg.delay * 10) * 0.08

    // Edge glow pulses on dashboard/brain scenes
    const inScene = progress > cfg.delay && progress < 0.78
    uniforms.current.uEdgeGlow.value = inScene
      ? 0.45 + Math.sin(clock.getElapsedTime() * 1.2 + cfg.delay * 5) * 0.15
      : 0.0
  })

  return (
    <mesh
      ref={meshRef}
      position={cfg.position}
      rotation={cfg.rotation}
      castShadow
    >
      <planeGeometry args={[cfg.size[0], cfg.size[1]]} />
      <shaderMaterial
        vertexShader={glassVert}
        fragmentShader={glassFrag}
        uniforms={uniforms.current}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export function GlassDashboards() {
  return (
    <group>
      {PANELS.map((cfg, i) => (
        <GlassPanel key={i} cfg={cfg} />
      ))}
    </group>
  )
}
