/** @module core/files
 * Small filesystem predicates shared by brand catalog and finalization code.
 * These primitives are dependency-free within the brands domain.
 */

import fs from 'node:fs';

/** True when the path exists and is a regular file. */
export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** True when the path exists and is a directory. */
export function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
