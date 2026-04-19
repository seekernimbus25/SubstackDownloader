import { POST } from './route';
import { fetchArticle } from '../../../lib/substack.js';

jest.mock('../../../lib/substack.js', () => ({
  fetchArticle: jest.fn(),
}));

describe('POST /api/convert', () => {
  beforeEach(() => {
    fetchArticle.mockReset();
  });

  it('returns 400 when browserCapture is true without sid', async () => {
    const req = {
      json: async () => ({
        url: 'https://example.substack.com/p/foo',
        format: 'md',
        browserCapture: true,
        sid: '',
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/browserCapture|substack\.sid/i);
    expect(fetchArticle).not.toHaveBeenCalled();
  });

  it('returns browser_capture in JSON when fetchArticle sets it', async () => {
    fetchArticle.mockResolvedValueOnce({
      markdown: '# Title',
      title: 'Title',
      warnings: null,
      html_body_fallback: true,
      browser_capture: true,
    });
    const req = {
      json: async () => ({
        url: 'https://example.substack.com/p/foo',
        sid: 'my-sid',
        format: 'md',
        browserCapture: true,
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.browser_capture).toBe(true);
    expect(body.markdown).toContain('Title');
    expect(fetchArticle).toHaveBeenCalledWith('https://example.substack.com/p/foo', 'my-sid', {
      browserCapture: true,
    });
  });
});
