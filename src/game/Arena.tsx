import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr } from '@react-three/drei'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, MathUtils, PCFShadowMap, Raycaster, RepeatWrapping, SRGBColorSpace, Vector2, Vector3 } from 'three'
import type { Group, Mesh, PointLight } from 'three'
import { arenaColliders, isBlocked, movePlayer } from './physics'
import { createMagazines, getWeapon, type WeaponName, WEAPONS } from './weapons'
import '../App.css'

export type GameMode = 'TRAINING' | 'PRACTICE' | 'CASUAL' | 'COMPETITIVE' | 'DEATHMATCH'
type HudState = {
  health: number
  ammo: number
  reserve: number
  weapon: WeaponName
  time: number
  kills: number
  enemies: number
  bombPlanted: boolean
  result: string
  notice: string
}

const initialHud: HudState = {
  health: 100, ammo: WEAPONS['VXR-9 CARBINE'].magazine, reserve: WEAPONS['VXR-9 CARBINE'].reserve, weapon: 'VXR-9 CARBINE',
  time: 180, kills: 0, enemies: 4, bombPlanted: false, result: '', notice: '',
}

function makeSurfaceTexture(base: string, seed: number, paving = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the arena surface texture.')
  context.fillStyle = base
  context.fillRect(0, 0, canvas.width, canvas.height)

  let state = seed
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  if (paving) {
    const stoneColors = ['#777873', '#74756f', '#83837b', '#6e716c', '#898980']
    const rows = 9
    const columns = 8
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const offset = row % 2 ? 31 : 0
        const x = column * 66 - 30 + offset
        const y = row * 57
        context.fillStyle = stoneColors[Math.floor(random() * stoneColors.length)]
        context.fillRect(x + 2, y + 2, 62 + random() * 2, 53 + random() * 2)
        context.strokeStyle = '#555850'
        context.lineWidth = 0.65
        context.strokeRect(x + 2, y + 2, 62, 53)
      }
    }
    for (let i = 0; i < 80; i += 1) {
      const x = random() * 512
      const y = random() * 512
      const radius = 8 + random() * 34
      const stain = context.createRadialGradient(x, y, 0, x, y, radius)
      stain.addColorStop(0, `rgba(27,30,27,${0.04 + random() * 0.08})`)
      stain.addColorStop(1, 'rgba(27,30,27,0)')
      context.fillStyle = stain
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
  }
  for (let i = 0; i < 9500; i += 1) {
    const light = random() > 0.5
    const alpha = 0.025 + random() * 0.11
    context.fillStyle = light ? `rgba(224,215,192,${alpha})` : `rgba(25,28,26,${alpha})`
    const size = random() > 0.97 ? 2 : 1
    context.fillRect(random() * 512, random() * 512, size, size)
  }
  if (!paving) {
    for (let i = 0; i < 34; i += 1) {
      const x = random() * 512
      const y = random() * 512
      context.strokeStyle = `rgba(39,37,32,${0.08 + random() * 0.12})`
      context.lineWidth = 1 + random() * 2
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(x + (random() - 0.5) * 55, y + 8 + random() * 28)
      context.stroke()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(paving ? 5 : 2, paving ? 4 : 2)
  texture.anisotropy = 4
  return texture
}

function makeSkyTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the arena sky texture.')
  const gradient = context.createLinearGradient(0, 0, 0, 512)
  gradient.addColorStop(0, '#52778c')
  gradient.addColorStop(0.55, '#9eb6c1')
  gradient.addColorStop(1, '#d7cdb6')
  context.fillStyle = gradient
  context.fillRect(0, 0, 1024, 512)

  let state = 9031
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  for (let cloud = 0; cloud < 55; cloud += 1) {
    const x = random() * 1100 - 40
    const y = 30 + random() * 245
    const width = 32 + random() * 120
    const height = 8 + random() * 28
    const mist = context.createRadialGradient(x, y, 0, x, y, width)
    mist.addColorStop(0, `rgba(246,244,232,${0.05 + random() * 0.12})`)
    mist.addColorStop(1, 'rgba(246,244,232,0)')
    context.fillStyle = mist
    context.fillRect(x - width, y - height, width * 2, height * 2)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function Building({ position, size, color, roof = '#3a4541', texture }: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  roof?: string
  texture: CanvasTexture
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial map={texture} color={color} roughness={0.96} bumpMap={texture} bumpScale={0.035} />
      </mesh>
      <mesh position={[0, size[1] + 0.08, 0]} castShadow>
        <boxGeometry args={[size[0] + 0.35, 0.16, size[2] + 0.35]} />
        <meshStandardMaterial color={roof} roughness={0.82} />
      </mesh>
      {[1, -1].map((face) => (
        <group key={`z-${face}`} position={[0, 0, face * (size[2] / 2 + 0.025)]} rotation={[0, face < 0 ? Math.PI : 0, 0]}>
          <WindowBank width={size[0]} height={size[1]} />
          <mesh position={[0, 1.08, 0.07]} castShadow>
            <boxGeometry args={[1.2, 2.12, 0.13]} />
            <meshStandardMaterial color="#514837" roughness={0.86} />
          </mesh>
          <mesh position={[0.37, 1.08, 0.15]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#c6a65f" metalness={0.5} roughness={0.35} />
          </mesh>
        </group>
      ))}
      {[1, -1].map((face) => (
        <group key={`x-${face}`} position={[face * (size[0] / 2 + 0.025), 0, 0]} rotation={[0, face * Math.PI / 2, 0]}>
          <WindowBank width={size[2]} height={size[1]} />
        </group>
      ))}
      <mesh position={[-size[0] / 2 + 0.15, size[1] / 2, size[2] / 2 + 0.09]}>
        <cylinderGeometry args={[0.055, 0.055, size[1], 8]} />
        <meshStandardMaterial color="#4d5048" metalness={0.4} roughness={0.55} />
      </mesh>
      <mesh position={[size[0] / 2 - 0.15, size[1] / 2, size[2] / 2 + 0.09]}>
        <cylinderGeometry args={[0.055, 0.055, size[1], 8]} />
        <meshStandardMaterial color="#4d5048" metalness={0.4} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.22, size[2] / 2 + 0.025]}>
        <boxGeometry args={[size[0] * 0.88, 0.16, 0.07]} />
        <meshStandardMaterial color="#726650" roughness={0.92} />
      </mesh>
    </group>
  )
}

function Crate({ position, size = [2, 1.7, 2] as [number, number, number], color = '#756b56' }: {
  position: [number, number, number]
  size?: [number, number, number]
  color?: string
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      {Array.from({ length: 4 }, (_, index) => (
        <mesh key={index} castShadow position={[0, (index + 0.5) * size[1] / 4, size[2] / 2 + 0.012]}>
          <boxGeometry args={[size[0] * 0.92, 0.07, 0.035]} />
          <meshStandardMaterial color="#a09272" roughness={0.78} />
        </mesh>
      ))}
    </group>
  )
}

function makeFreightSign() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the freight sign texture.')
  context.fillStyle = '#202927'
  context.fillRect(0, 0, 512, 128)
  context.fillStyle = '#c6f36a'
  context.fillRect(18, 19, 5, 90)
  context.fillStyle = '#e8e4d7'
  context.font = 'bold 42px Arial'
  context.fillText('ARDENT FREIGHT', 42, 63)
  context.fillStyle = '#b7c0b9'
  context.font = '18px Arial'
  context.fillText('EASTERN DEPOT  ·  GATE 07', 44, 94)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function DeliveryVan({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 1.05, 0]}>
        <boxGeometry args={[2.15, 1.55, 4.2]} />
        <meshStandardMaterial color="#626d61" roughness={0.78} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[0, 1.68, 1.05]}>
        <boxGeometry args={[2.06, 0.82, 2.05]} />
        <meshStandardMaterial color="#687468" roughness={0.76} metalness={0.12} />
      </mesh>
      <mesh position={[0, 1.78, 2.09]}>
        <boxGeometry args={[1.72, 0.54, 0.035]} />
        <meshStandardMaterial color="#344542" metalness={0.2} roughness={0.24} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 1.085, 1.62, 1.05]}>
            <boxGeometry args={[0.035, 0.5, 0.75]} />
            <meshStandardMaterial color="#3a4b49" metalness={0.2} roughness={0.25} />
          </mesh>
          {[ -1.35, 1.35 ].map((z) => (
            <group key={z} position={[side * 1.06, 0.43, z]} rotation={[0, 0, Math.PI / 2]}>
              <mesh castShadow><cylinderGeometry args={[0.34, 0.34, 0.18, 12]} /><meshStandardMaterial color="#252a29" roughness={0.96} /></mesh>
              <mesh position={[0, side * 0.1, 0]}><cylinderGeometry args={[0.17, 0.17, 0.035, 10]} /><meshStandardMaterial color="#929188" metalness={0.56} roughness={0.4} /></mesh>
            </group>
          ))}
          <mesh position={[side * 0.73, 0.93, 2.12]}>
            <boxGeometry args={[0.36, 0.2, 0.035]} />
            <meshStandardMaterial color="#e8c986" emissive="#b88943" emissiveIntensity={0.25} roughness={0.48} />
          </mesh>
        </group>
      ))}
      <mesh castShadow position={[0, 0.62, 2.14]}>
        <boxGeometry args={[1.9, 0.18, 0.22]} />
        <meshStandardMaterial color="#414641" metalness={0.32} roughness={0.54} />
      </mesh>
      <mesh position={[0, 1.05, -2.12]}>
        <boxGeometry args={[1.55, 0.86, 0.03]} />
        <meshStandardMaterial color="#49544b" roughness={0.86} />
      </mesh>
    </group>
  )
}

function SiteMark({ position, color, label }: { position: [number, number, number]; color: string; label: string }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[2.8, 2.94, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.74} />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <boxGeometry args={[0.22, 2.6, 0.22]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} />
      </mesh>
      <mesh position={[0, 2.65, 0]}>
        <boxGeometry args={[1.15, 0.32, 0.22]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} />
      </mesh>
      <pointLight color={color} intensity={4} distance={7} position={[0, 1, 0]} />
      <group position={[0, 3.05, 0]}>
        <mesh>
          <planeGeometry args={[0.7, 0.35]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
      <group userData={{ label }} />
    </group>
  )
}

function WindowBank({ width, height }: { width: number; height: number }) {
  const columns = Math.max(2, Math.min(12, Math.floor(width / 4.8)))
  const rows = Math.max(1, Math.min(3, Math.floor((height - 0.5) / 2.7)))
  return (
    <group>
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        const x = (column - (columns - 1) / 2) * (width / (columns + 0.35))
        if (row === 0 && Math.abs(x) < 0.8) return null
        const y = Math.min(1.7 + row * 2.45, height - 0.9)
        return (
          <group key={index} position={[x, y, 0]}>
            <mesh castShadow><boxGeometry args={[1.06, 1.42, 0.11]} /><meshStandardMaterial color="#b4a78d" roughness={0.9} /></mesh>
            <mesh position={[0, 0.015, 0.065]}><boxGeometry args={[0.83, 1.16, 0.035]} /><meshStandardMaterial color="#263434" metalness={0.34} roughness={0.28} emissive="#172321" emissiveIntensity={0.2} /></mesh>
            <mesh position={[0, 0, 0.09]}><boxGeometry args={[0.045, 1.15, 0.025]} /><meshStandardMaterial color="#8c806c" roughness={0.75} /></mesh>
            <mesh position={[0, 0, 0.09]}><boxGeometry args={[0.82, 0.045, 0.025]} /><meshStandardMaterial color="#8c806c" roughness={0.75} /></mesh>
            <mesh position={[0, -0.72, 0.12]}><boxGeometry args={[1.2, 0.12, 0.22]} /><meshStandardMaterial color="#8e806b" roughness={0.86} /></mesh>
          </group>
        )
      })}
    </group>
  )
}

function StreetLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 3, 0]} castShadow><cylinderGeometry args={[0.075, 0.12, 6, 8]} /><meshStandardMaterial color="#343b38" metalness={0.7} roughness={0.42} /></mesh>
      <mesh position={[0.58, 5.8, 0]} rotation={[0, 0, -0.22]} castShadow><cylinderGeometry args={[0.045, 0.055, 1.3, 8]} /><meshStandardMaterial color="#343b38" metalness={0.72} roughness={0.4} /></mesh>
      <mesh position={[1.13, 5.72, 0]} castShadow><boxGeometry args={[0.52, 0.2, 0.38]} /><meshStandardMaterial color="#343b38" metalness={0.55} roughness={0.38} /></mesh>
      <mesh position={[1.13, 5.6, 0]}><boxGeometry args={[0.39, 0.025, 0.28]} /><meshStandardMaterial color="#efd9a8" emissive="#f2c87b" emissiveIntensity={1.6} /></mesh>
      <pointLight position={[1.13, 5.45, 0]} color="#ffca7c" intensity={1.6} distance={11} />
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.35, 0.4, 0.24, 8]} /><meshStandardMaterial color="#505149" roughness={0.9} /></mesh>
    </group>
  )
}

function PalmTree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.4, 0]} rotation={[0.02, 0, -0.07]} castShadow>
        <cylinderGeometry args={[0.2, 0.34, 4.8, 8]} />
        <meshStandardMaterial color="#68533b" roughness={0.96} />
      </mesh>
      {Array.from({ length: 7 }, (_, index) => (
        <group key={index} position={[0, 4.55, 0]} rotation={[0, index * Math.PI * 2 / 7, 0]}>
          <mesh position={[0, -0.42, -0.95]} rotation={[-0.74, 0, 0.12]} castShadow>
            <capsuleGeometry args={[0.12, 1.85, 3, 5]} />
            <meshStandardMaterial color={index % 2 ? '#65764c' : '#71804e'} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.85, -1.7]} rotation={[-0.75, 0, 0.1]}>
            <coneGeometry args={[0.13, 0.9, 5]} />
            <meshStandardMaterial color="#536943" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const Map = memo(function Map() {
  const streetTexture = useMemo(() => makeSurfaceTexture('#77766f', 1291, true), [])
  streetTexture.repeat.set(0.75, 2)
  const asphaltTexture = useMemo(() => makeSurfaceTexture('#626660', 2831), [])
  const wallTexture = useMemo(() => makeSurfaceTexture('#8c8777', 714, false), [])
  const signTexture = useMemo(makeFreightSign, [])
  useEffect(() => () => {
    streetTexture.dispose()
    asphaltTexture.dispose()
    wallTexture.dispose()
    signTexture.dispose()
  }, [streetTexture, asphaltTexture, wallTexture, signTexture])
  const crates = useMemo(() => arenaColliders.map((block) => {
    const sideBuilding = Math.abs(block.x) === 19 || Math.abs(block.x) === 21
    const wall = Math.abs(block.x) === 23
    return {
      p: [block.x, 0, block.z] as [number, number, number],
      s: [block.w * 0.94, wall || sideBuilding ? 4.4 : 1.7, block.d * 0.9] as [number, number, number],
      c: wall || sideBuilding ? '#817965' : '#756b56',
    }
  }), [])
  return (
    <group>
      <hemisphereLight args={['#c7dce8', '#55584d', 2]} />
      <ambientLight intensity={0.88} />
      <directionalLight castShadow position={[-20, 32, 15]} intensity={2.2} color="#ffe7c0" shadow-mapSize={[2048, 2048]} shadow-camera-left={-34} shadow-camera-right={34} shadow-camera-top={28} shadow-camera-bottom={-28} />
      <directionalLight position={[8, 11, 18]} intensity={1.6} color="#dce8ed" />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]}>
        <planeGeometry args={[58, 38]} />
        <meshStandardMaterial map={asphaltTexture} bumpMap={asphaltTexture} bumpScale={0.025} color="#d2d3c9" roughness={0.97} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`walk-${side}`} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[side * 21.35, -0.025, 0]}>
          <planeGeometry args={[5.1, 37.5]} />
          <meshStandardMaterial map={streetTexture} bumpMap={streetTexture} bumpScale={0.018} color="#bdbbad" roughness={0.94} />
        </mesh>
      ))}
      {Array.from({ length: 10 }, (_, index) => (
        <mesh key={`lane-${index}`} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.078, -16 + index * 3.5]}>
          <planeGeometry args={[0.14, 1.35]} />
          <meshBasicMaterial color="#c6b577" transparent opacity={0.58} />
        </mesh>
      ))}
      <Building position={[-26.7, 0, 0]} size={[5.5, 7, 38]} color="#a69a80" texture={wallTexture} />
      <Building position={[26.7, 0, 0]} size={[5.5, 8.5, 38]} color="#a99d84" roof="#544f43" texture={wallTexture} />
      <Building position={[0, 0, -20.6]} size={[58, 7, 4.5]} color="#a2967d" texture={wallTexture} />
      <Building position={[0, 0, 20.6]} size={[58, 6, 4.5]} color="#93866e" texture={wallTexture} />
      <Building position={[-19, 0, -14]} size={[13, 4.8, 8]} color="#b0a083" texture={wallTexture} />
      <Building position={[19, 0, -14]} size={[13, 5.7, 8]} color="#a49477" texture={wallTexture} />
      <Building position={[-21, 0, 14]} size={[9, 4.2, 6]} color="#a3957a" texture={wallTexture} />
      <Building position={[21, 0, 14]} size={[9, 4.8, 6]} color="#a59679" texture={wallTexture} />
      <mesh position={[0, 1.32, -18.2]} castShadow>
        <boxGeometry args={[1.8, 2.64, 0.18]} />
        <meshStandardMaterial color="#343c39" metalness={0.22} roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.38, -18.08]}>
        <boxGeometry args={[1.42, 2.26, 0.025]} />
        <meshStandardMaterial color="#46534e" metalness={0.24} roughness={0.26} />
      </mesh>
      <mesh position={[0, 3.18, -17.9]} castShadow>
        <boxGeometry args={[5.2, 0.22, 0.9]} />
        <meshStandardMaterial color="#424844" metalness={0.46} roughness={0.55} />
      </mesh>
      <mesh position={[0, 4.15, -18.22]} castShadow>
        <planeGeometry args={[6.8, 1.7]} />
        <meshStandardMaterial map={signTexture} emissive="#16211b" emissiveIntensity={0.25} roughness={0.74} />
      </mesh>
      {crates.slice(0, 8).map((item, index) => <Crate key={index} position={item.p} size={item.s} color={item.c} />)}
      <Crate position={[-12, 0, -11]} size={[2.2, 1.5, 1.8]} color="#8b7654" />
      <Crate position={[12, 0, -11]} size={[2.2, 1.5, 1.8]} color="#8b7654" />
      <Crate position={[-12, 0, 4]} size={[2.3, 1.3, 2.2]} color="#5e6254" />
      <Crate position={[12, 0, 4]} size={[2.3, 1.3, 2.2]} color="#5e6254" />
      <DeliveryVan position={[14.5, 0, 2]} />
      <PalmTree position={[-21.5, 0, -5]} />
      <PalmTree position={[21.5, 0, -1]} />
      <StreetLamp position={[-15, 0, 5]} />
      <StreetLamp position={[15, 0, 5]} />
      <SiteMark position={[-10, 0, -11]} color="#c6f36a" label="A" />
      <SiteMark position={[10, 0, -11]} color="#e78c68" label="B" />
      <group position={[4.5, 0.55, 12.5]}>
        <mesh castShadow receiveShadow><cylinderGeometry args={[0.5, 0.6, 1.1, 12]} /><meshStandardMaterial color="#424944" metalness={0.28} roughness={0.74} /></mesh>
        <mesh castShadow position={[0, 0.58, 0]}><cylinderGeometry args={[0.53, 0.5, 0.08, 12]} /><meshStandardMaterial color="#29312e" metalness={0.4} roughness={0.55} /></mesh>
        <mesh position={[0, 0.64, 0]}><cylinderGeometry args={[0.22, 0.22, 0.025, 10]} /><meshStandardMaterial color="#aa8960" roughness={0.88} /></mesh>
        <pointLight position={[0, 0.8, 0]} color="#e78c68" intensity={0.45} distance={3} />
      </group>
      <mesh position={[7, -0.078, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.6, 1.1]} />
        <meshStandardMaterial color="#4d504a" roughness={0.92} />
      </mesh>
    </group>
  )
})

type BotState = { position: Vector3; health: number; alive: boolean; attackAt: number; firingUntil: number; mesh: Group | null }
const spawnPoints: [number, number, number][] = [[-16, 0, -6], [16, 0, -6], [-8, 0, -13], [8, 0, -13]]
const SITE_A = new Vector3(-10, 0, -11)
const SITE_B = new Vector3(10, 0, -11)

function hasLineOfSight(fromX: number, fromZ: number, toX: number, toZ: number) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ)
  const steps = Math.ceil(distance * 2)
  for (let step = 1; step < steps; step += 1) {
    const progress = step / steps
    if (isBlocked(fromX + (toX - fromX) * progress, fromZ + (toZ - fromZ) * progress)) return false
  }
  return true
}

const BotModel = memo(function BotModel({ bot, index }: { bot: BotState; index: number }) {
  const group = useRef<Group>(null)
  const muzzle = useRef<PointLight>(null)
  const tracer = useRef<Mesh>(null)
  useEffect(() => {
    bot.mesh = group.current
    return () => { bot.mesh = null }
  }, [bot])
  useFrame(() => {
    if (!group.current) return
    group.current.position.copy(bot.position)
    group.current.visible = bot.alive
    const firing = bot.firingUntil > performance.now()
    if (muzzle.current) muzzle.current.intensity = firing ? 5 : 0
    if (tracer.current) tracer.current.visible = firing
  })
  return (
    <group ref={group} position={bot.position} visible={bot.alive} castShadow userData={{ botState: bot }}>
      <mesh castShadow position={[0, 1.02, 0]} userData={{ botState: bot }}>
        <capsuleGeometry args={[0.36, 0.9, 5, 8]} />
        <meshStandardMaterial color={index % 2 ? '#495954' : '#59634b'} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 1.18, 0.21]}>
        <boxGeometry args={[0.55, 0.7, 0.24]} />
        <meshStandardMaterial color={index % 2 ? '#4d5b50' : '#697153'} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 1.18, 0.34]}>
        <boxGeometry args={[0.37, 0.45, 0.055]} />
        <meshStandardMaterial color="#353c35" metalness={0.16} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.78, 0.27]}>
        <boxGeometry args={[0.62, 0.16, 0.29]} />
        <meshStandardMaterial color="#313934" roughness={0.78} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh castShadow position={[side * 0.36, 1.39, 0.01]}>
            <sphereGeometry args={[0.19, 10, 8]} />
            <meshStandardMaterial color="#68705b" roughness={0.88} />
          </mesh>
          <mesh castShadow position={[side * 0.16, 0.42, 0.03]}>
            <capsuleGeometry args={[0.16, 0.4, 4, 6]} />
            <meshStandardMaterial color="#3a433b" roughness={0.9} />
          </mesh>
          <mesh castShadow position={[side * 0.16, 0.14, 0.11]}>
            <boxGeometry args={[0.28, 0.18, 0.44]} />
            <meshStandardMaterial color="#222824" roughness={0.82} />
          </mesh>
          <mesh castShadow position={[side * 0.39, 1.05, 0.05]} rotation={[0.1, 0, -side * 0.08]}>
            <capsuleGeometry args={[0.12, 0.35, 4, 6]} />
            <meshStandardMaterial color="#535d4d" roughness={0.86} />
          </mesh>
          <mesh position={[side * 0.16, 0.91, 0.39]}>
            <boxGeometry args={[0.13, 0.2, 0.08]} />
            <meshStandardMaterial color="#a67745" roughness={0.76} />
          </mesh>
        </group>
      ))}
      <mesh castShadow position={[0, 1.78, 0]} userData={{ botState: bot }}>
        <sphereGeometry args={[0.25, 12, 10]} />
        <meshStandardMaterial color="#c2ab8b" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 1.98, 0]}>
        <sphereGeometry args={[0.27, 12, 8]} />
        <meshStandardMaterial color="#444c42" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.81, 0.22]}>
        <boxGeometry args={[0.31, 0.09, 0.055]} />
        <meshStandardMaterial color="#242d2a" metalness={0.42} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 1.85, 0.11]}>
        <boxGeometry args={[0.34, 0.1, 0.25]} />
        <meshStandardMaterial color="#222b28" metalness={0.25} />
      </mesh>
      <mesh castShadow position={[0.04, 1.42, -0.28]}>
        <boxGeometry args={[0.42, 0.52, 0.2]} />
        <meshStandardMaterial color="#343c36" roughness={0.92} />
      </mesh>
      <mesh castShadow position={[0.38, 1.15, 0.3]} rotation={[0.04, 0, -0.1]}>
        <boxGeometry args={[0.13, 0.12, 0.74]} />
        <meshStandardMaterial color="#242927" metalness={0.55} roughness={0.45} />
      </mesh>
      <group position={[0.37, 1.15, 0.58]}>
        <mesh castShadow><boxGeometry args={[0.1, 0.12, 0.58]} /><meshStandardMaterial color="#202725" metalness={0.72} roughness={0.32} /></mesh>
        <mesh castShadow position={[0, -0.14, -0.19]}><boxGeometry args={[0.11, 0.25, 0.18]} /><meshStandardMaterial color="#262e2a" roughness={0.77} /></mesh>
        <mesh castShadow position={[0, 0.12, -0.12]}><boxGeometry args={[0.08, 0.07, 0.27]} /><meshStandardMaterial color="#151b1a" metalness={0.55} roughness={0.35} /></mesh>
        <mesh ref={tracer} visible={false} position={[0, 0, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.72, 5]} />
          <meshBasicMaterial color="#ffc86d" transparent opacity={0.8} />
        </mesh>
        <pointLight ref={muzzle} position={[0, 0, 0.78]} color="#ffb951" intensity={0} distance={3} />
      </group>
      <mesh position={[0.22, 1.44, 0.17]}>
        <boxGeometry args={[0.055, 0.36, 0.045]} />
        <meshStandardMaterial color="#a9a078" roughness={0.9} />
      </mesh>
    </group>
  )
})

function PlayerWeapon({ weaponName, skin, recoil, muzzleFlash }: {
  weaponName: WeaponName
  skin: string
  recoil: React.MutableRefObject<number>
  muzzleFlash: React.MutableRefObject<number>
}) {
  const weapon = useRef<Group>(null)
  const flash = useRef<PointLight>(null)
  const { camera } = useThree()
  const weaponClass = getWeapon(weaponName).class
  const pistol = weaponClass === 'pistol'
  const shotgun = weaponClass === 'shotgun'
  const finishColor = skin === 'Signal Ember' ? '#b86547' : skin === 'Night Circuit' ? '#c6f36a' : '#667256'
  useFrame((_, delta) => {
    if (weapon.current) {
      weapon.current.position.copy(camera.position)
      weapon.current.quaternion.copy(camera.quaternion)
      weapon.current.scale.setScalar(0.68)
      weapon.current.translateX(0.45)
      weapon.current.translateY(-0.38 + Math.sin(performance.now() * 0.008) * 0.006)
      weapon.current.translateZ(-0.9 + recoil.current * 1.8)
    }
    if (flash.current) {
      flash.current.intensity = muzzleFlash.current > 0 ? 8 : 0
      muzzleFlash.current = Math.max(0, muzzleFlash.current - delta)
    }
  })
  return (
    <group ref={weapon} userData={{ viewModel: true }}>
      <mesh castShadow position={[0, 0, -0.04]}>
        <boxGeometry args={pistol ? [0.14, 0.14, 0.35] : shotgun ? [0.2, 0.19, 0.48] : weaponClass === 'smg' ? [0.18, 0.16, 0.3] : [0.18, 0.17, 0.4]} />
        <meshStandardMaterial color={finishColor} emissive="#171e18" emissiveIntensity={0.2} metalness={0.52} roughness={0.38} />
      </mesh>
      {!pistol && <>
        <mesh castShadow position={[0, -0.11, 0.15]} rotation={[0.16, 0, 0]}>
          <boxGeometry args={[0.13, shotgun ? 0.34 : 0.28, 0.17]} />
          <meshStandardMaterial color="#303934" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0, 0.115, -0.04]}>
          <boxGeometry args={[0.11, 0.07, shotgun ? 0.4 : weaponClass === 'smg' ? 0.34 : 0.56]} />
          <meshStandardMaterial color="#343d38" metalness={0.68} roughness={0.34} />
        </mesh>
        <mesh castShadow position={[0, -0.08, -0.32]}>
          <boxGeometry args={[0.12, 0.24, 0.16]} />
          <meshStandardMaterial color="#252e2a" metalness={0.24} roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0.03, -0.02, 0.26]}>
          <boxGeometry args={[0.13, 0.13, 0.32]} />
          <meshStandardMaterial color="#313a35" roughness={0.68} />
        </mesh>
      </>}
      <mesh castShadow position={[0, 0.02, -0.37]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.045, pistol ? 0.2 : shotgun ? 0.44 : 0.36, 10]} />
        <meshStandardMaterial color="#151b1a" metalness={0.86} roughness={0.26} />
      </mesh>
      <mesh castShadow position={[0, 0.16, -0.025]}>
        <boxGeometry args={[0.075, 0.1, 0.08]} />
        <meshStandardMaterial color="#151b1a" metalness={0.38} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.18, -0.025]}>
        <boxGeometry args={[0.018, 0.04, 0.07]} />
        <meshStandardMaterial color="#c6f36a" emissive="#6c8c3d" emissiveIntensity={0.35} />
      </mesh>
      {!pistol && <mesh castShadow position={[-0.17, -0.02, -0.12]} rotation={[0.2, 0, 0.2]}>
        <capsuleGeometry args={[0.1, 0.32, 4, 8]} />
        <meshStandardMaterial color="#39423c" roughness={0.92} />
      </mesh>}
      <mesh castShadow position={[0.02, -0.18, 0.04]}>
        <boxGeometry args={[0.12, pistol ? 0.2 : 0.24, 0.14]} />
        <meshStandardMaterial color="#303833" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[-0.08, -0.34, -0.1]} rotation={[1.2, 0.08, -0.6]}>
        <capsuleGeometry args={[0.075, 0.48, 4, 8]} />
        <meshStandardMaterial color="#343b34" roughness={0.94} />
      </mesh>
      <mesh castShadow position={[-0.07, -0.1, -0.24]} rotation={[0.35, 0.12, -0.42]}>
        <capsuleGeometry args={[0.075, 0.1, 4, 8]} />
        <meshStandardMaterial color="#292e2a" roughness={0.86} />
      </mesh>
      <pointLight position={[0, 0.18, 0.18]} color="#e2d6bb" intensity={0.42} distance={2.2} />
      <pointLight ref={flash} position={[0, 0.01, -0.59]} color="#ffca78" distance={3.5} intensity={0} />
    </group>
  )
}

function World({ hudRef, setHud, mode, restartId, sensitivity, weaponSkin }: {
  hudRef: React.MutableRefObject<HudState>
  setHud: (value: HudState) => void
  mode: GameMode
  restartId: number
  sensitivity: number
  weaponSkin: string
}) {
  const { camera, gl, scene } = useThree()
  const skyTexture = useMemo(() => makeSkyTexture(), [])
  const magazines = useRef(createMagazines())
  const activeWeapon = useRef<WeaponName>('VXR-9 CARBINE')
  const reloadWeapon = useRef<WeaponName>('VXR-9 CARBINE')
  const keys = useRef(new Set<string>())
  const bots = useRef<BotState[]>(spawnPoints.map((point) => ({
    position: new Vector3(...point), health: 100, alive: true, attackAt: 0, firingUntil: 0, mesh: null,
  })))
  const yaw = useRef(0)
  const pitch = useRef(0)
  const verticalSpeed = useRef(0)
  const lastShot = useRef(0)
  const reloadUntil = useRef(0)
  const lastHudUpdate = useRef(0)
  const lastPlantKey = useRef(false)
  const defuseStartedAt = useRef<number | null>(null)
  const plantedSite = useRef(SITE_B.clone())
  const bombSeconds = useRef(35)
  const elapsed = useRef(0)
  const mouseDown = useRef(false)
  const recoil = useRef(0)
  const muzzleFlash = useRef(0)
  const fireRef = useRef<() => void>(() => {})
  const hudRefLive = useRef(hudRef)
  hudRefLive.current = hudRef
  const setHudLive = useRef(setHud)
  setHudLive.current = setHud

  const publishHud = useCallback((patch: Partial<HudState>) => {
    const updated = { ...hudRefLive.current.current, ...patch }
    hudRefLive.current.current = updated
    setHudLive.current(updated)
  }, [])

  useEffect(() => {
    scene.background = skyTexture
    return () => {
      if (scene.background === skyTexture) scene.background = null
      skyTexture.dispose()
    }
  }, [scene, skyTexture])

  const reset = useCallback(() => {
    bots.current = spawnPoints.map((point) => ({ position: new Vector3(...point), health: 100, alive: true, attackAt: 0, firingUntil: 0, mesh: null }))
    magazines.current = createMagazines()
    activeWeapon.current = 'VXR-9 CARBINE'
    reloadWeapon.current = 'VXR-9 CARBINE'
    elapsed.current = 0
    bombSeconds.current = 35
    defuseStartedAt.current = null
    plantedSite.current.copy(SITE_B)
    lastPlantKey.current = false
    reloadUntil.current = 0
    mouseDown.current = false
    recoil.current = 0
    muzzleFlash.current = 0
    verticalSpeed.current = 0
    keys.current.clear()
    camera.position.set(0, 1.65, 14)
    yaw.current = 0
    pitch.current = 0
    publishHud({ ...initialHud, time: mode === 'TRAINING' ? 0 : 180 })
  }, [camera, mode, publishHud])

  useEffect(() => { reset() }, [restartId, reset])

  useEffect(() => {
    camera.position.set(0, 1.65, 14)
    const onLockChange = () => {
      if (document.pointerLockElement !== gl.domElement) mouseDown.current = false
    }
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      const mouseScale = (sensitivity / 45) * 0.0022
      yaw.current -= event.movementX * mouseScale
      pitch.current = MathUtils.clamp(pitch.current - event.movementY * mouseScale, -1.32, 1.32)
    }
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.target !== gl.domElement) return
      if (document.pointerLockElement !== gl.domElement) {
        void gl.domElement.requestPointerLock()
        return
      }
      mouseDown.current = true
    }
    const onMouseUp = (event: MouseEvent) => { if (event.button === 0) mouseDown.current = false }
    const onKeyDown = (event: KeyboardEvent) => {
      keys.current.add(event.code)
      if (event.code === 'Space') event.preventDefault()
      const weaponName = event.code === 'Digit1' ? 'VXR-9 CARBINE'
        : event.code === 'Digit2' ? 'KITE-12 SIDEARM'
          : event.code === 'Digit3' ? 'MTR-5 COMPACT'
            : event.code === 'Digit4' ? 'QUARRY-8 BREACHER'
              : undefined
      if (weaponName) {
        activeWeapon.current = weaponName
        reloadUntil.current = 0
        const magazine = magazines.current[weaponName]
        publishHud({ weapon: weaponName, ammo: magazine.ammo, reserve: magazine.reserve, notice: '' })
      }
      if (event.code === 'KeyR') {
        const name = activeWeapon.current
        const weapon = WEAPONS[name]
        const magazine = magazines.current[name]
        if (!reloadUntil.current && magazine.ammo < weapon.magazine && magazine.reserve > 0) {
          reloadWeapon.current = name
          reloadUntil.current = performance.now() + weapon.reload
          publishHud({ notice: 'RELOADING' })
        }
      }
    }
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.code)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock()
    }
  }, [camera, gl, publishHud, sensitivity])

  fireRef.current = () => {
    const current = hudRefLive.current.current
    const name = activeWeapon.current
    const weapon = WEAPONS[name]
    const magazine = magazines.current[name]
    const now = performance.now()
    if (current.result || now < reloadUntil.current || magazine.ammo <= 0) return
    if (now - lastShot.current < weapon.interval) return
    lastShot.current = now
    recoil.current = Math.min(recoil.current + (weapon.class === 'shotgun' ? 0.028 : 0.012), 0.065)
    muzzleFlash.current = weapon.class === 'shotgun' ? 0.11 : 0.065
    magazine.ammo -= 1
    const raycaster = new Raycaster()
    const targets = scene.children.filter((child) => child !== camera && !child.userData.viewModel)
    let hitCount = 0
    let kills = 0
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      const spread = weapon.spread + recoil.current * 0.05
      raycaster.setFromCamera(new Vector2((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread), camera)
      const firstHit = raycaster.intersectObjects(targets, true).find((hit) => hit.distance <= weapon.range)
      let hitObject = firstHit?.object
      let candidate: BotState | undefined
      while (hitObject && !candidate) {
        candidate = hitObject.userData.botState as BotState | undefined
        hitObject = hitObject.parent ?? undefined
      }
      if (!candidate?.alive) continue
      candidate.health -= weapon.damage
      hitCount += 1
      if (candidate.health <= 0) {
        candidate.alive = false
        kills += 1
      }
    }
    const ammo = magazine.ammo
    const alive = bots.current.filter((bot) => bot.alive).length
    const result = alive === 0 ? 'SECTOR SECURED' : ''
    publishHud({
      ammo, reserve: magazine.reserve, kills: current.kills + kills, enemies: alive, result,
      notice: kills ? 'TARGET NEUTRALIZED' : hitCount ? 'HIT CONFIRMED' : '',
    })
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const current = hudRefLive.current.current
    if (current.result || document.pointerLockElement !== gl.domElement) return
    elapsed.current += dt
    camera.rotation.order = 'YXZ'
    camera.rotation.set(pitch.current - recoil.current, yaw.current, 0, 'YXZ')
    recoil.current = Math.max(0, recoil.current - dt * 0.03)

    const forward = new Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current))
    const right = new Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current))
    const move = new Vector3()
    if (keys.current.has('KeyW')) move.add(forward)
    if (keys.current.has('KeyS')) move.sub(forward)
    if (keys.current.has('KeyD')) move.add(right)
    if (keys.current.has('KeyA')) move.sub(right)
    const crouching = keys.current.has('KeyC') || keys.current.has('ControlLeft')
    const speed = crouching ? 2.3 : keys.current.has('ShiftLeft') ? 7.3 : 4.8
    if (move.lengthSq()) {
      move.normalize().multiplyScalar(speed * dt)
      const position = movePlayer(camera.position.x, camera.position.z, move.x, move.z)
      camera.position.x = position.x
      camera.position.z = position.z
    }
    if (keys.current.has('Space') && camera.position.y <= (crouching ? 1.16 : 1.68) + 0.04) verticalSpeed.current = 5.1
    verticalSpeed.current -= 13.5 * dt
    camera.position.y += verticalSpeed.current * dt
    const baseHeight = crouching ? 1.18 : 1.65
    if (camera.position.y < baseHeight) { camera.position.y = baseHeight; verticalSpeed.current = 0 }

    const now = performance.now()
    if (reloadUntil.current && now >= reloadUntil.current) {
      const name = reloadWeapon.current
      const weapon = WEAPONS[name]
      const magazine = magazines.current[name]
      const loaded = Math.min(weapon.magazine - magazine.ammo, magazine.reserve)
      magazine.ammo += loaded
      magazine.reserve -= loaded
      reloadUntil.current = 0
      if (name === activeWeapon.current) publishHud({ ammo: magazine.ammo, reserve: magazine.reserve, notice: 'MAGAZINE READY' })
    }
    if (mouseDown.current) fireRef.current()

    const distanceToSiteA = camera.position.distanceTo(SITE_A)
    const distanceToSiteB = camera.position.distanceTo(SITE_B)
    const atSite = distanceToSiteA < 3.6 || distanceToSiteB < 3.6
    const pressingPlant = keys.current.has('KeyE')
    if (pressingPlant && !lastPlantKey.current && atSite && !current.bombPlanted && mode !== 'TRAINING') {
      bombSeconds.current = 35
      plantedSite.current.copy(distanceToSiteA < distanceToSiteB ? SITE_A : SITE_B)
      publishHud({ bombPlanted: true, notice: `CHARGE ARMED AT SITE ${distanceToSiteA < distanceToSiteB ? 'A' : 'B'}` })
    }
    lastPlantKey.current = pressingPlant
    if (current.bombPlanted) {
      bombSeconds.current -= dt
      if (bombSeconds.current <= 0) publishHud({ result: 'SITE DESTROYED', notice: 'OBJECTIVE COMPLETE' })
      const atDefuseSite = camera.position.distanceTo(plantedSite.current) < 3.6
      if (atDefuseSite && keys.current.has('KeyF')) {
        if (defuseStartedAt.current === null) {
          defuseStartedAt.current = elapsed.current
          publishHud({ notice: 'DEFUSING — HOLD F' })
        } else if (elapsed.current - defuseStartedAt.current >= 5) {
          publishHud({ result: 'SECTOR SECURED', notice: 'CHARGE DEFUSED' })
          defuseStartedAt.current = null
        }
      } else {
        defuseStartedAt.current = null
      }
    }

    for (const [index, bot] of bots.current.entries()) {
      if (!bot.alive) continue
      const dx = camera.position.x - bot.position.x
      const dz = camera.position.z - bot.position.z
      const distance = Math.sqrt(dx * dx + dz * dz)
      const visible = distance < 30 && hasLineOfSight(bot.position.x, bot.position.z, camera.position.x, camera.position.z)
      let moveX = 0
      let moveZ = 0
      if (distance > (visible ? 8 : 3.5)) {
        moveX = dx / distance
        moveZ = dz / distance
      } else if (distance < 4.2) {
        moveX = -dx / distance
        moveZ = -dz / distance
      } else if (!visible) {
        const strafe = index % 2 ? 1 : -1
        moveX = dz / distance * strafe
        moveZ = -dx / distance * strafe
      }
      if (moveX || moveZ) {
        const step = 1.8 * dt
        const nextX = bot.position.x + moveX * step
        const nextZ = bot.position.z + moveZ * step
        if (!isBlocked(nextX, bot.position.z)) bot.position.x = nextX
        if (!isBlocked(bot.position.x, nextZ)) bot.position.z = nextZ
      }
      bot.mesh?.rotation.set(0, Math.atan2(dx, dz), 0)
      if (visible && elapsed.current > bot.attackAt) {
        bot.attackAt = elapsed.current + 0.85 + Math.random() * 0.55
        bot.firingUntil = now + 110
        if (mode !== 'TRAINING') {
          const damage = 4 + Math.floor(Math.random() * 4)
          const health = Math.max(0, hudRefLive.current.current.health - damage)
          publishHud({ health, notice: 'INCOMING FIRE' })
          if (health === 0) publishHud({ health, result: 'OPERATOR DOWN', notice: 'MISSION FAILED' })
        }
      }
    }
    if (mode !== 'TRAINING' && !current.bombPlanted) {
      const time = Math.max(0, 180 - Math.floor(elapsed.current))
      if (time === 0) publishHud({ time, result: 'TIME EXPIRED', notice: 'ROUND LOST' })
    }
    if (now - lastHudUpdate.current > 140) {
      lastHudUpdate.current = now
      const live = hudRefLive.current.current
      setHudLive.current({
        ...live,
        time: live.bombPlanted ? Math.max(0, Math.ceil(bombSeconds.current)) : mode === 'TRAINING' ? Math.floor(elapsed.current) : Math.max(0, 180 - Math.floor(elapsed.current)),
        notice: elapsed.current > 3 && !live.bombPlanted && !live.result ? '' : live.notice,
      })
    }
  })

  return (
    <>
      <fog attach="fog" args={['#a8bdc6', 45, 105]} />
      <Map />
      {bots.current.map((bot, index) => <BotModel key={index} bot={bot} index={index} />)}
      <PlayerWeapon weaponName={hudRef.current.weapon} skin={weaponSkin} recoil={recoil} muzzleFlash={muzzleFlash} />
    </>
  )
}

export function Arena({ mode, onExit, onComplete, sensitivity, quality, weaponSkin }: {
  mode: GameMode
  onExit: () => void
  onComplete: (match: { mode: string; result: string; kills: number; durationSeconds: number }) => void
  sensitivity: number
  quality: string
  weaponSkin: string
}) {
  const [hud, setHud] = useState<HudState>({ ...initialHud, time: mode === 'TRAINING' ? 0 : 180 })
  const [restartId, setRestartId] = useState(0)
  const hudRef = useRef(hud)
  hudRef.current = hud
  const [started, setStarted] = useState(false)
  const completedResult = useRef('')

  useEffect(() => {
    const handlePointerLock = () => setStarted(document.pointerLockElement !== null)
    document.addEventListener('pointerlockchange', handlePointerLock)
    return () => document.removeEventListener('pointerlockchange', handlePointerLock)
  }, [])

  const start = () => {
    completedResult.current = ''
    setHud({ ...initialHud, time: mode === 'TRAINING' ? 0 : 180 })
    hudRef.current = { ...initialHud, time: mode === 'TRAINING' ? 0 : 180 }
    setRestartId((id) => id + 1)
  }
  useEffect(() => {
    if (!hud.result || completedResult.current === hud.result) return
    completedResult.current = hud.result
    onComplete({
      mode,
      result: hud.result === 'SECTOR SECURED' || hud.result === 'SITE DESTROYED' ? 'WIN' : 'LOSS',
      kills: hud.kills,
      durationSeconds: mode === 'TRAINING' ? hud.time : 180 - hud.time,
    })
  }, [hud, mode, onComplete])
  const goBack = () => {
    if (document.pointerLockElement) document.exitPointerLock()
    onExit()
  }
  const minute = mode === 'TRAINING' ? 'PRACTICE' : String(Math.floor(hud.time / 60)).padStart(2, '0')
  const second = mode === 'TRAINING' ? 'RANGE' : String(hud.time % 60).padStart(2, '0')
  return (
    <main className="game-shell">
      <Canvas shadows={{ type: PCFShadowMap }} camera={{ position: [0, 1.65, 14], fov: 76 }} dpr={quality === 'LOW' ? 0.8 : quality === 'MEDIUM' ? 1 : [1, 1.5]} gl={{ antialias: quality !== 'LOW', powerPreference: 'high-performance' }}>
        <AdaptiveDpr />
        <World hudRef={hudRef} setHud={setHud} mode={mode} restartId={restartId} sensitivity={sensitivity} weaponSkin={weaponSkin} />
      </Canvas>
      <div className="game-vignette" />
      <div className="game-objective">ARDENT DISTRICT · FIELD 07<small>{hud.bombPlanted ? 'CHARGE ACTIVE — DEFEND THE SITE' : mode === 'TRAINING' ? 'LIVE FIRE RANGE — NO DAMAGE' : 'ARM A SITE OR ELIMINATE HOSTILES'}</small></div>
      <div className="game-top"><div className="game-round">{mode === 'TRAINING' ? 'TRAINING / LIVE RANGE' : 'ROUND 01 / 12'}</div><div className={`game-clock ${hud.time < 20 && mode !== 'TRAINING' ? 'danger' : ''}`}>{minute}:{second}</div></div>
      <div className="mini-map">
        <i className="mini-gridline one" /><i className="mini-gridline two" />
        <i className="mini-site a">A</i><i className="mini-site b">B</i><i className="mini-player" />
        {hud.enemies > 0 && <><i className="mini-bot b1" /><i className="mini-bot b2" /><i className="mini-bot b3" /></>}
      </div>
      <div className="crosshair" />
      <button className="game-exit" onClick={goBack}>LEAVE MATCH</button>
      <div className="game-bottom">
        <div className="health-block"><div className="health-label">OPERATOR STATUS</div><div className={`health-value ${hud.health < 30 ? 'low' : ''}`}>{hud.health}<span style={{ fontSize: 13, color: '#8b9691' }}> HP</span></div><div className="health-bar"><span style={{ width: `${hud.health}%` }} /></div></div>
        <div className="ammo-block"><div className="ammo-label">ACTIVE WEAPON</div><div className="ammo-value">{hud.ammo}<span> / {hud.reserve}</span></div><div className="weapon-tag">{hud.weapon}</div></div>
      </div>
      {!started && !hud.result && <div className="game-prompt">CLICK THE ARENA TO DEPLOY · WASD MOVE · MOUSE AIM · LEFT CLICK FIRE</div>}
      {started && hud.notice && <div className="game-prompt">{hud.notice}{hud.enemies > 0 && mode !== 'TRAINING' ? ` · HOSTILES ${hud.enemies}` : ''}</div>}
      <div className="game-controls">WASD MOVE · SHIFT SPRINT · C CROUCH · SPACE JUMP · R RELOAD · 1–4 LOADOUT · E PLANT · F DEFUSE</div>
      {hud.result && <div className="game-message"><strong>{hud.result}</strong><span>ELIMINATIONS {hud.kills} · {hud.notice}</span><div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, pointerEvents: 'auto' }}><button className="primary-button" onClick={start}>DEPLOY AGAIN</button><button className="secondary-button" onClick={goBack}>RETURN TO BASE</button></div></div>}
    </main>
  )
}
