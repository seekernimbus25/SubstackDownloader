/**
 * Substack session cookies (see e.g. carlvellotti/substack-downloader):
 * - Hosts on *.substack.com use `substack.sid`
 * - Custom domains use `connect.sid` on the publication origin
 */

/** @param {string} hostname URL hostname (no port), e.g. www.foo.com or bar.substack.com */
export function isSubstackHostedHostname(hostname) {
  const host = (hostname || '').toLowerCase();
  return host === 'substack.com' || host.endsWith('.substack.com');
}

/**
 * @param {string} hostname
 * @returns {'substack.sid' | 'connect.sid'}
 */
export function substackSessionCookieName(hostname) {
  return isSubstackHostedHostname(hostname) ? 'substack.sid' : 'connect.sid';
}

/**
 * `Cookie` header for Substack API/HTML fetches.
 * @param {string} hostname publication or post hostname
 * @param {string} sessionValue raw cookie value
 * @returns {Record<string, string> | {}}}
 */
export function substackSessionCookieHeader(hostname, sessionValue) {
  if (!sessionValue) return {};
  const name = substackSessionCookieName(hostname);
  return { Cookie: `${name}=${sessionValue}` };
}

export const SUBSTACK_SESSION_REJECTED_MESSAGE =
  'Invalid or expired session. Copy a fresh cookie: substack.sid for *.substack.com, or connect.sid for custom-domain sites.';

export const SUBSTACK_SESSION_HINT_SHORT =
  'substack.sid (*.substack.com) or connect.sid (custom domains)';
