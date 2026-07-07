// All input funnels into synthetic KeyboardEvents aimed at the emulator's
// canvas, matching the keyboard mapping in gecko's web crate
// (crates/web/src/lib.rs::update_pad). This lets touch overlays and the
// Gamepad API drive the emulator without patching the Rust side.

export type GcControl =
  | 'stick-up' | 'stick-down' | 'stick-left' | 'stick-right'
  | 'a' | 'b' | 'x' | 'y'
  | 'start' | 'l' | 'r' | 'z'
  | 'dpad-up' | 'dpad-down' | 'dpad-left' | 'dpad-right'

const CODE_FOR: Record<GcControl, string> = {
  'stick-up': 'ArrowUp',
  'stick-down': 'ArrowDown',
  'stick-left': 'ArrowLeft',
  'stick-right': 'ArrowRight',
  a: 'KeyX',
  b: 'KeyZ',
  x: 'KeyC',
  y: 'KeyV',
  start: 'Enter',
  l: 'KeyA',
  r: 'KeyS',
  z: 'KeyD',
  'dpad-up': 'KeyI',
  'dpad-down': 'KeyK',
  'dpad-left': 'KeyJ',
  'dpad-right': 'KeyL',
}

function emulatorCanvas(): HTMLCanvasElement | null {
  // winit appends its canvas directly to <body>.
  return document.querySelector('body > canvas')
}

const held = new Set<GcControl>()

export function setControl(control: GcControl, down: boolean): void {
  if (down === held.has(control)) return
  if (down) held.add(control)
  else held.delete(control)

  const canvas = emulatorCanvas()
  if (!canvas) return
  const code = CODE_FOR[control]
  canvas.dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code,
      key: code,
      bubbles: true,
      cancelable: true,
    }),
  )
}

export function releaseAll(): void {
  for (const control of [...held]) setControl(control, false)
}

export function focusEmulator(): void {
  emulatorCanvas()?.focus()
}

// ---- Gamepad API ----------------------------------------------------------

const AXIS_THRESHOLD = 0.4

// Standard-layout gamepad button index -> GameCube control.
const PAD_BUTTONS: Array<[number, GcControl]> = [
  [0, 'a'], // bottom face button
  [1, 'b'], // right face button
  [2, 'x'], // left face button
  [3, 'y'], // top face button
  [4, 'l'],
  [5, 'r'],
  [6, 'l'],
  [7, 'r'],
  [8, 'z'], // select/back doubles as Z
  [9, 'start'],
  [12, 'dpad-up'],
  [13, 'dpad-down'],
  [14, 'dpad-left'],
  [15, 'dpad-right'],
]

let gamepadLoop = 0

export function startGamepadLoop(): void {
  if (gamepadLoop) return
  const poll = () => {
    const pad = navigator.getGamepads?.().find((p) => p?.connected)
    if (pad) {
      const desired = new Map<GcControl, boolean>([
        ['stick-left', pad.axes[0] < -AXIS_THRESHOLD],
        ['stick-right', pad.axes[0] > AXIS_THRESHOLD],
        ['stick-up', pad.axes[1] < -AXIS_THRESHOLD],
        ['stick-down', pad.axes[1] > AXIS_THRESHOLD],
      ])
      // OR together buttons that share a control (L/R have two indices).
      for (const [index, control] of PAD_BUTTONS) {
        const pressed = pad.buttons[index]?.pressed ?? false
        desired.set(control, (desired.get(control) ?? false) || pressed)
      }
      for (const [control, down] of desired) setControl(control, down)
    }
    gamepadLoop = requestAnimationFrame(poll)
  }
  gamepadLoop = requestAnimationFrame(poll)
}

export function stopGamepadLoop(): void {
  if (gamepadLoop) cancelAnimationFrame(gamepadLoop)
  gamepadLoop = 0
  releaseAll()
}
