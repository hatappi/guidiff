import { join } from 'node:path';
import { StateFileSchema, type FileDiff, type FileState, type StateFile } from '@guidiff/schema';

export function patchHash(patch: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(patch);
  return `sha256:${hasher.digest('hex')}`;
}

function statePath(gitDir: string): string {
  return join(gitDir, 'guidiff', 'state.json');
}

export async function loadState(gitDir: string): Promise<StateFile> {
  const empty: StateFile = { version: 1, files: {} };
  const file = Bun.file(statePath(gitDir));
  if (!(await file.exists())) return empty;
  try {
    return StateFileSchema.parse(JSON.parse(await file.text()));
  } catch {
    return empty; // corrupt or incompatible state is discarded, never fatal
  }
}

export async function saveState(gitDir: string, state: StateFile): Promise<void> {
  await Bun.write(statePath(gitDir), JSON.stringify(state, null, 2));
}

export function reconcileFiles(state: StateFile, files: FileDiff[]): Map<string, FileState> {
  const result = new Map<string, FileState>();
  for (const f of files) {
    const entry = state.files[f.path];
    if (!entry || !entry.viewed) {
      result.set(f.path, { viewed: false, changedSinceLastView: false });
      continue;
    }
    if (entry.patchHash === patchHash(f.patch)) {
      result.set(f.path, { viewed: true, changedSinceLastView: false, lastViewedAt: entry.viewedAt });
    } else {
      result.set(f.path, { viewed: false, changedSinceLastView: true, lastViewedAt: entry.viewedAt });
    }
  }
  return result;
}

export function setViewed(state: StateFile, file: FileDiff, viewed: boolean, now: Date): StateFile {
  const files = { ...state.files };
  if (viewed) {
    files[file.path] = { viewed: true, patchHash: patchHash(file.patch), viewedAt: now.toISOString() };
  } else {
    delete files[file.path];
  }
  return { version: 1, files };
}
