import * as path from 'path';
import * as os from 'os';

/** Get the GOPATH, defaulting to ~/go */
export function getGopath(): string {
  return process.env.GOPATH || path.join(os.homedir(), 'go');
}

/** Get the module cache path */
export function getModCachePath(): string {
  return path.join(getGopath(), 'pkg', 'mod');
}
