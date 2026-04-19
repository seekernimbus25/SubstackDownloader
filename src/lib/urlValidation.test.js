import { assertSafeSubstackTargetUrl } from './urlValidation';

describe('assertSafeSubstackTargetUrl', () => {
  it('allows substack.com subdomains', () => {
    expect(assertSafeSubstackTargetUrl('https://example.substack.com/p/foo').hostname).toBe(
      'example.substack.com'
    );
  });

  it('allows custom-domain Substack publications', () => {
    expect(assertSafeSubstackTargetUrl('https://www.news.aakashg.com/').hostname).toBe(
      'www.news.aakashg.com'
    );
    expect(assertSafeSubstackTargetUrl('https://news.aakashg.com/p/some-post').hostname).toBe(
      'news.aakashg.com'
    );
  });

  it('requires HTTPS', () => {
    expect(() => assertSafeSubstackTargetUrl('http://example.substack.com/p/x')).toThrow(
      'HTTPS'
    );
  });

  it('blocks localhost and private IPs', () => {
    expect(() => assertSafeSubstackTargetUrl('https://localhost/p')).toThrow();
    expect(() => assertSafeSubstackTargetUrl('https://127.0.0.1/')).toThrow();
    expect(() => assertSafeSubstackTargetUrl('https://10.0.0.1/')).toThrow();
    expect(() => assertSafeSubstackTargetUrl('https://192.168.1.1/')).toThrow();
  });
});
