import { useCallback, useEffect, useRef, useState } from 'react'
import { releaseAll, setControl, type GcControl } from '../lib/input.ts'

/** Stick vector below this fraction of the pad radius counts as centered. */
const DEAD_ZONE = 0.3

function stickControls(dx: number, dy: number, radius: number): Set<GcControl> {
  const active = new Set<GcControl>()
  const threshold = radius * DEAD_ZONE
  if (dx < -threshold) active.add('stick-left')
  if (dx > threshold) active.add('stick-right')
  if (dy < -threshold) active.add('stick-up')
  if (dy > threshold) active.add('stick-down')
  return active
}

function VirtualStick() {
  const padRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<Set<GcControl>>(new Set())
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const apply = useCallback((next: Set<GcControl>) => {
    for (const control of activeRef.current) if (!next.has(control)) setControl(control, false)
    for (const control of next) if (!activeRef.current.has(control)) setControl(control, true)
    activeRef.current = next
  }, [])

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
      apply(stickControls(dx, dy, radius))
    },
    [apply],
  )

  const release = useCallback(() => {
    setKnob({ x: 0, y: 0 })
    apply(new Set())
  }, [apply])

  return (
    <div
      ref={padRef}
      className="stick-pad"
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

function HoldButton({ control, className, label }: { control: GcControl; className: string; label: string }) {
  return (
    <button
      className={`pad-btn ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setControl(control, true)
      }}
      onPointerUp={() => setControl(control, false)}
      onPointerCancel={() => setControl(control, false)}
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

      <VirtualStick />

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
