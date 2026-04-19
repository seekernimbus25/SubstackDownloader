import { POST } from './route';
import { addBulkExportFrontmatter, exportBulkPostEntry } from '@/lib/substack';

jest.mock('@/lib/substack', () => ({
  addBulkExportFrontmatter: jest.fn((md, meta) => `---\n${meta?.title || ''}\n---\n${md}`),
  exportBulkPostEntry: jest.fn(),
}));

describe('POST /api/bulk/export-one', () => {
  beforeEach(() => {
    exportBulkPostEntry.mockReset();
    addBulkExportFrontmatter.mockImplementation((md, meta) => `---\n${meta?.title || ''}\n---\n${md}`);
  });

  it('returns 400 when slug missing', async () => {
    const req = {
      json: async () => ({
        url: 'https://example.substack.com',
        sid: 's',
        slug: '',
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(exportBulkPostEntry).not.toHaveBeenCalled();
  });

  it('returns markdown with frontmatter', async () => {
    exportBulkPostEntry.mockResolvedValueOnce({
      filename: '2024-01-01-a.md',
      markdown: '# Hi',
      meta: { title: 'Hi' },
    });
    const req = {
      json: async () => ({
        url: 'https://example.substack.com',
        sid: 's',
        slug: 'a',
        browserCapture: false,
      }),
    };
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filename).toBe('2024-01-01-a.md');
    expect(body.markdown).toContain('Hi');
    expect(exportBulkPostEntry).toHaveBeenCalledWith(
      'https://example.substack.com',
      's',
      'a',
      expect.objectContaining({ browserCapture: false, playwrightContext: null })
    );
  });
});
