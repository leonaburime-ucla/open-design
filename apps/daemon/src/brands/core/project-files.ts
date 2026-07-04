/** @module core/project-files
 * Shared project-file readers used by preview and finalization paths.
 * This core bridge depends only on the daemon project facade, never on sibling brand concerns.
 */

import { readProjectFile } from '../../project/index.js';

/** Read a UTF-8 project file, returning null when it is absent or unreadable. */
export async function readProjectTextOrNull(
  projectsRoot: string,
  projectId: string,
  name: string,
): Promise<string | null> {
  try {
    const file = await readProjectFile(projectsRoot, projectId, name);
    const buf = file?.buffer;
    if (buf === null || buf === undefined) return null;
    return Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  } catch {
    return null;
  }
}
