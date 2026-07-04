import { execFile } from 'node:child_process';

export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function hardLinuxFolderDialogFailure(error: unknown, stderrText: string): string | null {
  const code = errorCode(error);
  if (code === 'ENOENT') return 'zenity is not installed';
  if (/cannot open display/i.test(stderrText)) return stderrText;
  if (/no such file or directory/i.test(stderrText) && /zenity/i.test(stderrText)) return stderrText;
  return null;
}

const WINDOWS_FOLDER_DIALOG_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$owner = New-Object System.Windows.Forms.Form;',
  "$owner.Text = 'Open Design';",
  '$owner.TopMost = $true;',
  '$owner.ShowInTaskbar = $true;',
  "$owner.StartPosition = 'CenterScreen';",
  '$owner.Width = 1;',
  '$owner.Height = 1;',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
  "$dialog.Description = 'Select a code folder to link';",
  '$dialog.ShowNewFolderButton = $true;',
  'try {',
  '  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
  '} finally {',
  '  $owner.Dispose();',
  '}',
].join(' ');

export function buildWindowsFolderDialogCommand(): NativeFolderDialogCommand {
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-Sta', '-Command', WINDOWS_FOLDER_DIALOG_SCRIPT],
  };
}

export function parseFolderDialogStdout(error: unknown, stdout: string): string | null {
  if (error) {
    return null;
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

export function parseLinuxFolderDialogResult(error: unknown, stdout: string, stderr: string): string | null {
  if (error) {
    const stderrText = stderr.trim();
    const code = errorCode(error);
    const hardFailure = hardLinuxFolderDialogFailure(error, stderrText);
    if (hardFailure) {
      throw new Error(`Could not open folder picker: ${hardFailure}`);
    }
    if (code === 1) return null;
    throw new Error(`Could not open folder picker: ${stderrText || errorMessage(error)}`);
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

/**
 * Opens the OS-native folder picker and resolves the selected absolute path
 * (or null when cancelled/unsupported). Orchestrates the platform command
 * plus the parse/build helpers above. Extracted verbatim from server.ts
 * (strangler-fig slice) so the full native-folder-dialog concern lives in one
 * typechecked module; server.ts imports it back for the nativeDialog deps
 * bundle.
 */
export function openNativeFolderDialog(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    if (platform === 'darwin') {
      // `choose folder` is handled specially by the system: it presents a fully
      // interactive standard navigation panel that reliably takes key focus
      // (unlike a JXA-driven NSOpenPanel from background-only osascript, which
      // renders but can't be clicked). That standard panel already includes a
      // "New Folder" button in the bottom-left, so users can create a folder
      // inline without any extra wiring.
      execFile(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Select a code folder to link")'],
        { timeout: 120_000 },
        (err, stdout) => {
          if (err) return resolve(null);
          const p = stdout.trim().replace(/\/$/, '');
          resolve(p || null);
        },
      );
    } else if (platform === 'linux') {
      execFile(
        'zenity',
        ['--file-selection', '--directory', '--title=Select a code folder to link'],
        { timeout: 120_000 },
        (err, stdout, stderr) => {
          try {
            resolve(parseLinuxFolderDialogResult(err, stdout, stderr));
          } catch (folderDialogError) {
            reject(folderDialogError);
          }
        },
      );
    } else if (platform === 'win32') {
      const command = buildWindowsFolderDialogCommand();
      execFile(command.command, command.args, { timeout: 120_000 }, (err, stdout) => {
        resolve(parseFolderDialogStdout(err, stdout));
      });
    } else {
      resolve(null);
    }
  });
}
