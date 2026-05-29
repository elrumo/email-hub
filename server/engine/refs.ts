/**
 * Data references — the "no-code" way steps read each other's output.
 *
 * A ref looks like "{{ steps.metrics.diskFree }}" or "{{ trigger.fqdn }}".
 * Resolution is pure path lookup against a scope object — there is NO code
 * evaluation, so this is safe with untrusted flow definitions.
 *
 * - A string that is EXACTLY one ref ("{{ x.y }}") resolves to the raw value
 *   (number/object/etc.), preserving type.
 * - A string with embedded refs ("disk {{ x.y }}GB") is interpolated to a
 *   string.
 * - Non-string values pass through unchanged.
 */

const FULL_REF = /^\{\{\s*([^}]+?)\s*\}\}$/;
const EMBEDDED_REF = /\{\{\s*([^}]+?)\s*\}\}/g;

export interface Scope {
  trigger: Record<string, unknown>;
  steps: Record<string, unknown>;
  /** forEach loop variables, by `as` name */
  [k: string]: unknown;
}

function lookup(path: string, scope: Scope): unknown {
  const parts = path.split(".").map((p) => p.trim());
  let cur: unknown = scope;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    // support array index access via numeric key
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Resolve a single value (string with refs, or any other JSON value). */
export function resolveValue(value: unknown, scope: Scope): unknown {
  if (typeof value !== "string") {
    if (Array.isArray(value)) return value.map((v) => resolveValue(v, scope));
    if (value && typeof value === "object") return resolveObject(value as Record<string, unknown>, scope);
    return value;
  }

  const full = value.match(FULL_REF);
  if (full) return lookup(full[1] ?? "", scope);

  // embedded — interpolate to string
  return value.replace(EMBEDDED_REF, (_, path: string | undefined) => {
    const v = lookup(path ?? "", scope);
    return v == null ? "" : String(v);
  });
}

/** Resolve every value in an object (one level deep recursion via resolveValue). */
export function resolveObject(
  obj: Record<string, unknown>,
  scope: Scope
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = resolveValue(v, scope);
  return out;
}

/** Is this string a ref (full or embedded)? Used by the builder UI. */
export function isRef(value: unknown): boolean {
  return typeof value === "string" && EMBEDDED_REF.test(value);
}
