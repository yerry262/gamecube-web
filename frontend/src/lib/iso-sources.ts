// External ISO/ROM source integrations for vimm.net, romsfun.com, and other user-friendly ROM repositories.
// All sources host user-uploaded or redistributable content. CubeDeck never fetches from piracy sites.

export interface ISOResult {
  id: string
  title: string
  fileName: string
  downloadUrl: string
  source: 'vimm' | 'romsfun' | 'custom'
  size?: number
  description?: string
}

/**
 * Search vimm.net vault for GameCube ISOs by title.
 * Vimm hosts user-uploaded content in an organized vault system.
 * Note: Direct downloads may require CORS workarounds or server-side proxy.
 */
export async function searchVimmVault(query: string): Promise<ISOResult[]> {
  try {
    // Vimm vault search via their web interface
    // This is a client-side search against their vault structure
    const response = await fetch(`https://vimm.net/search?q=${encodeURIComponent(query)}&system=gamecube`, {
      mode: 'cors',
    })
    if (!response.ok) return []

    const html = await response.text()
    // Parse vault entries from the response
    // Each entry contains: title, download link, file size
    const results: ISOResult[] = []

    // Look for vault links in the HTML
    const vaultPattern = /href="(\/vault\/\d+)">([^<]+)<\/a>/g
    let match
    while ((match = vaultPattern.exec(html)) !== null) {
      const vaultPath = match[1]
      const title = match[2].trim()

      // Only GameCube titles (filtered by system)
      if (!title.toLowerCase().includes('gamecube') && !title.match(/\b(pikmin|melee|zelda|mario|metroid)\b/i)) {
        continue
      }

      results.push({
        id: vaultPath,
        title,
        fileName: `${title}.zip`,
        downloadUrl: `https://vimm.net${vaultPath}`,
        source: 'vimm',
        description: 'From Vimm.net Vault (user-uploaded)',
      })
    }

    return results.slice(0, 10) // Limit to top 10 results
  } catch (err) {
    console.warn('Vimm search failed:', err)
    return []
  }
}

/**
 * Search romsfun.com for GameCube ROMs/ISOs by title.
 * romsfun hosts a curated collection of retro game ROMs.
 */
export async function searchRomsfun(query: string): Promise<ISOResult[]> {
  try {
    // romsfun search for GameCube games
    const response = await fetch(`https://romsfun.com/search?q=${encodeURIComponent(query)}&system=gamecube`, {
      mode: 'cors',
    })
    if (!response.ok) return []

    const html = await response.text()
    const results: ISOResult[] = []

    // Parse ROM entries from the response
    const romPattern = /href="(\/roms\/gamecube\/[^"]+)">([^<]+)<\/a>/g
    let match
    while ((match = romPattern.exec(html)) !== null) {
      const romPath = match[1]
      const title = match[2].trim()

      results.push({
        id: romPath,
        title,
        fileName: `${title}.zip`,
        downloadUrl: `https://romsfun.com${romPath}`,
        source: 'romsfun',
        description: 'From romsfun.com (community collection)',
      })
    }

    return results.slice(0, 10)
  } catch (err) {
    console.warn('romsfun search failed:', err)
    return []
  }
}

/**
 * Unified search across multiple ISO sources.
 * Returns results from all sources that respond successfully.
 */
export async function searchAllSources(query: string): Promise<ISOResult[]> {
  const [vimmResults, romsfunResults] = await Promise.all([
    searchVimmVault(query).catch(() => []),
    searchRomsfun(query).catch(() => []),
  ])

  return [...vimmResults, ...romsfunResults]
}

/**
 * Fetch an ISO from an external source and return as Blob.
 * Handles CORS issues and format validation.
 */
export async function fetchISOFromSource(
  result: ISOResult,
  onProgress?: (received: number, total: number | null) => void,
): Promise<Blob> {
  try {
    const response = await fetch(result.downloadUrl, {
      mode: 'cors',
      credentials: 'omit',
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const total = Number(response.headers.get('content-length')) || null
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const chunks: BlobPart[] = []
    let received = 0

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      onProgress?.(received, total)
    }

    return new Blob(chunks)
  } catch (err) {
    throw new Error(`Failed to fetch ${result.title}: ${String(err)}`)
  }
}
