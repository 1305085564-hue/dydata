import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

type EventListenerFn = (event: FakeEvent) => void;

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

export class FakeNode {
  nodeType: number;
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  ownerDocument: FakeDocument;

  constructor(nodeType: number, doc: FakeDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = doc;
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): FakeNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 ? (this.parentNode.childNodes[idx + 1] ?? null) : null;
  }

  appendChild<T extends FakeNode>(child: T): T {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore<T extends FakeNode>(child: T, ref: FakeNode | null): T {
    if (!ref) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const idx = this.childNodes.indexOf(ref);
    child.parentNode = this;
    if (idx === -1) this.childNodes.push(child);
    else this.childNodes.splice(idx, 0, child);
    return child;
  }

  removeChild<T extends FakeNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }
}

export class FakeText extends FakeNode {
  data: string;

  constructor(text: string, doc: FakeDocument) {
    super(3, doc);
    this.data = text;
  }

  get textContent() {
    return this.data;
  }

  set textContent(v: string) {
    this.data = String(v);
  }

  get nodeValue() {
    return this.data;
  }

  set nodeValue(v: string) {
    this.data = String(v);
  }
}

export class FakeComment extends FakeNode {
  data: string;

  constructor(data: string, doc: FakeDocument) {
    super(8, doc);
    this.data = data;
  }
}

function matchesSimpleSelector(el: FakeElement, sel: string): boolean {
  const attrMatch = sel.match(/^([a-z0-9-]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/i);
  if (attrMatch) {
    const [, tag, attr, expected] = attrMatch;
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    const val = el.getAttribute(attr);
    return expected !== undefined ? val === expected : val !== null;
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

export class FakeElement extends FakeNode {
  tagName: string;
  namespaceURI: string;
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, EventListenerFn[]> = {};
  disabled = false;
  clientWidth = 0;
  scrollWidth = 0;
  scrollLeft = 0;

  constructor(tag: string, doc: FakeDocument, ns = "http://www.w3.org/1999/xhtml") {
    super(1, doc);
    this.tagName = ns === "http://www.w3.org/1999/xhtml" ? tag.toUpperCase() : tag;
    this.namespaceURI = ns;
  }

  get nodeName() {
    return this.tagName;
  }

  get firstElementChild(): FakeElement | null {
    return (this.childNodes.find((n): n is FakeElement => n instanceof FakeElement) ?? null);
  }

  get className() {
    return this.attributes.class ?? "";
  }

  set className(value: string) {
    this.attributes.class = value;
  }

  get href() {
    return this.attributes.href ?? "";
  }

  set href(value: string) {
    this.attributes.href = value;
  }

  setAttribute(key: string, value: string) {
    this.attributes[key] = String(value);
  }

  getAttribute(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
  }

  removeAttribute(key: string) {
    delete this.attributes[key];
  }

  hasAttribute(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attributes, key);
  }

  addEventListener(type: string, fn: EventListenerFn) {
    (this.listeners[type] ??= []).push(fn);
  }

  removeEventListener(type: string, fn: EventListenerFn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }

  dispatchEvent(event: FakeEvent): boolean {
    return dispatchBubble(this, event);
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, right: this.clientWidth, bottom: 0, width: this.clientWidth, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  }

  get textContent(): string {
    return this.childNodes
      .map((child) => {
        if (child instanceof FakeText || child instanceof FakeElement) return child.textContent;
        return "";
      })
      .join("");
  }

  set textContent(value: string) {
    this.childNodes = value ? [new FakeText(String(value), this.ownerDocument)] : [];
  }

  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (node: FakeNode) => {
      for (const child of node.childNodes) {
        if (child instanceof FakeElement) {
          if (matchesSimpleSelector(child, selector)) out.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function dispatchBubble(start: FakeElement, event: FakeEvent): boolean {
  event.target ??= start;
  let cur: FakeNode | null = start;
  while (cur && !event._propagationStopped) {
    if (cur instanceof FakeElement) {
      event.currentTarget = cur;
      for (const fn of [...(cur.listeners[event.type] ?? [])]) {
        fn(event);
      }
    }
    if (!event.bubbles) break;
    cur = cur.parentNode;
  }
  return !event.defaultPrevented;
}

export class FakeDocument extends FakeNode {
  documentElement: FakeElement;
  body: FakeElement;
  listeners: Record<string, EventListenerFn[]> = {};

  constructor() {
    super(9, null as unknown as FakeDocument);
    this.ownerDocument = this;
    this.documentElement = new FakeElement("html", this);
    this.body = new FakeElement("body", this);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string) {
    return new FakeElement(tag, this);
  }

  createElementNS(ns: string, tag: string) {
    return new FakeElement(tag, this, ns);
  }

  createTextNode(text: string) {
    return new FakeText(text, this);
  }

  createComment(data: string) {
    return new FakeComment(data, this);
  }

  addEventListener(type: string, fn: EventListenerFn) {
    (this.listeners[type] ??= []).push(fn);
  }

  removeEventListener(type: string, fn: EventListenerFn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
}

interface ResizeObserverRecord {
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

const GLOBAL_KEYS = [
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

class MapLike<K extends string, V> {
  private store: Record<string, V> = Object.create(null);
  set(k: K, v: V) {
    this.store[k] = v;
  }
  get(k: K): V | undefined {
    return this.store[k];
  }
}
