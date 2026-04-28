import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mesh } from 'topojson-client'
import landTopology from 'world-atlas/land-110m.json'
import type { NodeDataset } from './types'

type BitcoinGlobeProps = {
  dataset: NodeDataset | null
}

const RADIUS = 2.35
const GOLD = new THREE.Color('#ffbf2f')
const ARC_LAYER_INTERVAL = 14
const ARC_FADE_SECONDS = 3.4
const ARC_COUNT = 48

type ArcLayer = {
  lines: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>
  createdAt: number
  fadingOutAt: number | null
}

function latLonToVector(lat: number, lon: number, radius = RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function createStarField() {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(1800 * 3)

  for (let i = 0; i < 1800; i += 1) {
    const radius = 16 + Math.random() * 24
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.cos(phi)
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: '#86d7ff',
      size: 0.018,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }),
  )
}

function createEarthTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  if (!ctx) return null

  const gradient = ctx.createRadialGradient(512, 256, 80, 512, 256, 520)
  gradient.addColorStop(0, '#082f62')
  gradient.addColorStop(0.58, '#041735')
  gradient.addColorStop(1, '#010813')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function createLandLines() {
  const topology = landTopology as Parameters<typeof mesh>[0] & {
    objects: { land: Parameters<typeof mesh>[1] }
  }
  const land = mesh(topology, topology.objects.land)
  const positions: number[] = []

  if (land.type === 'MultiLineString') {
    for (const line of land.coordinates) {
      for (let i = 1; i < line.length; i += 1) {
        const a = line[i - 1]
        const b = line[i]
        const va = latLonToVector(a[1], a[0], RADIUS + 0.006)
        const vb = latLonToVector(b[1], b[0], RADIUS + 0.006)
        positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: '#2cd5ff',
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
    }),
  )
}

function createNodePoints(dataset: NodeDataset) {
  const positions = new Float32Array(dataset.nodes.length * 3)
  const phases = new Float32Array(dataset.nodes.length)
  const sizes = new Float32Array(dataset.nodes.length)

  dataset.nodes.forEach((node, index) => {
    const spreadA = Math.sin(index * 12.9898) * 43758.5453
    const spreadB = Math.sin(index * 78.233) * 24634.6345
    const latJitter = (spreadA - Math.floor(spreadA) - 0.5) * 1.45
    const lonJitter = (spreadB - Math.floor(spreadB) - 0.5) * 2.2
    const vector = latLonToVector(
      THREE.MathUtils.clamp(node.lat + latJitter, -84, 84),
      node.lon + lonJitter,
      RADIUS + 0.04 + (spreadA - Math.floor(spreadA)) * 0.012,
    )
    positions[index * 3] = vector.x
    positions[index * 3 + 1] = vector.y
    positions[index * 3 + 2] = vector.z
    phases[index] = Math.random() * Math.PI * 2
    sizes[index] = node.kind === 'ipv6' ? 0.9 : 0.72
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1))
  geometry.setAttribute('nodeSize', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: GOLD },
    },
    vertexShader: `
      attribute float phase;
      attribute float nodeSize;
      uniform float uTime;
      varying float vPulse;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float wave = 0.5 + 0.5 * sin(uTime * 2.4 + phase);
        float shimmer = 0.5 + 0.5 * sin(uTime * 0.73 + phase * 1.91);
        vPulse = 0.58 + wave * 0.32 + shimmer * 0.16;
        gl_PointSize = nodeSize * (1.75 + 2.4 * vPulse) * (92.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vPulse;

      void main() {
        vec2 center = gl_PointCoord - vec2(0.5);
        float distanceFromCenter = length(center);
        float core = smoothstep(0.1, 0.0, distanceFromCenter);
        float halo = smoothstep(0.36, 0.0, distanceFromCenter) * 0.18;
        float alpha = (core + halo) * vPulse;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  })

  return new THREE.Points(geometry, material)
}

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function longitudeDistance(a: number, b: number) {
  const distance = Math.abs(a - b) % 360
  return distance > 180 ? 360 - distance : distance
}

function pickArcTarget(
  prominent: NodeDataset['nodes'],
  startIndex: number,
  generation: number,
  arcIndex: number,
) {
  const start = prominent[startIndex]
  let fallbackIndex = (startIndex + 37 + generation * 11 + arcIndex * 5) % prominent.length

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const offset = 9 + Math.floor(seededRandom(generation * 151 + arcIndex * 31 + attempt * 17) * (prominent.length - 10))
    const candidateIndex = (startIndex + offset) % prominent.length
    const candidate = prominent[candidateIndex]
    const latGap = Math.abs(start.lat - candidate.lat)
    const lonGap = longitudeDistance(start.lon, candidate.lon)

    if (lonGap > 28 && lonGap < 155 && latGap < 85) {
      return candidateIndex
    }

    fallbackIndex = candidateIndex
  }

  return fallbackIndex
}

function createNetworkArcs(dataset: NodeDataset, generation = 0) {
  const geometry = new THREE.BufferGeometry()
  const positions: number[] = []
  const progress: number[] = []
  const seeds: number[] = []
  const prominent = dataset.nodes
    .filter((node) => Math.abs(node.lat) < 72)
    .slice(0, 360)

  for (let arcIndex = 0; arcIndex < ARC_COUNT; arcIndex += 1) {
    const startIndex = Math.floor(
      seededRandom(generation * 97 + arcIndex * 23 + 3) * prominent.length,
    )
    const endIndex = pickArcTarget(prominent, startIndex, generation, arcIndex)
    const startNode = prominent[startIndex]
    const endNode = prominent[endIndex]
    const start = latLonToVector(startNode.lat, startNode.lon, RADIUS + 0.07)
    const end = latLonToVector(endNode.lat, endNode.lon, RADIUS + 0.07)
    const distanceBoost = THREE.MathUtils.clamp(longitudeDistance(startNode.lon, endNode.lon) / 140, 0.35, 1.0)
    const midpoint = start
      .clone()
      .add(end)
      .normalize()
      .multiplyScalar(RADIUS + 0.42 + distanceBoost * 0.42)
    const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end)
    const points = curve.getPoints(24)
    const seed = seededRandom(generation * 211 + arcIndex * 91.17)

    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const a = points[pointIndex - 1]
      const b = points[pointIndex]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      progress.push((pointIndex - 1) / (points.length - 1), pointIndex / (points.length - 1))
      seeds.push(seed, seed)
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('arcProgress', new THREE.Float32BufferAttribute(progress, 1))
  geometry.setAttribute('arcSeed', new THREE.Float32BufferAttribute(seeds, 1))

  return new THREE.LineSegments(
    geometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uLayerOpacity: { value: 0 },
        uBaseColor: { value: new THREE.Color('#27cfff') },
        uFlowColor: { value: new THREE.Color('#ffe083') },
      },
      vertexShader: `
        attribute float arcProgress;
        attribute float arcSeed;
        varying float vProgress;
        varying float vSeed;

        void main() {
          vProgress = arcProgress;
          vSeed = arcSeed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uLayerOpacity;
        uniform vec3 uBaseColor;
        uniform vec3 uFlowColor;
        varying float vProgress;
        varying float vSeed;

        void main() {
          float flow = fract(vProgress - uTime * 0.38 + vSeed);
          float head = smoothstep(0.015, 0.075, flow) * smoothstep(0.24, 0.075, flow);
          float tail = smoothstep(0.0, 0.18, flow) * smoothstep(0.48, 0.18, flow) * 0.32;
          float shimmer = 0.5 + 0.5 * sin(uTime * 4.0 + vSeed * 18.0);
          float energy = clamp(head + tail, 0.0, 1.0);
          vec3 color = mix(uBaseColor, uFlowColor, energy);
          float alpha = (0.13 + energy * (0.74 + shimmer * 0.18)) * uLayerOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    }),
  )
}

function disposeObjectMaterial(object: THREE.Mesh | THREE.Points | THREE.LineSegments) {
  object.geometry.dispose()
  const material = object.material
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose())
  } else {
    material.dispose()
  }
}

export function BitcoinGlobe({ dataset }: BitcoinGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  const reducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  )

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100)
    camera.position.set(0, 0.28, 7.25)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const root = new THREE.Group()
    root.rotation.set(0.34, -1.18, 0.04)
    scene.add(root)

    scene.add(createStarField())

    const earthTexture = createEarthTexture()
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 96, 96),
      new THREE.MeshStandardMaterial({
        map: earthTexture ?? undefined,
        color: '#07224d',
        roughness: 0.9,
        metalness: 0.08,
        transparent: true,
        opacity: 0.92,
      }),
    )
    root.add(earth)
    root.add(createLandLines())

    const ambient = new THREE.AmbientLight('#66cfff', 1.4)
    const key = new THREE.DirectionalLight('#f3fbff', 2.1)
    key.position.set(3, 2.2, 4)
    const goldFill = new THREE.PointLight('#ffb32a', 3.2, 8)
    goldFill.position.set(-2, -1, 3)
    scene.add(ambient, key, goldFill)

    const nodePoints = dataset ? createNodePoints(dataset) : null
    const arcLayers: ArcLayer[] = []
    let arcGeneration = 0
    let lastArcGenerationAt = 0

    const addArcLayer = (elapsed: number) => {
      if (!dataset) return
      const lines = createNetworkArcs(dataset, arcGeneration)
      arcGeneration += 1
      const layer: ArcLayer = {
        lines,
        createdAt: elapsed,
        fadingOutAt: null,
      }
      arcLayers.forEach((existingLayer) => {
        existingLayer.fadingOutAt = existingLayer.fadingOutAt ?? elapsed
      })
      arcLayers.push(layer)
      root.add(lines)
    }

    if (dataset) {
      addArcLayer(0)
    }

    if (nodePoints) {
      root.add(nodePoints)
    }

    let dragging = false
    let lastX = 0
    let lastY = 0
    let velocityX = 0.00036
    let velocityY = 0

    const onPointerDown = (event: PointerEvent) => {
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      root.rotation.y += dx * 0.006
      root.rotation.x += dy * 0.004
      root.rotation.x = THREE.MathUtils.clamp(root.rotation.x, -0.85, 0.85)
      velocityX = dx * 0.0004
      velocityY = dy * 0.00025
      lastX = event.clientX
      lastY = event.clientY
    }
    const onPointerUp = () => {
      dragging = false
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.002, 5.4, 9.2)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    const resize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    let frameId = 0
    const startTime = performance.now()

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000

      if (!reducedMotion) {
        root.rotation.y += dragging ? 0 : velocityX
        root.rotation.x += dragging ? 0 : velocityY
        velocityX = THREE.MathUtils.lerp(velocityX, 0.00036, 0.01)
        velocityY *= 0.96
      }

      if (nodePoints?.material instanceof THREE.ShaderMaterial) {
        nodePoints.material.uniforms.uTime.value = elapsed
      }

      if (!reducedMotion && dataset && elapsed - lastArcGenerationAt > ARC_LAYER_INTERVAL) {
        lastArcGenerationAt = elapsed
        addArcLayer(elapsed)
      }

      for (let index = arcLayers.length - 1; index >= 0; index -= 1) {
        const layer = arcLayers[index]
        const material = layer.lines.material
        material.uniforms.uTime.value = elapsed

        const fadeIn = THREE.MathUtils.clamp((elapsed - layer.createdAt) / ARC_FADE_SECONDS, 0, 1)
        const fadeOut =
          layer.fadingOutAt === null
            ? 1
            : 1 - THREE.MathUtils.clamp((elapsed - layer.fadingOutAt) / ARC_FADE_SECONDS, 0, 1)
        material.uniforms.uLayerOpacity.value = fadeIn * fadeOut

        if (layer.fadingOutAt !== null && elapsed - layer.fadingOutAt > ARC_FADE_SECONDS) {
          root.remove(layer.lines)
          disposeObjectMaterial(layer.lines)
          arcLayers.splice(index, 1)
        }
      }

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      mount.removeChild(renderer.domElement)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
          disposeObjectMaterial(object)
        }
      })
      renderer.dispose()
      earthTexture?.dispose()
    }
  }, [dataset, reducedMotion])

  return <div ref={mountRef} className="globe-stage" aria-label="Interactive Bitcoin reachable node globe" />
}
