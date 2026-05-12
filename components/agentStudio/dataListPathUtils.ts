/**
 * JSON traversal for Data List field paths (`data[0].id`, `results.items.name`, etc.).
 */

/** Split a path into tokens: `data[0].id` → ['data','0','id']. */
export function tokenizeJsonPath(pathStr: string): string[] {
  const path = pathStr.trim();
  if (!path) return [];

  const out: string[] = [];
  const re = /[^.[\]]+|\[\d+\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    let t = m[0];
    if (t.startsWith('[') && t.endsWith(']')) t = t.slice(1, -1).trim();
    if (t) out.push(t);
  }

  if (out.length > 0) return out;

  return path.split('.').filter(Boolean);
}

export function getAtJsonPath(root: unknown, pathStr: string): unknown {
  const tokens = tokenizeJsonPath(pathStr);
  if (!tokens.length) return root;

  let cur: unknown = root;
  for (const seg of tokens) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(seg)) {
      cur = cur[Number(seg)];
      continue;
    }
    if (typeof cur === 'object' && !Array.isArray(cur) && Object.prototype.hasOwnProperty.call(cur, seg)) {
      cur = (cur as Record<string, unknown>)[seg];
      continue;
    }
    return undefined;
  }
  return cur;
}

const MAX_PATHS = 140;

/** Breadcrumb-style paths for autocomplete (prefix of first array index shown as `[0]`). */
export function collectJsonPathStrings(value: unknown, maxPaths = MAX_PATHS): string[] {
  const out: string[] = [];

  function walk(v: unknown, prefix: string) {
    if (out.length >= maxPaths) return;
    if (v === null) {
      if (prefix) out.push(prefix);
      return;
    }
    const t = typeof v;
    if (t !== 'object') {
      if (prefix) out.push(prefix);
      return;
    }
    if (Array.isArray(v)) {
      if (prefix && v.length === 0) {
        out.push(prefix);
        return;
      }
      const n = Math.min(v.length, 24);
      for (let i = 0; i < n && out.length < maxPaths; i++) {
        walk(v[i], `${prefix}[${i}]`);
      }
      return;
    }
    const keys = Object.keys(v);
    if (keys.length === 0) {
      if (prefix) out.push(prefix);
      return;
    }
    for (const k of keys) {
      if (out.length >= maxPaths) return;
      const next = prefix ? `${prefix}.${k}` : k;
      walk((v as Record<string, unknown>)[k], next);
    }
  }

  walk(value, '');
  return [...new Set(out)].sort((a, b) => a.length - b.length || a.localeCompare(b));
}
