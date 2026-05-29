import { resolveValue, type Scope } from "./refs";
import type { Comparison, ConditionExpr } from "./types";

/**
 * Evaluate a structured field/operator/value condition against the run scope.
 * No code execution — just typed comparisons. `left` is resolved as a data-ref;
 * `right` is treated as a literal (but may also contain refs).
 */
function compare(c: Comparison, scope: Scope): boolean {
  const left = resolveValue(c.left, scope);

  switch (c.op) {
    case "exists":
      return left !== undefined && left !== null;
    case "notExists":
      return left === undefined || left === null;
    case "truthy":
      return Boolean(left);
    case "falsy":
      return !left;
  }

  const right = resolveValue(c.right, scope);

  switch (c.op) {
    case "eq":
      return looseEq(left, right);
    case "ne":
      return !looseEq(left, right);
    case "lt":
      return num(left) < num(right);
    case "lte":
      return num(left) <= num(right);
    case "gt":
      return num(left) > num(right);
    case "gte":
      return num(left) >= num(right);
    case "contains":
      return String(left ?? "").includes(String(right ?? ""));
    case "notContains":
      return !String(left ?? "").includes(String(right ?? ""));
    default:
      return false;
  }
}

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") {
    const na = num(a);
    const nb = num(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  return String(a) === String(b);
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return Number(v);
}

/** AND of all comparisons. Empty condition = passes. */
export function evalCondition(expr: ConditionExpr | undefined, scope: Scope): boolean {
  if (!expr || !expr.all || expr.all.length === 0) return true;
  return expr.all.every((c) => compare(c, scope));
}
