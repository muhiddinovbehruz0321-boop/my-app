import assert from 'node:assert/strict'
import test from 'node:test'
import { isBlocked, movePlayer } from '../src/game/physics.ts'
import { createMagazines } from '../src/game/weapons.ts'

test('arena bounds and cover prevent players from occupying solid space', () => {
  assert.equal(isBlocked(25.6, 0), true)
  assert.equal(isBlocked(-8, 1), true)
  assert.equal(isBlocked(0, 0), false)
})

test('movement slides along cover instead of stopping on both axes', () => {
  assert.deepEqual(movePlayer(-10, 4, 1, 1), { x: -10, z: 5 })
})

test('both marked sites remain reachable outside the building colliders', () => {
  assert.equal(isBlocked(-10, -11), false)
  assert.equal(isBlocked(10, -11), false)
})

test('the starting sightline stays open and cover remains solid', () => {
  assert.equal(isBlocked(0, 10), false)
  assert.equal(isBlocked(-5, 8), true)
  assert.equal(isBlocked(14.5, 2), true)
})

test('weapon loadouts have independent magazine and reserve state', () => {
  const first = createMagazines()
  const second = createMagazines()
  first['VXR-9 CARBINE'].ammo = 0
  assert.equal(second['VXR-9 CARBINE'].ammo, 30)
  assert.equal(first['KITE-12 SIDEARM'].ammo, 12)
  assert.equal(first['QUARRY-8 BREACHER'].reserve, 32)
})
