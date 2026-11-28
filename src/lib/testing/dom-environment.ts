import type { ReactNode } from "react";
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import type { EventListenerFn } from "./dom-events";
import { FakeEvent,FakeKeyboardEvent,FakeMouseEvent } from "./dom-events";
import { FakeDocument,FakeElement,FakeNode } from "./dom-nodes";

export interface ResizeObserverRecord {
  callback: () => void;
  targets: Set<FakeElement>;
}

export interface DomTestEnv {
  document: FakeDocument;
  windowListeners: Record<string, EventListenerFn[]>;
  dispatchWindowEvent: (event: FakeEvent) => void;
  triggerResizeObserver: (target?: FakeElement) => void;
  flushAnimationFrames: () => void;
  mount: (element: ReactNode, configureContainer?: (el: FakeElement) => void) => Promise<{
    container: FakeElement;
    unmount: () => Promise<void>;
  }>;
  cleanup: () => void;
}

export const GLOBAL_KEYS = [
  "IS_REACT_ACT_ENVIRONMENT",
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "ResizeObserver",
  "requestAnimationFrame",
] as const;

export function setupDomTestEnv(options?: {
  clipboardWriteText?: (text: string) => Promise<void>;
}): DomTestEnv {
  const previousDescriptors = new MapLike<string, PropertyDescriptor | undefined>();
  for (const key of GLOBAL_KEYS) {
    previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }

  const document = new FakeDocument();
  const windowListeners: Record<string, EventListenerFn[]> = {};
  const resizeObservers: ResizeObserverRecord[] = [];
  const rafQueue: FrameRequestCallback[] = [];

  class FakeResizeObserver {
    private record: ResizeObserverRecord;
    constructor(callback: () => void) {
      this.record = { callback, targets: new Set<FakeElement>() };
      resizeObservers.push(this.record);
    }
    observe(target: FakeElement) {
      this.record.targets.add(target);
    }
    unobserve(target: FakeElement) {
      this.record.targets.delete(target);
    }
    disconnect() {
      this.record.targets.clear();
    }
  }

  const fakeNavigator = {
    userAgent: "node-dom-harness",
    clipboard: {
      writeText: options?.clipboardWriteText ?? (async () => {}),
    },
  };

  const fakeWindow = {
    document,
    navigator: fakeNavigator,
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(type: string, fn: EventListenerFn) {
      (windowListeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: EventListenerFn) {
      windowListeners[type] = (windowListeners[type] ?? []).filter((f) => f !== fn);
    },
    setTimeout: (...args: Parameters<typeof setTimeout>) => globalThis.setTimeout(...args),
    clearTimeout: (id?: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
    HTMLIFrameElement: class {},
    HTMLElement: FakeElement,
    Element: FakeElement,
    Node: FakeNode,
    Event: FakeEvent,
    MouseEvent: FakeMouseEvent,
    KeyboardEvent: FakeKeyboardEvent,
    ResizeObserver: FakeResizeObserver,
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
  };

  const setGlobal = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };

  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setGlobal("window", fakeWindow);
  setGlobal("document", document);
  setGlobal("navigator", fakeNavigator);
  setGlobal("HTMLElement", FakeElement);
  setGlobal("Element", FakeElement);
  setGlobal("Node", FakeNode);
  setGlobal("Event", FakeEvent);
  setGlobal("MouseEvent", FakeMouseEvent);
  setGlobal("KeyboardEvent", FakeKeyboardEvent);
  setGlobal("ResizeObserver", FakeResizeObserver);
  setGlobal("requestAnimationFrame", fakeWindow.requestAnimationFrame);

  const roots: Root[] = [];

  return {
    document,
    windowListeners,
    dispatchWindowEvent(event: FakeEvent) {
      for (const fn of [...(windowListeners[event.type] ?? [])]) {
        fn(event);
      }
    },
    triggerResizeObserver(target?: FakeElement) {
      for (const rec of resizeObservers) {
        if (rec.targets.size === 0) continue;
        if (!target || rec.targets.has(target)) {
          rec.callback();
        }
      }
    },
    flushAnimationFrames() {
      const pending = rafQueue.splice(0, rafQueue.length);
      for (const cb of pending) cb(16);
    },
    async mount(element: ReactNode, configureContainer?: (el: FakeElement) => void) {
      const container = document.createElement("div");
      configureContainer?.(container);
      document.body.appendChild(container);
      let root!: Root;
      await act(async () => {
        root = createRoot(container as unknown as HTMLElement);
        roots.push(root);
        root.render(element);
      });
      return {
        container,
        async unmount() {
          await act(async () => {
            root.unmount();
          });
        },
      };
    },
    cleanup() {
      for (const root of roots) {
        try {
          root.unmount();
        } catch {
          // ignore already unmounted roots
        }
      }
      for (const key of GLOBAL_KEYS) {
        const desc = previousDescriptors.get(key);
        if (desc) {
          Object.defineProperty(globalThis, key, desc);
        } else {
          delete (globalThis as Record<string, unknown>)[key];
        }
      }
    },
  };
}

export class MapLike<K extends string, V> {
  private store: Record<string, V> = Object.create(null);
  set(k: K, v: V) {
    this.store[k] = v;
  }
  get(k: K): V | undefined {
    return this.store[k];
  }
}
