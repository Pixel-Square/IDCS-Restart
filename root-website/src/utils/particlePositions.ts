import * as THREE from 'three'

const PARTICLE_COUNT = 7000

/** Random scatter sphere — dormant state */
export function dormantPositions(count = PARTICLE_COUNT): Float32Array {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 4 + Math.random() * 3
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) - 0.5
    pos[i * 3 + 2] = r * Math.cos(phi)
  }
  return pos
}

/** Tighter awakened cloud with slight structure */
export function awakenedPositions(count = PARTICLE_COUNT): Float32Array {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = (1.5 + Math.random() * 2) * (Math.random() > 0.3 ? 1 : 0.4)
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta) + Math.sin(i * 0.01) * 0.5
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) + Math.cos(i * 0.01) * 0.3
    pos[i * 3 + 2] = r * Math.cos(phi)
  }
  return pos
}

/** Neural flow streams — data state */
export function dataFlowPositions(count = PARTICLE_COUNT): Float32Array {
  const pos = new Float32Array(count * 3)
  const streams = 12
  for (let i = 0; i < count; i++) {
    const stream = i % streams
    const t = (i / count) * Math.PI * 4 + (stream / streams) * Math.PI * 2
    const streamAngle = (stream / streams) * Math.PI * 2
    const spread = 0.25 + Math.random() * 0.15
    const radius = 1.5 + Math.sin(stream * 1.3) * 0.8
    pos[i * 3] = Math.cos(streamAngle) * radius + Math.sin(t * 1.5) * spread
    pos[i * 3 + 1] = Math.sin(t * 0.7) * 2.5 + (Math.random() - 0.5) * 0.3
    pos[i * 3 + 2] = Math.sin(streamAngle) * radius + Math.cos(t * 1.2) * spread
  }
  return pos
}

/** Grid/dashboard formation */
export function dashboardPositions(count = PARTICLE_COUNT): Float32Array {
  const pos = new Float32Array(count * 3)
  const cols = 100
  const rows = Math.ceil(count / cols)
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = (col / cols - 0.5) * 8
    const y = (row / rows - 0.5) * -5
    const z = Math.random() * 0.4 - 0.2
    // Vary height like a bar chart
    const barHeight = Math.sin(col * 0.3) * 0.5 + Math.cos(row * 0.5) * 0.3
    pos[i * 3] = x
    pos[i * 3 + 1] = y + barHeight
    pos[i * 3 + 2] = z
  }
  return pos
}

/** Hollow sphere (institutional brain) */
export function brainPositions(count = PARTICLE_COUNT): Float32Array {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 2.8 + (Math.random() - 0.5) * 0.4
    // Create brain-like folds
    const fold = Math.sin(phi * 6) * Math.cos(theta * 4) * 0.3
    pos[i * 3] = (r + fold) * Math.sin(phi) * Math.cos(theta)
    pos[i * 3 + 1] = (r + fold) * Math.sin(phi) * Math.sin(theta) * 0.85
    pos[i * 3 + 2] = (r + fold) * Math.cos(phi)
  }
  return pos
}

/** IDCS text logo positions — sampled from canvas rasterization */
export function logoPositions(count = PARTICLE_COUNT): Float32Array {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 512, 128)
  ctx.fillStyle = 'white'
  ctx.font = 'bold 96px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('IDCS', 256, 64)

  const imageData = ctx.getImageData(0, 0, 512, 128)
  const pixelList: [number, number][] = []
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 512; x++) {
      const idx = (y * 512 + x) * 4
      if (imageData.data[idx + 3] > 100) {
        pixelList.push([x, y])
      }
    }
  }

  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    if (pixelList.length > 0) {
      const p = pixelList[Math.floor(Math.random() * pixelList.length)]
      pos[i * 3] = (p[0] / 512 - 0.5) * 10
      pos[i * 3 + 1] = -(p[1] / 128 - 0.5) * 2.5
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3
    } else {
      // Fallback: sphere
      const theta = Math.random() * Math.PI * 2
      const r = 2 * Math.random()
      pos[i * 3] = Math.cos(theta) * r
      pos[i * 3 + 1] = Math.sin(theta) * r
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3
    }
  }
  return pos
}

/** Generate random per-particle colors for state A and B */
export function generateColors(count = PARTICLE_COUNT, hue: 'blue' | 'cyan' | 'orange' | 'mix' = 'mix'): Float32Array {
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    let color: THREE.Color
    const rand = Math.random()
    if (hue === 'blue' || (hue === 'mix' && rand < 0.5)) {
      color = new THREE.Color().setHSL(0.58 + Math.random() * 0.06, 0.9, 0.5 + Math.random() * 0.3)
    } else if (hue === 'cyan' || (hue === 'mix' && rand < 0.8)) {
      color = new THREE.Color().setHSL(0.5 + Math.random() * 0.05, 1.0, 0.6 + Math.random() * 0.3)
    } else {
      color = new THREE.Color().setHSL(0.06 + Math.random() * 0.04, 0.9, 0.5 + Math.random() * 0.3)
    }
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  return colors
}

export const PARTICLE_COUNT_EXPORT = PARTICLE_COUNT
