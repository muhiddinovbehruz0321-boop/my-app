export const WEAPONS = {
  'VXR-9 CARBINE': {
    slot: 'Digit1',
    class: 'rifle',
    magazine: 30,
    reserve: 90,
    damage: 42,
    interval: 115,
    reload: 1750,
    range: 55,
    spread: 0.005,
    pellets: 1,
  },
  'KITE-12 SIDEARM': {
    slot: 'Digit2',
    class: 'pistol',
    magazine: 12,
    reserve: 48,
    damage: 68,
    interval: 260,
    reload: 1250,
    range: 36,
    spread: 0.009,
    pellets: 1,
  },
  'MTR-5 COMPACT': {
    slot: 'Digit3',
    class: 'smg',
    magazine: 36,
    reserve: 108,
    damage: 27,
    interval: 78,
    reload: 1650,
    range: 32,
    spread: 0.012,
    pellets: 1,
  },
  'QUARRY-8 BREACHER': {
    slot: 'Digit4',
    class: 'shotgun',
    magazine: 8,
    reserve: 32,
    damage: 16,
    interval: 780,
    reload: 2100,
    range: 18,
    spread: 0.045,
    pellets: 7,
  },
} as const

export type WeaponName = keyof typeof WEAPONS

export const INITIAL_MAGAZINES = {
  'VXR-9 CARBINE': { ammo: WEAPONS['VXR-9 CARBINE'].magazine, reserve: WEAPONS['VXR-9 CARBINE'].reserve },
  'KITE-12 SIDEARM': { ammo: WEAPONS['KITE-12 SIDEARM'].magazine, reserve: WEAPONS['KITE-12 SIDEARM'].reserve },
  'MTR-5 COMPACT': { ammo: WEAPONS['MTR-5 COMPACT'].magazine, reserve: WEAPONS['MTR-5 COMPACT'].reserve },
  'QUARRY-8 BREACHER': { ammo: WEAPONS['QUARRY-8 BREACHER'].magazine, reserve: WEAPONS['QUARRY-8 BREACHER'].reserve },
} satisfies Record<WeaponName, { ammo: number; reserve: number }>

export function createMagazines(): Record<WeaponName, { ammo: number; reserve: number }> {
  return {
    'VXR-9 CARBINE': { ...INITIAL_MAGAZINES['VXR-9 CARBINE'] },
    'KITE-12 SIDEARM': { ...INITIAL_MAGAZINES['KITE-12 SIDEARM'] },
    'MTR-5 COMPACT': { ...INITIAL_MAGAZINES['MTR-5 COMPACT'] },
    'QUARRY-8 BREACHER': { ...INITIAL_MAGAZINES['QUARRY-8 BREACHER'] },
  }
}

export function getWeapon(name: string) {
  return Object.hasOwn(WEAPONS, name) ? WEAPONS[name as WeaponName] : WEAPONS['VXR-9 CARBINE']
}
