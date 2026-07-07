import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-time crashes in the tree below (the emulator's own wasm
 * panics surface through Player's window error listeners instead, since they
 * happen outside React).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="player-screen">
        <div className="notice">
          <h2>Something went wrong</h2>
          <p>{String(this.state.error)}</p>
          <button
            className="primary"
            onClick={() => {
              window.location.hash = ''
              window.location.reload()
            }}
          >
            Back to library
          </button>
        </div>
      </div>
    )
  }
}
