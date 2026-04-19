/**
 * Client-side helpers for File System Access API (Chromium).
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
 */

export function supportsFolderExport() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/**
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} name
 * @returns {Promise<boolean>}
 */
export async function fileExistsInDirectory(dirHandle, name) {
  try {
    await dirHandle.getFileHandle(name);
    return true;
  } catch (e) {
    if (e?.name === 'NotFoundError') return false;
    throw e;
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<Set<string>>}
 */
export async function listDirectoryFilenames(dirHandle) {
  if (!dirHandle || typeof dirHandle.entries !== 'function') {
    return new Set();
  }
  const names = new Set();
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle?.kind === 'file') {
      names.add(name);
    }
  }
  return names;
}

/**
 * Accepts both dated and undated slug-based markdown names.
 * This helps resume when Substack reports different dates between list and full post endpoints.
 *
 * @param {Set<string>} filenames
 * @param {string} slug
 * @returns {boolean}
 */
export function hasMarkdownForSlug(filenames, slug) {
  if (!slug || !filenames?.size) return false;
  const escaped = escapeRegex(slug);
  const pattern = new RegExp(`^(?:\\d{4}-\\d{2}-\\d{2}-)?${escaped}\\.md$`);
  for (const filename of filenames) {
    if (pattern.test(filename)) return true;
  }
  return false;
}

/**
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} name
 * @param {string} contents
 */
export async function writeTextFileToDirectory(dirHandle, name, contents) {
  const fileHandle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}
