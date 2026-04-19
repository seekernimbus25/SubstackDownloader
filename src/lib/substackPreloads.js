/**
 * Parses inlined `window._preloads = JSON.parse("...")` from Substack HTML.
 * Shared by server-side fetch upgrade and Playwright capture (avoid circular imports with substack.js).
 */

export function collectBodyHtmlStringsFromPreloads(preloads) {
  const out = [];
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    for (const [k, val] of Object.entries(v)) {
      if (
        (k === 'body_html' || k === 'bodyHtml') &&
        typeof val === 'string' &&
        val.trim()
      ) {
        out.push(val);
      }
      walk(val);
    }
  }
  walk(preloads);
  return out;
}

export function parseWindowPreloadsJson(pageHtml) {
  if (typeof pageHtml !== 'string' || !pageHtml.includes('_preloads')) return null;
  const assignMatch = pageHtml.match(/window\._preloads\s*=\s*JSON\.parse\("/);
  if (!assignMatch || assignMatch.index === undefined) return null;

  let i = assignMatch.index + assignMatch[0].length;
  let out = '';
  while (i < pageHtml.length) {
    const ch = pageHtml[i];
    if (ch === '\\') {
      const next = pageHtml[i + 1];
      if (next === undefined) break;
      switch (next) {
        case '"':
        case '\\':
        case '/':
          out += next;
          i += 2;
          continue;
        case 'b':
          out += '\b';
          i += 2;
          continue;
        case 'f':
          out += '\f';
          i += 2;
          continue;
        case 'n':
          out += '\n';
          i += 2;
          continue;
        case 'r':
          out += '\r';
          i += 2;
          continue;
        case 't':
          out += '\t';
          i += 2;
          continue;
        case 'u': {
          const hex = pageHtml.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            continue;
          }
          break;
        }
        default:
          out += next;
          i += 2;
          continue;
      }
    }
    if (ch === '"') break;
    out += ch;
    i++;
  }
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}
