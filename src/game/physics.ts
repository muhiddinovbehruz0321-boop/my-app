export type Collider = { x: number; z: number; w: number; d: number }

export const arenaColliders: Collider[] = [
  { x: -18, z: -6, w: 5, d: 2 }, { x: 18, z: -6, w: 5, d: 2 },
  { x: -8, z: 1, w: 2.8, d: 7 }, { x: 8, z: 1, w: 2.8, d: 7 },
  { x: 0, z: -8, w: 8, d: 2.4 }, { x: -17, z: 8, w: 3.8, d: 3.3 },
  { x: 17, z: 8, w: 3.8, d: 3.3 }, { x: -5, z: 8, w: 5.2, d: 2.3 },
  { x: -23, z: 0, w: 1.8, d: 8 }, { x: 23, z: 0, w: 1.8, d: 8 },
  { x: -19, z: -14, w: 13, d: 8 }, { x: 19, z: -14, w: 13, d: 8 },
  { x: -21, z: 14, w: 9, d: 6 }, { x: 21, z: 14, w: 9, d: 6 },
  { x: 14.5, z: 2, w: 2.8, d: 4.8 },
]

export function isBlocked(x: number, z: number): boolean {
  if (Math.abs(x) > 25.5 || Math.abs(z) > 16.5) return true
  return arenaColliders.some((block) =>
    Math.abs(x - block.x) < block.w / 2 + 0.42 && Math.abs(z - block.z) < block.d / 2 + 0.42,
  )
}

export function movePlayer(x: number, z: number, dx: number, dz: number) {
  let nextX = x
  let nextZ = z
  if (!isBlocked(nextX + dx, nextZ)) nextX += dx
  if (!isBlocked(nextX, nextZ + dz)) nextZ += dz
  return { x: nextX, z: nextZ }
}
