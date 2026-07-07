// All input (touch overlay, Gamepad API) funnels into the set_pad_state
// export added by emulator/gecko-web-disc.patch: the full analog pad state
// (sticks, C-stick, triggers, button bitmask) is pushed to the Rust side,
// which applies it on the next frame. Physical keyboards are handled by the
// emulator's own winit key handler and never pass through this module.

export type GcButton =
  | 'a' | 'b' | 'x' | 'y'
  | 'start' | 'l' | 'r' | 'z'
  | 'dpad-up' | 'dpad-down' | 'dpad-left' | 'dpad-right'

export type GcStick = 'main' | 'c'

// PAD button bitmask, mirroring gecko's flipper::si::pad constants.
const BUTTON_MASKS: Record<GcButton, number> = {
  'dpad-left': 0x0001,
  'dpad-right': 0x0002,
  'dpad-down': 0x0004,
  'dpad-up': 0x0008,
  z: 0x0010,
  r: 0x0020,
  l: 0x0040,
  a: 0x0100,
  b: 0x0200,
  x: 0x0400,
  y: 0x0800,
  start: 0x1000,
}

const STICK_CENTER = 128
const TRIGGER_MAX = 255

type SetPadStateFn = (
  stickX: number,
  stickY: number,
  substickX: number,
  substickY: number,
  triggerLeft: number,
  triggerRight: number,
  buttons: number,
) => void

let setPadState: SetPadStateFn | null = null

/** Wired up by bootEmulator once the wasm module is initialized. */
export function attachPadOutput(fn: SetPadStateFn): void {
  setPadState = fn
  push()
}

const pad = {
  stickX: STICK_CENTER,
  stickY: STICK_CENTER,
  substickX: STICK_CENTER,
  substickY: STICK_CENTER,
  triggerLeft: 0,
  triggerRight: 0,
  buttons: 0,
}

function push(): void {
  setPadState?.(
    pad.stickX,
    pad.stickY,
    pad.substickX,
    pad.substickY,
    pad.triggerLeft,
    pad.triggerRight,
    pad.buttons,
  )
}

/** Maps -1..1 (x right-positive, y up-positive) to the pad's 0..255 range. */
function stickByte(v: number): number {
  const clamped = Math.max(-1, Math.min(1, v))
  return Math.round(STICK_CENTER + clamped * 127)
}

export function setButton(button: GcButton, down: boolean): void {
  const mask = BUTTON_MASKS[button]
  const buttons = down ? pad.buttons | mask : pad.buttons & ~mask
  // L/R are also analog: a digital press is a full trigger pull.
  const changed = buttons !== pad.buttons
  pad.buttons = buttons
  if (button === 'l') pad.triggerLeft = down ? TRIGGER_MAX : 0
  if (button === 'r') pad.triggerRight = down ? TRIGGER_MAX : 0
  if (changed || button === 'l' || button === 'r') push()
}

export function setStick(stick: GcStick, x: number, y: number): void {
  const bx = stickByte(x)
  const by = stickByte(y)
  if (stick === 'main') {
    if (bx === pad.stickX && by === pad.stickY) return
    pad.stickX = bx
    pad.stickY = by
  } else {
    if (bx === pad.substickX && by === pad.substickY) return
    pad.substickX = bx
    pad.substickY = by
  }
  push()
}

/** Analog trigger pull in 0..1 (Gamepad API); does not touch the L/R buttons. */
export function setTrigger(side: 'l' | 'r', value: number): void {
  const byte = Math.round(Math.max(0, Math.min(1, value)) * TRIGGER_MAX)
  if (side === 'l') {
    if (byte === pad.triggerLeft) return
    pad.triggerLeft = byte
  } else {
    if (byte === pad.triggerRight) return
    pad.triggerRight = byte
  }
  push()
}

export function releaseAll(): void {
  pad.stickX = STICK_CENTER
  pad.stickY = STICK_CENTER
  pad.substickX = STICK_CENTER
  pad.substickY = STICK_CENTER
  pad.triggerLeft = 0
  pad.triggerRight = 0
  pad.buttons = 0
  push()
}

export function focusEmulator(): void {
  // winit appends its canvas directly to <body>; focus it so physical
  // keyboards reach the emulator's own key handler.
  document.querySelector<HTMLCanvasElement>('body > canvas')?.focus()
}

// ---- Gamepad API ----------------------------------------------------------

const TRIGGER_CLICK = 0.85 // analog pull that counts as the L/R button click

// Standard-layout gamepad button index -> GameCube button.
const PAD_BUTTONS: Array<[number, GcButton]> = [
  [0, 'a'], // bottom face button
  [1, 'b'], // right face button
  [2, 'x'], // left face button
  [3, 'y'], // top face button
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
    const gp = navigator.getGamepads?.().find((p) => p?.connected)
    if (gp) {
      // Left stick -> main stick, right stick -> C-stick (browser y is
      // down-positive, the pad's is up-positive).
      setStick('main', gp.axes[0] ?? 0, -(gp.axes[1] ?? 0))
      setStick('c', gp.axes[2] ?? 0, -(gp.axes[3] ?? 0))

      // Bumpers are digital full presses; triggers are analog with a
      // button click near the bottom of the pull.
      const lPull = Math.max(gp.buttons[4]?.pressed ? 1 : 0, gp.buttons[6]?.value ?? 0)
      const rPull = Math.max(gp.buttons[5]?.pressed ? 1 : 0, gp.buttons[7]?.value ?? 0)
      setTrigger('l', lPull)
      setTrigger('r', rPull)
      setDigitalFromMask('l', lPull >= TRIGGER_CLICK)
      setDigitalFromMask('r', rPull >= TRIGGER_CLICK)

      for (const [index, button] of PAD_BUTTONS) {
        setDigitalFromMask(button, gp.buttons[index]?.pressed ?? false)
      }
    }
    gamepadLoop = requestAnimationFrame(poll)
  }
  gamepadLoop = requestAnimationFrame(poll)
}

// setButton would zero the analog trigger on L/R release; the gamepad loop
// manages triggers itself, so only flip the button bit here.
function setDigitalFromMask(button: GcButton, down: boolean): void {
  const mask = BUTTON_MASKS[button]
  const buttons = down ? pad.buttons | mask : pad.buttons & ~mask
  if (buttons === pad.buttons) return
  pad.buttons = buttons
  push()
}

export function stopGamepadLoop(): void {
  if (gamepadLoop) cancelAnimationFrame(gamepadLoop)
  gamepadLoop = 0
  releaseAll()
}
