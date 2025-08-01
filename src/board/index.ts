import svgText from "../CM_V3_Platine_plain.svg";
import { Accelerometer } from "./accelerometer";
import { Audio } from "./audio";
import { Button } from "./buttons";
import { Compass } from "./compass";
import {
  MICROBIT_HAL_PIN_FACE,
  MICROBIT_HAL_PIN_P0,
  MICROBIT_HAL_PIN_P1,
  MICROBIT_HAL_PIN_P2,
  MICROBIT_HAL_PIN_P3,
  MICROBIT_HAL_PIN_P4,
  MICROBIT_HAL_PIN_P5,
  MICROBIT_HAL_PIN_P6,
  MICROBIT_HAL_PIN_P7,
  MICROBIT_HAL_PIN_P8,
  MICROBIT_HAL_PIN_P9,
  MICROBIT_HAL_PIN_P10,
  MICROBIT_HAL_PIN_P11,
  MICROBIT_HAL_PIN_P12,
  MICROBIT_HAL_PIN_P13,
  MICROBIT_HAL_PIN_P14,
  MICROBIT_HAL_PIN_P15,
  MICROBIT_HAL_PIN_P16,
  MICROBIT_HAL_PIN_P19,
  MICROBIT_HAL_PIN_P20,
  MICROBIT_HAL_PIN_RGB,
} from "./constants";
import * as conversions from "./conversions";
import { DataLogging } from "./data-logging";
import { Display } from "./display";
import { FileSystem } from "./fs";
import { Microphone } from "./microphone";
import { Pin, StubPin, TouchPin } from "./pins";
import { Radio } from "./radio";
import { RangeSensor, State } from "./state";
import { ModuleWrapper } from "./wasm";
import { writeRGBLEDs, resetRGBLEDs } from "./rgbleds";

enum StopKind {
  /**
   * The main Wasm function returned control to us in a normal way.
   */
  Default = "default",
  /**
   * The program called panic.
   */
  Panic = "panic",
  /**
   * The program requested a reset.
   */
  Reset = "reset",
  /**
   * An internal mode where we do not display the stop state UI as we plan to immediately reset.
   * Used for user-requested flash or reset.
   */
  BriefStop = "brief",
  /**
   * The user requested the program be interrupted.
   *
   * Note the program could finish for other reasons, but should always count as a user stop.
   */
  UserStop = "user",
}

export class PanicError extends Error {
  constructor(public code: number) {
    super("panic");
  }
}

export class ResetError extends Error {
  constructor() {
    super("reset");
  }
}

const stoppedOpactity = "0.5";

export function createBoard(notifications: Notifications, fs: FileSystem) {
  document.body.insertAdjacentHTML("afterbegin", svgText);
  const svg = document.querySelector("svg");
  if (!svg) {
    throw new Error("No SVG");
  }
  return new Board(notifications, fs, svg);
}

export class Board {
  // Components that manage the state.
  // They keep it in sync with the UI (notifying of changes from user interactions),
  // and get notified external changes and calls from MicroPython.
  // Some call WASM callbacks on significant value changes.
  display: Display;
  buttons: Button[];
  pins: Pin[];
  audio: Audio;
  temperature: RangeSensor;
  microphone: Microphone;
  accelerometer: Accelerometer;
  compass: Compass;
  radio: Radio;
  dataLogging: DataLogging;

  public serialInputBuffer: number[] = [];

  private stoppedOverlay: HTMLDivElement;
  private playButton: HTMLButtonElement;

  private epoch: number | undefined;

  // The language and translations can be changed via the "config" message.
  private language: string = "en";
  private translations: Record<string, string> = {
    "button-a": "Button A",
    "button-b": "Button B",
    "touch-logo": "Touch logo",
    "start-simulator": "Start simulator",
  };
  formattedMessage = ({ id }: { id: string }): string => {
    const result = this.translations[id];
    if (!result) {
      console.trace(`No string for code ${id}`);
    }
    return result ?? id;
  };

  /**
   * Defined for the duration of start().
   */
  private runningPromise: Promise<void> | undefined;
  /**
   * Defined during start().
   */
  private modulePromise: Promise<ModuleWrapper> | undefined;
  /**
   * Defined during start().
   */
  private module: ModuleWrapper | undefined;
  /**
   * Controls the action after the user program completes.
   *
   * Determined by a combination of user actions (stop, reset etc) and program actions.
   */
  private stopKind: StopKind = StopKind.Default;
  /**
   * Timeout for a pending start call due to StopKind.Reset.
   */
  private pendingRestartTimeout: any;
  /**
   * Timeout for the next frame of the panic animation.
   */
  private panicTimeout: any;

  constructor(
    private notifications: Notifications,
    private fs: FileSystem,
    private svg: SVGElement
  ) {
    this.display = new Display(
      Array.from(this.svg.querySelector("#LED-Matrix")!.querySelectorAll("path"))
    );
    const onChange = this.notifications.onStateChange;
    this.buttons = [
      new Button(
        "buttonA",
        this.svg.querySelector("#Taste_A")!,
        () => this.formattedMessage({ id: "button-a" }),
        onChange
      ),
      new Button(
        "buttonB",
        this.svg.querySelector("#Taste_B")!,
        () => this.formattedMessage({ id: "button-b" }),
        onChange
      ),
    ];
    this.pins = Array(36);
    this.pins[MICROBIT_HAL_PIN_FACE] = new TouchPin(
      "pinLogo",
      {
        element: this.svg.querySelector("#Logo")!,
        label: () => this.formattedMessage({ id: "touch-logo" }),
      },
      onChange
    );
    this.pins[MICROBIT_HAL_PIN_P0] = new TouchPin("pin0", null, onChange);
    this.pins[MICROBIT_HAL_PIN_P1] = new TouchPin("pin1", null, onChange);
    this.pins[MICROBIT_HAL_PIN_P2] = new TouchPin("pin2", null, onChange);
    this.pins[MICROBIT_HAL_PIN_P3] = new TouchPin("pin3", null, onChange);
    this.pins[MICROBIT_HAL_PIN_P4] = new StubPin("pin4");
    this.pins[MICROBIT_HAL_PIN_P5] = new StubPin("pin5");
    this.pins[MICROBIT_HAL_PIN_P6] = new StubPin("pin6");
    this.pins[MICROBIT_HAL_PIN_P7] = new StubPin("pin7");
    this.pins[MICROBIT_HAL_PIN_P8] = new StubPin("pin8");
    this.pins[MICROBIT_HAL_PIN_P9] = new StubPin("pin9");
    this.pins[MICROBIT_HAL_PIN_P10] = new StubPin("pin10");
    this.pins[MICROBIT_HAL_PIN_P11] = new StubPin("pin11");
    this.pins[MICROBIT_HAL_PIN_P12] = new StubPin("pin12");
    this.pins[MICROBIT_HAL_PIN_P13] = new StubPin("pin13");
    this.pins[MICROBIT_HAL_PIN_P14] = new StubPin("pin14");
    this.pins[MICROBIT_HAL_PIN_P15] = new StubPin("pin15");
    this.pins[MICROBIT_HAL_PIN_P16] = new StubPin("pin16");
    this.pins[MICROBIT_HAL_PIN_P19] = new StubPin("pin19");
    this.pins[MICROBIT_HAL_PIN_P20] = new StubPin("pin20");
    this.pins[MICROBIT_HAL_PIN_RGB] = new StubPin("pinRGB");

    this.audio = new Audio();
    this.temperature = new RangeSensor("temperature", -5, 50, 21, "°C");
    this.accelerometer = new Accelerometer(onChange);
    this.compass = new Compass();
    this.microphone = new Microphone(
      this.svg.querySelector("#LitMicrophone")!,
      onChange
    );

    const currentTimeMillis = this.ticksMilliseconds.bind(this);
    this.radio = new Radio(
      this.notifications.onRadioOutput.bind(this.notifications),
      onChange,
      currentTimeMillis
    );
    this.dataLogging = new DataLogging(
      currentTimeMillis,
      this.notifications.onLogOutput,
      this.notifications.onSerialOutput,
      this.notifications.onLogDelete,
      onChange
    );

    this.stoppedOverlay = document.querySelector(".play-button-container")!;
    this.playButton = document.querySelector(".play-button")!;
    this.initializePlayButton();
    // We start stopped.
    this.displayStoppedState();
    this.playButton.addEventListener("click", async () => {
      await this.audio.createAudioContextFromUserInteraction();
      this.notifications.onRequestFlash();
    });

    this.updateTranslationsInternal();
    this.notifications.onReady(this.getState());
  }

  private async createModule(): Promise<ModuleWrapper> {
    const wrapped = await window.createModule({
      board: this,
      fs: this.fs,
      conversions,
      noInitialRun: true,
      instantiateWasm,
    });
    const module = new ModuleWrapper(wrapped);
    this.audio.initializeCallbacks({
      defaultAudioCallback: wrapped._microbit_hal_audio_ready_callback,
      speechAudioCallback: wrapped._microbit_hal_audio_speech_ready_callback,
    });
    this.accelerometer.initializeCallbacks(
      wrapped._microbit_hal_gesture_callback
    );
    this.microphone.initializeCallbacks(
      wrapped._microbit_hal_level_detector_callback
    );
    return module;
  }

  updateTranslations(language: string, translations: Record<string, string>) {
    this.language = language;
    this.translations = translations;
    this.updateTranslationsInternal();
  }

  private updateTranslationsInternal() {
    document.documentElement.lang = this.language;
    this.playButton.ariaLabel = this.formattedMessage({
      id: "start-simulator",
    });
    this.buttons.forEach((b) => b.updateTranslations());
    this.pins.forEach((b) => b.updateTranslations());
  }

  getState(): State {
    return {
      radio: this.radio.state,
      buttonA: this.buttons[0].state,
      buttonB: this.buttons[1].state,
      pinLogo: this.pins[MICROBIT_HAL_PIN_FACE].state,
      pin0: this.pins[MICROBIT_HAL_PIN_P0].state,
      pin1: this.pins[MICROBIT_HAL_PIN_P1].state,
      pin2: this.pins[MICROBIT_HAL_PIN_P2].state,
      pin3: this.pins[MICROBIT_HAL_PIN_P3].state,

      accelerometerX: this.accelerometer.state.accelerometerX,
      accelerometerY: this.accelerometer.state.accelerometerY,
      accelerometerZ: this.accelerometer.state.accelerometerZ,
      gesture: this.accelerometer.state.gesture,

      compassX: this.compass.state.compassX,
      compassY: this.compass.state.compassY,
      compassZ: this.compass.state.compassZ,
      compassHeading: this.compass.state.compassHeading,

      lightLevel: this.display.lightLevel,
      dataLogging: this.dataLogging.state,
      soundLevel: this.microphone.soundLevel,
      temperature: this.temperature,
    };
  }

  setValue(id: string, value: any) {
    switch (id) {
      case "accelerometerX":
      case "accelerometerY":
      case "accelerometerZ":
      case "gesture": {
        this.accelerometer.setValue(id, value);
        break;
      }
      case "compassX":
      case "compassY":
      case "compassZ":
      case "compassHeading": {
        this.compass.setValue(id, value);
        break;
      }
      case "buttonA": {
        this.buttons[0].setValue(value);
        break;
      }
      case "buttonB": {
        this.buttons[1].setValue(value);
        break;
      }
      case "pinLogo": {
        this.pins[MICROBIT_HAL_PIN_FACE].setValue(value);
        break;
      }
      case "pin0": {
        this.pins[MICROBIT_HAL_PIN_P0].setValue(value);
        break;
      }
      case "pin1": {
        this.pins[MICROBIT_HAL_PIN_P1].setValue(value);
        break;
      }
      case "pin2": {
        this.pins[MICROBIT_HAL_PIN_P2].setValue(value);
        break;
      }
      case "pin3": {
        this.pins[MICROBIT_HAL_PIN_P3].setValue(value);
        break;
      }
      case "lightLevel": {
        this.display.lightLevel.setValue(value);
        break;
      }
      case "soundLevel": {
        this.microphone.setValue(value);
        break;
      }
      case "temperature": {
        this.temperature.setValue(value);
        break;
      }
    }
  }

  ticksMilliseconds() {
    return new Date().getTime() - this.epoch!;
  }

  private initializePlayButton() {
    const params = new URLSearchParams(window.location.search);
    const color = params.get("color");
    if (color) {
      this.playButton.style.color = color;
      this.playButton.style.borderColor = color;
    }
    this.playButton.style.display = "flex";
  }

  private displayRunningState() {
    this.svg.style.opacity = "unset";
    const svgButtons = this.svg.querySelectorAll("[role='button']");
    for (const button of svgButtons) {
      button.setAttribute("tabindex", "0");
    }
    this.stoppedOverlay.style.display = "none";
  }

  private displayStoppedState() {
    this.svg.style.opacity = stoppedOpactity;
    const svgButtons = this.svg.querySelectorAll("[role='button']");
    for (const button of svgButtons) {
      button.setAttribute("tabindex", "-1");
    }
    this.stoppedOverlay.style.display = "flex";
  }

  /**
   * Start the simulator.
   *
   * @returns a promise that resolves when the simulator has stopped.
   */
  private start(): void {
    if (this.runningPromise) {
      throw new Error("Already running!");
    }
    this.runningPromise = this.createRunningPromise();
  }

  private async createRunningPromise() {
    if (this.modulePromise || this.module) {
      throw new Error("Module already exists!");
    }
    clearTimeout(this.pendingRestartTimeout);
    this.pendingRestartTimeout = null;

    this.modulePromise = this.createModule();
    const module = await this.modulePromise;
    this.module = module;
    let panicCode: number | undefined;
    try {
      this.displayRunningState();
      await module.start();
    } catch (e: any) {
      // Take care not to overwrite another kind of stop just because the program
      // called restart or panic.
      if (e instanceof PanicError) {
        if (this.stopKind === StopKind.Default) {
          this.stopKind = StopKind.Panic;
          panicCode = e.code;
        }
      } else if (e instanceof ResetError) {
        if (this.stopKind === StopKind.Default) {
          this.stopKind = StopKind.Reset;
        }
      } else {
        this.notifications.onInternalError(e);
      }
    }
    try {
      module.forceStop();
    } catch (e: any) {
      if (e.name !== "ExitStatus") {
        this.notifications.onInternalError(e);
      }
    }
    // Called by the HAL for normal shutdown but not in error scenarios.
    this.stopComponents();
    this.modulePromise = undefined;
    this.module = undefined;

    switch (this.stopKind) {
      case StopKind.Panic: {
        if (panicCode === undefined) {
          throw new Error("Must be set");
        }
        this.displayPanic(panicCode);
        break;
      }
      case StopKind.Reset: {
        this.pendingRestartTimeout = setTimeout(() => this.start(), 0);
        break;
      }
      case StopKind.BriefStop: {
        // Skip the stopped state.
        break;
      }
      case StopKind.UserStop: /* Fall through */
      case StopKind.Default: {
        this.displayStoppedState();
        break;
      }
      default: {
        throw new Error("Unknown stop kind: " + this.stopKind);
      }
    }
    this.stopKind = StopKind.Default;
    this.runningPromise = undefined;
  }

  /**
   * Stop the simulator.
   *
   * This cancels any pending restart or panic requested by the program.
   *
   * @param brief If true the stopped UI is not shown.
   * @returns A promise that resolves when the simulator is stopped.
   */
  async stop(brief: boolean = false): Promise<void> {
    // Preemptively stop audio so that we don't call into WASM for more data
    this.audio.boardStopped();

    if (this.panicTimeout) {
      clearTimeout(this.panicTimeout);
      this.panicTimeout = null;
      this.display.clear();
      if (!brief) {
        this.displayStoppedState();
      }
    }
    if (this.pendingRestartTimeout) {
      clearTimeout(this.pendingRestartTimeout);
      this.pendingRestartTimeout = null;
      if (!brief) {
        this.displayStoppedState();
      }
    }
    if (this.modulePromise) {
      this.stopKind = brief ? StopKind.BriefStop : StopKind.UserStop;
      // Avoid this.module as we might still be creating it (async).
      const module = await this.modulePromise;
      module.requestStop();
      this.modulePromise = undefined;
      this.module = undefined;
      // Ctrl-C, Ctrl-D to interrupt the main loop.
      this.writeSerialInput("\x03\x04");
    }
    return this.runningPromise;
  }

  /**
   * An external reset.
   */
  async reset(): Promise<void> {
    await this.stop(true);
    this.start();
  }

  async flash(filesystem: Record<string, Uint8Array>): Promise<void> {
    const flashFileSystem = () => {
      this.fs.clear();
      Object.entries(filesystem).forEach(([name, value]) => {
        const idx = this.fs.create(name);
        this.fs.write(idx, value, true);
      });
      this.dataLogging.delete();
    };
    // Ensure it's stopped before flash.
    await this.stop(true);
    flashFileSystem();
    return this.start();
  }

  throwPanic(code: number): void {
    throw new PanicError(code);
  }

  throwReset(): void {
    throw new ResetError();
  }

  displayPanic(code: number): void {
    const sad = [
      [9, 9, 0, 9, 9],
      [9, 9, 0, 9, 9],
      [0, 0, 0, 0, 0],
      [0, 9, 9, 9, 0],
      [9, 0, 0, 0, 9],
    ];
    // Extracted via display.get_pixel.
    const digitFont = [
      [
        [0, 9, 9, 0, 0],
        [9, 0, 0, 9, 0],
        [9, 0, 0, 9, 0],
        [9, 0, 0, 9, 0],
        [0, 9, 9, 0, 0],
      ],
      [
        [0, 0, 9, 0, 0],
        [0, 9, 9, 0, 0],
        [0, 0, 9, 0, 0],
        [0, 0, 9, 0, 0],
        [0, 9, 9, 9, 0],
      ],
      [
        [9, 9, 9, 0, 0],
        [0, 0, 0, 9, 0],
        [0, 9, 9, 0, 0],
        [9, 0, 0, 0, 0],
        [9, 9, 9, 9, 0],
      ],
      [
        [9, 9, 9, 9, 0],
        [0, 0, 0, 9, 0],
        [0, 0, 9, 0, 0],
        [9, 0, 0, 9, 0],
        [0, 9, 9, 0, 0],
      ],
      [
        [0, 0, 9, 9, 0],
        [0, 9, 0, 9, 0],
        [9, 0, 0, 9, 0],
        [9, 9, 9, 9, 9],
        [0, 0, 0, 9, 0],
      ],
      [
        [9, 9, 9, 9, 9],
        [9, 0, 0, 0, 0],
        [9, 9, 9, 9, 0],
        [0, 0, 0, 0, 9],
        [9, 9, 9, 9, 0],
      ],
      [
        [0, 0, 0, 9, 0],
        [0, 0, 9, 0, 0],
        [0, 9, 9, 9, 0],
        [9, 0, 0, 0, 9],
        [0, 9, 9, 9, 0],
      ],
      [
        [9, 9, 9, 9, 9],
        [0, 0, 0, 9, 0],
        [0, 0, 9, 0, 0],
        [0, 9, 0, 0, 0],
        [9, 0, 0, 0, 0],
      ],
      [
        [0, 9, 9, 9, 0],
        [9, 0, 0, 0, 9],
        [0, 9, 9, 9, 0],
        [9, 0, 0, 0, 9],
        [0, 9, 9, 9, 0],
      ],
      [
        [0, 9, 9, 9, 0],
        [9, 0, 0, 0, 9],
        [0, 9, 9, 9, 0],
        [0, 0, 9, 0, 0],
        [0, 9, 0, 0, 0],
      ],
    ];
    // Three digit code with leading zero if required.
    // For larger values we just display the last three digits.
    let digits = code.toString();
    digits = digits.slice(-3);
    const prefix = "0".repeat(3 - digits.length);
    digits = prefix + digits;
    const frames = [
      sad,
      ...Array.from(digits).map((d) => digitFont[parseInt(d, 10)]),
    ];
    let nextFrameIndex = 0;
    const showNextFrame = () => {
      this.display.show(frames[nextFrameIndex++ % frames.length]);
      this.panicTimeout = setTimeout(() => {
        this.display.clear();
        this.panicTimeout = setTimeout(showNextFrame, 60);
      }, 600);
    };
    showNextFrame();
  }

  mute() {
    this.audio.mute();
  }

  unmute() {
    this.audio.unmute();
  }

  writeSerialInput(text: string) {
    for (let i = 0; i < text.length; i++) {
      this.serialInputBuffer.push(text.charCodeAt(i));
    }
  }

  /**
   * Read a character code from the serial input buffer or -1 if none.
   */
  readSerialInput(): number {
    return this.serialInputBuffer.shift() ?? -1;
  }

  writeSerialOutput(text: string): void {
    // Avoid the Ctrl-C, Ctrl-D output when we request a stop.
    if (this.modulePromise) {
      this.notifications.onSerialOutput(text);
    }
  }

  writeRadioRxBuffer(packet: Uint8Array): number {
    if (!this.module) {
      throw new Error("Must be running as called via HAL");
    }
    return this.module.writeRadioRxBuffer(packet);
  }

  // Calliope RGB Simulator
  writeRGBLEDs(pin: number, buffer: Uint8Array): void {
    writeRGBLEDs(this.svg, pin, buffer);
  }

  resetRGBLEDs(){
    resetRGBLEDs(this.svg);
  }
  
  initialize() {
    this.epoch = new Date().getTime();
    this.serialInputBuffer.length = 0;
  }

  stopComponents() {
    this.audio.boardStopped();
    this.buttons.forEach((b) => b.boardStopped());
    this.pins.forEach((p) => p.boardStopped());
    this.display.boardStopped();
    this.accelerometer.boardStopped();
    this.compass.boardStopped();
    this.microphone.boardStopped();
    this.radio.boardStopped();
    this.dataLogging.boardStopped();
    this.serialInputBuffer.length = 0;
   
    // Reset RGB LEDs state
    this.resetRGBLEDs();

    // Nofify of the state resets.
    this.notifications.onStateChange(this.getState());
  }
}

export interface LogEntry {
  // The headings, if they've changed since the last entry.
  // New headings will only be appended.
  headings?: string[];
  // The data, corresponding to the headings.
  data?: string[];
}

export class Notifications {
  constructor(private target: Pick<Window, "postMessage">) {}

  onReady = (state: State) => {
    this.postMessage("ready", {
      state,
    });
  };

  onRequestFlash = () => {
    this.postMessage("request_flash", {});
  };

  onStateChange = (change: Partial<State>) => {
    this.postMessage("state_change", {
      change,
    });
  };

  onSerialOutput = (data: string) => {
    this.postMessage("serial_output", { data });
  };

  onRadioOutput = (data: Uint8Array) => {
    this.postMessage("radio_output", { data });
  };

  onLogOutput = (data: LogEntry) => {
    this.postMessage("log_output", data);
  };

  onLogDelete = () => {
    this.postMessage("log_delete", {});
  };

  onInternalError = (error: any) => {
    this.postMessage("internal_error", { error });
  };

  private postMessage(kind: string, data: any) {
    this.target.postMessage(
      {
        kind,
        ...data,
      },
      "*"
    );
  }
}

export const createMessageListener = (board: Board) => (e: MessageEvent) => {
  if (e.source === window.parent) {
    const { data } = e;
    switch (data.kind) {
      case "config": {
        const { language, translations } = data;
        board.updateTranslations(language, translations);
        break;
      }
      case "flash": {
        const { filesystem } = data;
        if (!isFileSystem(filesystem)) {
          throw new Error("Invalid flash filesystem field.");
        }
        board.flash(filesystem);
        break;
      }
      case "stop": {
        board.stop();
        break;
      }
      case "reset": {
        board.reset();
        break;
      }
      case "mute": {
        board.mute();
        break;
      }
      case "unmute": {
        board.unmute();
        break;
      }
      case "serial_input": {
        if (typeof data.data !== "string") {
          throw new Error("Invalid serial_input data field.");
        }
        board.writeSerialInput(data.data);
        break;
      }
      case "radio_input": {
        if (!(data.data instanceof Uint8Array)) {
          throw new Error("Invalid radio_input data field.");
        }
        board.radio.receive(data.data);
        break;
      }
      case "set_value": {
        const { id, value } = data;
        if (typeof id !== "string") {
          throw new Error(`Invalid id field type: ${id}`);
        }
        board.setValue(id, value);
        break;
      }
    }
  }
};

function isFileSystem(
  fileSystem: any
): fileSystem is Record<string, Uint8Array> {
  if (typeof fileSystem !== "object") {
    return false;
  }
  return Object.entries(fileSystem).every(
    ([k, v]) => typeof k === "string" && v instanceof Uint8Array
  );
}

const fetchWasm = async () => {
  const response = await fetch("./build/firmware.wasm");
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.arrayBuffer();
};

const compileWasm = async () => {
  // Can't use streaming in Safari 14 but would be nice to feature detect.
  return WebAssembly.compile(new Uint8Array(await fetchWasm()));
};

let compiledWasmPromise: Promise<WebAssembly.Module> = compileWasm();

const instantiateWasm = function (imports: any, successCallback: any) {
  // No easy way to communicate failure here so hard to add retries.
  compiledWasmPromise
    .then(async (wasmModule) => {
      const instance = await WebAssembly.instantiate(wasmModule, imports);
      successCallback(instance);
    })
    .catch((e) => {
      console.error("Failed to instantiate WASM");
      console.error(e);
    });
  // Result via callback.
  return {};
};
