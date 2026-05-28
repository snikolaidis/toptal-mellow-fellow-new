import fs from 'fs';
import path from 'path';
import readline from 'readline';

export const DATA_DIR = path.resolve(process.cwd(), 'migration/data');
export const STATE_DIR = path.join(DATA_DIR, '_state');

export function dataPath(name: string): string {
  return path.join(DATA_DIR, name);
}

export function ensureDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

export function writeJsonlSync(filePath: string, records: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
  fs.writeFileSync(filePath, content, 'utf8');
}

export function appendJsonlSync(filePath: string, record: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
}

export async function* readJsonl<T = unknown>(filePath: string): AsyncGenerator<T> {
  if (!fs.existsSync(filePath)) return;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed) as T;
  }
}

export function countLines(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').filter((l) => l.trim()).length;
}
