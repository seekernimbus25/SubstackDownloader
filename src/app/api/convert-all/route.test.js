import { POST } from './route';
import { fetchAllPosts } from '@/lib/substack';

jest.mock('@/lib/substack', () => ({
  fetchAllPosts: jest.fn(),
  addBulkExportFrontmatter: jest.fn((md) => md),
  BULK_SHORT_BODY_WARNING_THRESHOLD: 600,
}));

jest.mock('@/lib/converters', () => ({
  toDocx: jest.fn(),
  toPdf: jest.fn(),
}));

describe('POST /api/convert-all', () => {
  beforeEach(() => {
    fetchAllPosts.mockReset();
  });

  it('returns 400 for invalid slugs payload', async () => {
    const req = {
      json: async () => ({
        url: 'https://example.substack.com',
        sid: 'sid',
        slugs: ['ok', ''],
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/slugs/i);
    expect(fetchAllPosts).not.toHaveBeenCalled();
  });

  it('passes selected slugs to fetchAllPosts', async () => {
    fetchAllPosts.mockResolvedValueOnce({
      entries: [],
      report: { posts_listed: 1, fetch_failures: [] },
    });
    const req = {
      json: async () => ({
        url: 'https://example.substack.com',
        sid: 'sid',
        format: 'md',
        browserCapture: false,
        slugs: ['post-1'],
      }),
    };
    const res = await POST(req);
    expect(fetchAllPosts).toHaveBeenCalledWith(
      'https://example.substack.com',
      'sid',
      expect.objectContaining({ slugs: ['post-1'] })
    );
    expect(res.status).toBe(404);
  });
});
