import {
  isSubstackHostedHostname,
  substackSessionCookieHeader,
  substackSessionCookieName,
} from './substackSession.js';

describe('substackSession', () => {
  it('uses substack.sid on substack.com hosts', () => {
    expect(substackSessionCookieName('foo.substack.com')).toBe('substack.sid');
    expect(substackSessionCookieName('substack.com')).toBe('substack.sid');
    expect(isSubstackHostedHostname('www.substack.com')).toBe(true);
  });

  it('uses connect.sid on custom domains', () => {
    expect(substackSessionCookieName('www.lennysnewsletter.com')).toBe('connect.sid');
    expect(substackSessionCookieName('news.example.com')).toBe('connect.sid');
    expect(isSubstackHostedHostname('lennysnewsletter.com')).toBe(false);
  });

  it('builds Cookie header with the right name', () => {
    expect(substackSessionCookieHeader('x.substack.com', 'abc')).toEqual({
      Cookie: 'substack.sid=abc',
    });
    expect(substackSessionCookieHeader('custom.com', 'xyz')).toEqual({
      Cookie: 'connect.sid=xyz',
    });
    expect(substackSessionCookieHeader('custom.com', '')).toEqual({});
  });
});
