import { POST } from './route';
import { bulkExportFilenameFromListPost, fetchPublicationPostList } from '@/lib/substack';

jest.mock('@/lib/substack', () => ({
  bulkExportFilenameFromListPost: jest.fn((post) => `fn-${post.slug}.md`),
  fetchPublicationPostList: jest.fn(),
}));

describe('POST /api/bulk/list-posts', () => {
  beforeEach(() => {
    fetchPublicationPostList.mockReset();
    bulkExportFilenameFromListPost.mockImplementation((post) => `fn-${post.slug}.md`);
  });

  it('returns 400 when url or sid missing', async () => {
    const req = { json: async () => ({ url: 'https://x.substack.com', sid: '' }) };
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(fetchPublicationPostList).not.toHaveBeenCalled();
  });

  it('returns posts with filenames', async () => {
    fetchPublicationPostList.mockResolvedValueOnce([
      { slug: 'a', title: 'A', post_date: '2024-01-01' },
    ]);
    const req = {
      json: async () => ({ url: 'https://example.substack.com', sid: 's' }),
    };
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.posts[0]).toEqual({
      slug: 'a',
      title: 'A',
      post_date: '2024-01-01',
      filename: 'fn-a.md',
    });
    expect(fetchPublicationPostList).toHaveBeenCalledWith('https://example.substack.com', 's');
  });
});
