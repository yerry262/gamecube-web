import { useCallback, useEffect, useRef, useState } from 'react'
import { releaseAll, setButton, setStick, type GcButton, type GcStick } from '../lib/input.ts'

/** Stick vector below this fraction of the pad radius counts as centered. */
const DEAD_ZONE = 0.15

function VirtualStick({ stick, className = '' }: { stick: GcStick; className?: string }) {
  const padRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const onPointer = useCallback(
    (e: React.PointerEvent) => {
      const pad = padRef.current
      if (!pad) return
      const rect = pad.getBoundingClientRect()
      const radius = rect.width / 2
      let dx = e.clientX - (rect.left + radius)
      let dy = e.clientY - (rect.top + radius)
      const len = Math.hypot(dx, dy)
      if (len > radius) {
        dx = (dx / len) * radius
        dy = (dy / len) * radius
      }
      setKnob({ x: dx, y: dy })
      const dead = len / radius < DEAD_ZONE
      // Screen y is down-positive; the pad's is up-positive.
      setStick(stick, dead ? 0 : dx / radius, dead ? 0 : -dy / radius)
    },
    [stick],
  )

  const release = useCallback(() => {
    setKnob({ x: 0, y: 0 })
    setStick(stick, 0, 0)
  }, [stick])

  return (
    <div
      ref={padRef}
      className={`stick-pad ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onPointer(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onPointer(e)
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

function HoldButton({ control, className, label }: { control: GcButton; className: string; label: string }) {
  return (
    <button
      className={`pad-btn ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setButton(control, true)
      }}
      onPointerUp={() => setButton(control, false)}
      onPointerCancel={() => setButton(control, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

export default function TouchControls() {
  const [visible, setVisible] = useState(() => window.matchMedia('(pointer: coarse)').matches)

  useEffect(() => () => releaseAll(), [])

  if (!visible) {
    return (
      <button className="pad-toggle" onClick={() => setVisible(true)} aria-label="Show touch controls">
        🎮
      </button>
    )
  }

  return (
    <div className="touch-layer">
      <div className="shoulders">
        <HoldButton control="l" className="shoulder" label="L" />
        <HoldButton control="z" className="shoulder z" label="Z" />
        <HoldButton control="r" className="shoulder" label="R" />
      </div>

      <VirtualStick stick="main" />
      <VirtualStick stick="c" className="c-stick" />

      <div className="dpad">
        <HoldButton control="dpad-up" className="dpad-btn up" label="▲" />
        <HoldButton control="dpad-left" className="dpad-btn left" label="◀" />
        <HoldButton control="dpad-right" className="dpad-btn right" label="▶" />
        <HoldButton control="dpad-down" className="dpad-btn down" label="▼" />
      </div>

      <div className="face-cluster">
        <HoldButton control="y" className="face y" label="Y" />
        <HoldButton control="x" className="face x" label="X" />
        <HoldButton control="b" className="face b" label="B" />
        <HoldButton control="a" className="face a" label="A" />
      </div>

      <HoldButton control="start" className="start" label="START" />

      <button className="pad-toggle" onClick={() => setVisible(false)} aria-label="Hide touch controls">
        🎮
      </button>
    </div>
  )
}
