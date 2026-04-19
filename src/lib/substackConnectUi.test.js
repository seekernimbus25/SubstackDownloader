import { getConnectModalHints } from './substackConnectUi';

describe('getConnectModalHints', () => {
  it('returns substack.sid for *.substack.com', () => {
    const h = getConnectModalHints('https://foo.substack.com/p/x');
    expect(h.isSubstackHost).toBe(true);
    expect(h.expectedCookieName).toBe('substack.sid');
    expect(h.publicationLoginUrl).toBe('https://foo.substack.com/login');
  });

  it('returns connect.sid for custom domains', () => {
    const h = getConnectModalHints('https://news.example.com/p/y');
    expect(h.isSubstackHost).toBe(false);
    expect(h.expectedCookieName).toBe('connect.sid');
  });
});
