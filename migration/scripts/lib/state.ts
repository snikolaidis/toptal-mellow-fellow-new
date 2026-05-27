import fs from 'fs';
import path from 'path';
import { STATE_DIR } from './jsonl';

export interface PullState {
  resource: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  recordCount?: number;
  cursor?: string;
  bulkOperationId?: string;
  error?: string;
}

function statePath(resource: string): string {
  return path.join(STATE_DIR, `${resource}.json`);
}

export function readState(resource: string): PullState | null {
  const p = statePath(resource);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as PullState;
}

export function writeState(resource: string, state: PullState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(statePath(resource), JSON.stringify(state, null, 2), 'utf8');
}

export function markRunning(resource: string, extras: Partial<PullState> = {}): void {
  writeState(resource, {
    resource,
    status: 'running',
    startedAt: new Date().toISOString(),
    ...extras,
  });
}

export function markDone(resource: string, recordCount: number): void {
  const current = readState(resource);
  writeState(resource, {
    ...(current || { resource }),
    resource,
    status: 'done',
    finishedAt: new Date().toISOString(),
    recordCount,
  });
}

export function markFailed(resource: string, error: string): void {
  const current = readState(resource);
  writeState(resource, {
    ...(current || { resource }),
    resource,
    status: 'failed',
    error,
    finishedAt: new Date().toISOString(),
  });
}

export function isDone(resource: string): boolean {
  const s = readState(resource);
  return s?.status === 'done';
}
