/**
 * Validates URLs we fetch server-side. Substack uses *.substack.com and many publications
 * use custom domains (e.g. https://www.slowboring.com/). We allow HTTPS publication URLs
 * while blocking common SSRF targets (localhost, private IPs, link-local).
 *
 * @param {string} urlString
 * @returns {URL}
 */
export function assertSafeSubstackTargetUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('URL must use HTTPS');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Invalid host');
  }
  if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    throw new Error('Invalid host');
  }
  if (
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.corp') ||
    host.endsWith('.lan')
  ) {
    throw new Error('Invalid host');
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = host.match(ipv4);
  if (m) {
    const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (parts.some((n) => n > 255)) {
      throw new Error('Invalid host');
    }
    const [a, b] = parts;
    if (a === 0 || a === 127 || a === 10) {
      throw new Error('Invalid host');
    }
    if (a === 169 && b === 254) {
      throw new Error('Invalid host');
    }
    if (a === 172 && b >= 16 && b <= 31) {
      throw new Error('Invalid host');
    }
    if (a === 192 && b === 168) {
      throw new Error('Invalid host');
    }
    if (a === 100 && b >= 64 && b <= 127) {
      throw new Error('Invalid host');
    }
  }

  return parsed;
}
