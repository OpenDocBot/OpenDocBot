import "ses";

/**
 * Runs model-generated code in a SES compartment with a curated global set and
 * a membrane over the host objects it is given.
 *
 * IMPORTANT: we intentionally do not call `lockdown()`. SES lockdown replaces
 * the intrinsic `Function` with a tamed copy and drops extra statics such as
 * Office.js's `Function._validateParams`, which breaks every Office.js call
 * afterwards. Without lockdown the compartment still gets its own global (no
 * `window`, `fetch`, `localStorage`, ...), but the classic
 * `({}).constructor.constructor(...)` escape reaches the host realm, so a
 * static filter rejects the dangerous tokens before evaluation. This is
 * defence in depth, not a formally verifiable sandbox.
 */

const BLOCKED_PROPERTIES = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "session",
  "batch",
]);

const BLOCKED_PREFIXES = ["_", "m_"];

/**
 * Source tokens that must never reach the evaluator. They are the escape and
 * exfiltration primitives a prompt-injected script would use. Keep these
 * high-signal (property access and calls, not bare English words) so ordinary
 * document text inside string literals is not rejected.
 */
const BLOCKED_CODE: Array<[RegExp, string]> = [
  [/__proto__/, "__proto__"],
  [/\.constructor\b/, ".constructor"],
  [/\[\s*["']constructor["']\s*\]/, '["constructor"]'],
  [/\bglobalThis\b/, "globalThis"],
  [/\bfetch\s*\(/, "fetch()"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\blocalStorage\b/, "localStorage"],
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\bindexedDB\b/, "indexedDB"],
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\b/, "new Function"],
  [/\bFunction\s*\(/, "Function()"],
  [/\bReflect\s*\./, "Reflect"],
  [/\bProxy\s*\(/, "Proxy()"],
  [/\bimport\s*\(/, "dynamic import"],
  [/\bimportScripts\b/, "importScripts"],
  [/\bpostMessage\b/, "postMessage"],
  [/\bprocess\s*\./, "process"],
  [/\brequire\s*\(/, "require()"],
];

/**
 * Value tags we pass through unwrapped. Proxying these (especially typed
 * arrays, promises, and dates) breaks their built-in behaviour, and they carry
 * no secrets. Plain objects and functions are wrapped.
 */
const PASSTHROUGH_TAGS = new Set([
  "[object Date]",
  "[object RegExp]",
  "[object Map]",
  "[object Set]",
  "[object WeakMap]",
  "[object WeakSet]",
  "[object Promise]",
  "[object Error]",
  "[object ArrayBuffer]",
  "[object DataView]",
  "[object Blob]",
  "[object File]",
]);

export class SandboxSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxSecurityError";
  }
}

function isBlockedProperty(prop: string | symbol): boolean {
  if (typeof prop !== "string") return false;
  if (BLOCKED_PROPERTIES.has(prop)) return true;
  return BLOCKED_PREFIXES.some((prefix) => prop.startsWith(prefix));
}

function assertSafeCode(code: string): void {
  for (const [pattern, label] of BLOCKED_CODE) {
    if (pattern.test(code)) {
      throw new SandboxSecurityError(
        `Sandbox blocked the script: '${label}' is not allowed inside execute_office_js / edit_slide_xml.`,
      );
    }
  }
}

function shouldPassThrough(value: object): boolean {
  // Functions are always wrapped so calls unwrap `this` and the arguments.
  if (typeof value === "function") return false;
  if (Array.isArray(value)) return true;
  if (ArrayBuffer.isView(value)) return true;
  if (PASSTHROUGH_TAGS.has(Object.prototype.toString.call(value))) return true;
  // Thenables must stay raw: awaiting a proxy would call a wrapped `then`.
  if (typeof (value as { then?: unknown }).then === "function") return true;
  return false;
}

interface Membrane {
  wrap<T>(value: T): T;
  unwrap<T>(value: T): T;
}

function createMembrane(): Membrane {
  const proxyByTarget = new WeakMap<object, object>();
  const targetByProxy = new WeakMap<object, object>();

  function wrap<T>(value: T): T {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) {
      return value;
    }
    const object = value as unknown as object;
    if (targetByProxy.has(object)) return value;
    const existing = proxyByTarget.get(object);
    if (existing) return existing as T;
    if (shouldPassThrough(object)) return value;

    const proxy = new Proxy(object, {
      get(target, prop) {
        if (isBlockedProperty(prop)) {
          throw new SandboxSecurityError(
            `IllegalAccessError: access to '${String(prop)}' is blocked inside the sandbox.`,
          );
        }
        // Use the raw target as the receiver so Office.js accessors see the
        // real object, not the proxy.
        return wrap(Reflect.get(target, prop, target));
      },
      set(target, prop, newValue) {
        if (isBlockedProperty(prop)) {
          throw new SandboxSecurityError(
            `IllegalAccessError: access to '${String(prop)}' is blocked inside the sandbox.`,
          );
        }
        return Reflect.set(target, prop, unwrap(newValue), target);
      },
      apply(target, thisArg, args) {
        return wrap(
          Reflect.apply(
            target as (...a: unknown[]) => unknown,
            unwrap(thisArg),
            args.map((arg) => unwrap(arg)),
          ),
        );
      },
      construct(target, args, newTarget) {
        return wrap(
          Reflect.construct(
            target as new (...a: unknown[]) => object,
            args.map((arg) => unwrap(arg)),
            unwrap(newTarget) as new (...a: unknown[]) => object,
          ),
        );
      },
    });

    proxyByTarget.set(object, proxy);
    targetByProxy.set(proxy, object);
    return proxy as T;
  }

  function unwrap<T>(value: T): T {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) {
      return value;
    }
    const target = targetByProxy.get(value as unknown as object);
    return (target ?? value) as T;
  }

  return { wrap, unwrap };
}

/**
 * Verify the compartment shim is available. Unlike `lockdown`, this does not
 * touch the host intrinsics.
 */
export function ensureSandboxReady(): void {
  if (typeof Compartment !== "function") {
    throw new SandboxSecurityError("SES Compartment is unavailable.");
  }
}

function browserGlobals(): Record<string, unknown> {
  const globals: Record<string, unknown> = {
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
  };
  if (typeof atob === "function") globals.atob = atob;
  if (typeof btoa === "function") globals.btoa = btoa;
  if (typeof Blob !== "undefined") globals.Blob = Blob;
  return globals;
}

export interface SandboxOptions {
  /** Host objects exposed to the sandbox (e.g. Office, Word, Excel, PowerPoint). */
  globals?: Record<string, unknown>;
}

/**
 * A reusable sandbox factory. Each call to `run` evaluates the code in the same
 * compartment, so globals are shared between runs of the same instance.
 */
export class Sandbox {
  private readonly membrane: Membrane;
  private readonly compartment: Compartment;

  constructor(options: SandboxOptions = {}) {
    ensureSandboxReady();
    this.membrane = createMembrane();

    const globals: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(browserGlobals())) {
      if (value !== undefined) globals[name] = this.membrane.wrap(value);
    }
    for (const [name, value] of Object.entries(options.globals ?? {})) {
      if (value !== undefined) globals[name] = this.membrane.wrap(value);
    }
    globals.console = this.membrane.wrap(console);

    this.compartment = new Compartment(globals);
  }

  /** Expose a host value to the sandbox through the membrane. */
  wrap<T>(value: T): T {
    return this.membrane.wrap(value);
  }

  /**
   * Evaluate `code` as the body of an async function taking one parameter and
   * call it with `argument` (wrapped by the membrane).
   */
  async run(code: string, parameter: string, argument: unknown): Promise<unknown> {
    assertSafeCode(code);
    const source = `(async function(${parameter}) {\n${code}\n})`;
    const fn = this.compartment.evaluate(source) as (arg: unknown) => Promise<unknown>;
    return await fn(this.membrane.wrap(argument));
  }
}
