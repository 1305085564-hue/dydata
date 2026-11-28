import type { EventListenerFn } from "./dom-events";
import type { FakeEvent } from "./dom-events";

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

export function matchesSimpleSelector(el: FakeElement, sel: string): boolean {
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

export function dispatchBubble(start: FakeElement, event: FakeEvent): boolean {
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
