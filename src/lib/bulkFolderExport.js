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
