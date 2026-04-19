/**
 * URLs and labels for the "Connect Substack" modal (client-only UX helpers).
 */

/**
 * @param {string} validationUrl publication or article URL the user entered
 * @returns {null | {
 *   origin: string,
 *   publicationLoginUrl: string,
 *   substackAccountSignInUrl: string,
 *   expectedCookieName: 'substack.sid' | 'connect.sid',
 *   isSubstackHost: boolean,
 * }}
 */
export function getConnectModalHints(validationUrl) {
  if (!validationUrl || typeof validationUrl !== 'string') return null;
  try {
    const u = new URL(validationUrl.trim());
    const origin = u.origin;
    const host = u.hostname;
    const isSubstackHost = host === 'substack.com' || host.endsWith('.substack.com');
    return {
      origin,
      publicationLoginUrl: `${origin}/login`,
      substackAccountSignInUrl: 'https://substack.com/sign-in',
      expectedCookieName: isSubstackHost ? 'substack.sid' : 'connect.sid',
      isSubstackHost,
    };
  } catch {
    return null;
  }
}
