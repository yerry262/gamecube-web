/* tslint:disable */
/* eslint-disable */

/**
 * Snapshot of the slot-A memory card (2 MiB). None before the first boot.
 */
export function get_memcard(): Uint8Array | undefined;

/**
 * Smoothed performance stats: `[fps, percent_of_native_speed]`.
 * Both are 0.0 until the first frames render.
 */
export function get_perf(): Float64Array;

/**
 * Bumped whenever the emulated game writes to the memory card (or SRAM).
 * Poll this cheaply; call [`get_memcard`] only when it changes.
 */
export function memcard_version(): number;

/**
 * Full analog pad state from JS (touch overlay / Gamepad API). Sticks and
 * triggers are raw hardware values (0..=255, sticks centered at 128),
 * `buttons` is the PAD button bitmask. Replaces the whole pad state, so
 * callers must send every held control each time.
 */
export function set_pad_state(stick_x: number, stick_y: number, substick_x: number, substick_y: number, trigger_left: number, trigger_right: number, buttons: number): void;

export function start_emulator(rom_data: Uint8Array, filename: string, dsp_irom?: Uint8Array | null, memcard?: Uint8Array | null): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly get_memcard: () => [number, number];
    readonly get_perf: () => [number, number];
    readonly memcard_version: () => number;
    readonly set_pad_state: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly start_emulator: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
    readonly rust_zstd_wasm_shim_free: (a: number) => void;
    readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
    readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h3b8fdc9dd54ae757: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h7fb3191fc6f9a6d8: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__haf148aa52335d8bd: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h21804bfe36fdbf34: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h21804bfe36fdbf34_4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h21804bfe36fdbf34_5: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h21804bfe36fdbf34_6: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h21804bfe36fdbf34_7: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h21804bfe36fdbf34_8: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h21804bfe36fdbf34_9: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h21804bfe36fdbf34_10: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h11c0a21c335bc485: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
