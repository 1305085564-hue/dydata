import type { FakeNode } from "./dom-nodes";

export type EventListenerFn = (event: FakeEvent) => void;

export interface FakeEventInit {
  bubbles?: boolean;
  cancelable?: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  key?: string;
  code?: string;
  repeat?: boolean;
}

export class FakeEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented = false;
  target: FakeNode | null = null;
  currentTarget: FakeNode | null = null;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
  code: string;
  repeat: boolean;
  _propagationStopped = false;

  constructor(type: string, init: FakeEventInit = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.button = init.button ?? 0;
    this.metaKey = init.metaKey ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.shiftKey = init.shiftKey ?? false;
    this.altKey = init.altKey ?? false;
    this.key = init.key ?? "";
    this.code = init.code ?? "";
    this.repeat = init.repeat ?? false;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {
    this._propagationStopped = true;
  }
}

export class FakeKeyboardEvent extends FakeEvent {
  constructor(type: string, init: FakeEventInit = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
  }
}

export class FakeMouseEvent extends FakeEvent {
  constructor(type: string, init: FakeEventInit = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
  }
}
