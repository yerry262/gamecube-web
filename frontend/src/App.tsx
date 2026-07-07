import { useEffect, useState } from 'react'
import Library from './components/Library.tsx'
import Player from './components/Player.tsx'

function currentView(): { view: 'library' } | { view: 'play'; gameId: string } {
  const match = /^#play\/(.+)$/.exec(window.location.hash)
  return match ? { view: 'play', gameId: decodeURIComponent(match[1]) } : { view: 'library' }
}

export default function App() {
  const [route, setRoute] = useState(currentView)

  useEffect(() => {
    const onHashChange = () => {
      const next = currentView()
      // Leaving the player must tear down the emulator's event loop, and
      // gecko has no stop API — a full reload is the only clean exit.
      if (route.view === 'play' && next.view === 'library') {
        window.location.reload()
        return
      }
      setRoute(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [route])

  if (route.view === 'play') return <Player gameId={route.gameId} />
  return <Library />
}
