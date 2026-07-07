// A small, curated index of GameCube titles keyed by their 6-char disc game
// ID, used to power the "search by title" import helper. This is metadata
// only — CubeDeck never ships or fetches game data; the user always supplies
// their own disc image. Selecting a match just pre-fills the title and the
// game ID (which unlocks GameTDB box art, including for zip/RVZ images whose
// headers we can't read directly).
//
// IDs follow GameTDB's convention (https://www.gametdb.com); region letter is
// the 4th character (E=US, P=EU, J=JP). A wrong ID only means a missing cover
// (the <img> onError removes itself), so this list degrades gracefully. Extend
// it freely — it is plain data.

export interface KnownGame {
  /** 6-char disc game ID, e.g. GPVE01. */
  id: string
  title: string
}

export const KNOWN_GAMES: KnownGame[] = [
  // Platformers & Action
  { id: 'GPVE01', title: 'Pikmin 2' },
  { id: 'GPIE01', title: 'Pikmin' },
  { id: 'GMSE01', title: 'Super Mario Sunshine' },
  { id: 'GLME01', title: "Luigi's Mansion" },
  { id: 'GSAE01', title: 'Star Fox Adventures' },
  { id: 'GKYE01', title: 'Kirby Air Ride' },

  // Fighting & Sports
  { id: 'GALE01', title: 'Super Smash Bros. Melee' },
  { id: 'GHQE7D', title: 'SoulCalibur II' },
  { id: 'GM4E01', title: 'Mario Kart: Double Dash!!' },

  // Adventure & RPG
  { id: 'GZLE01', title: 'The Legend of Zelda: The Wind Waker' },
  { id: 'GZ2E01', title: 'The Legend of Zelda: Twilight Princess' },
  { id: 'G8ME01', title: 'Paper Mario: The Thousand-Year Door' },
  { id: 'GFEE01', title: 'Fire Emblem: Path of Radiance' },
  { id: 'GEDE01', title: "Eternal Darkness: Sanity's Requiem" },

  // Metroid & Prime
  { id: 'GM8E01', title: 'Metroid Prime' },
  { id: 'G2ME01', title: 'Metroid Prime 2: Echoes' },
  { id: 'GM3E01', title: 'Metroid Prime 3: Corruption' },

  // Pokemon
  { id: 'GC6E01', title: 'Pokemon Colosseum' },
  { id: 'GXXE01', title: 'Pokemon XD: Gale of Darkness' },

  // Simulation & Other
  { id: 'GAFE01', title: 'Animal Crossing' },
  { id: 'GFZE01', title: 'F-Zero GX' },
  { id: 'GYBE69', title: 'Beyond Good & Evil' },
  { id: 'G4BE08', title: 'Resident Evil 4' },

  // Additional popular titles
  { id: 'GNMJ01', title: 'NBA Street Vol. 2' },
  { id: 'GPLE01', title: 'Donkey Kong Country 2' },
  { id: 'RKLE69', title: 'Crash Bandicoot: The Wrath of Cortex' },
  { id: 'GTEE01', title: 'Turok: Evolution' },
]

/**
 * Case-insensitive substring match on title, ranked so titles that start with
 * the query come first. Empty query returns nothing (the picker only opens
 * once the user types).
 */
export function searchKnownGames(query: string, limit = 8): KnownGame[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matches = KNOWN_GAMES.filter((g) => g.title.toLowerCase().includes(q))
  matches.sort((a, b) => {
    const aStarts = a.title.toLowerCase().startsWith(q) ? 0 : 1
    const bStarts = b.title.toLowerCase().startsWith(q) ? 0 : 1
    return aStarts - bStarts || a.title.localeCompare(b.title)
  })
  return matches.slice(0, limit)
}
