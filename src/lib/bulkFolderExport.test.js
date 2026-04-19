import { fileExistsInDirectory, supportsFolderExport, writeTextFileToDirectory } from './bulkFolderExport';

describe('bulkFolderExport', () => {
  const origWindow = global.window;

  afterEach(() => {
    global.window = origWindow;
  });

  it('supportsFolderExport is false without showDirectoryPicker', () => {
    global.window = {};
    expect(supportsFolderExport()).toBe(false);
  });

  it('supportsFolderExport is true when showDirectoryPicker exists', () => {
    global.window = { showDirectoryPicker: () => {} };
    expect(supportsFolderExport()).toBe(true);
  });

  it('fileExistsInDirectory returns false when getFileHandle rejects NotFoundError', async () => {
    const dir = {
      async getFileHandle() {
        const err = new Error('nope');
        err.name = 'NotFoundError';
        throw err;
      },
    };
    await expect(fileExistsInDirectory(dir, 'x.md')).resolves.toBe(false);
  });

  it('writeTextFileToDirectory writes via createWritable', async () => {
    const writes = [];
    const dir = {
      async getFileHandle(name, opts) {
        expect(opts.create).toBe(true);
        expect(name).toBe('out.md');
        return {
          async createWritable() {
            return {
              async write(chunk) {
                writes.push(chunk);
              },
              async close() {},
            };
          },
        };
      },
    };
    await writeTextFileToDirectory(dir, 'out.md', 'hello');
    expect(writes.join('')).toBe('hello');
  });
});
