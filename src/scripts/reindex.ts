import { appendFileSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import { Meilisearch } from 'meilisearch';
import {
  buildIndexDefinitions,
  rebuildIndex,
  resolveTargets,
  type IndexDefinition,
  type IndexResult,
} from '@/lib/reindex';

// Loaded in this order, and never with override, so precedence matches Next: a real
// shell variable beats .env.local, which beats .env. CI sets everything in the
// environment and ships no env file, so both calls are no-ops there.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_CONFIG = 2;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
const LOCAL_SOURCE_SUFFIX = /\.(local|test)$/;

interface Args {
  index?: string;
  allowRemote: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { allowRemote: false };
  for (const arg of argv) {
    if (arg === '--allow-remote') {
      args.allowRemote = true;
    } else if (arg.startsWith('--index=')) {
      args.index = arg.slice('--index='.length);
    }
  }
  return args;
}

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

function originOf(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname);
}

function isLocalSourceHostname(hostname: string): boolean {
  return isLocalHostname(hostname) || LOCAL_SOURCE_SUFFIX.test(hostname);
}

function fail(message: string, code: number): number {
  console.error(`reindex: ${message}`);
  return code;
}

function writeStepSummary(lines: string[]): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  appendFileSync(path, `${lines.join('\n')}\n`);
}

function summariseResults(target: string, results: Record<string, IndexResult>): string[] {
  const lines = [`### Meilisearch reindex: ${target}`, '', '| Index | Indexed | Deleted | Duration (ms) | Result |', '| --- | --- | --- | --- | --- |'];
  for (const [uid, result] of Object.entries(results)) {
    const outcome = result.ok ? 'ok' : `failed: ${result.error ?? 'unknown error'}`;
    lines.push(`| ${uid} | ${result.indexed} | ${result.deleted} | ${result.durationMs} | ${outcome} |`);
  }
  lines.push('');
  return lines;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  const wpUrl = (process.env.NEXT_PUBLIC_WORDPRESS_URL || '').replace(/\/$/, '');
  const meiliHost = (process.env.MEILISEARCH_HOST || '').replace(/\/$/, '');
  const meiliKey = process.env.MEILISEARCH_ADMIN_KEY || '';

  if (!wpUrl) return fail('NEXT_PUBLIC_WORDPRESS_URL is not set', EXIT_CONFIG);
  if (!meiliHost) return fail('MEILISEARCH_HOST is not set', EXIT_CONFIG);
  if (!meiliKey) return fail('MEILISEARCH_ADMIN_KEY is not set', EXIT_CONFIG);

  const definitions = buildIndexDefinitions(wpUrl);

  if (!args.index) {
    return fail(
      `--index is required (${definitions.map((d) => d.uid).join(', ')}, or all)`,
      EXIT_CONFIG
    );
  }

  const targets = resolveTargets(args.index, definitions);
  if (!targets) {
    return fail(
      `unknown index "${args.index}" (expected ${definitions.map((d) => d.uid).join(', ')}, or all)`,
      EXIT_CONFIG
    );
  }

  const meiliHostname = hostnameOf(meiliHost);
  const wpHostname = hostnameOf(wpUrl);

  if (!meiliHostname) return fail(`MEILISEARCH_HOST is not a valid URL`, EXIT_CONFIG);
  if (!wpHostname) return fail(`NEXT_PUBLIC_WORDPRESS_URL is not a valid URL`, EXIT_CONFIG);

  // Both destinations are printed before anything is written, so a wrong pairing is
  // visible in the log even when the run is allowed. Hosts only, never the key.
  console.log(`reindex: target=${args.index}`);
  console.log(`  meilisearch : ${originOf(meiliHost)}`);
  console.log(`  wordpress   : ${originOf(wpUrl)}`);
  console.log('');

  const meiliIsRemote = !isLocalHostname(meiliHostname);
  const sourceIsLocal = isLocalSourceHostname(wpHostname);

  // Writing a local WordPress into a remote Meilisearch publishes dev content to a
  // shared index, silently and in seconds. There is deliberately no flag to permit
  // it: an override that covers the dangerous case is not a guard. The reverse
  // pairing, local Meilisearch reading from remote WordPress, is a normal dev setup
  // and must keep working, so this check is one-directional on purpose.
  if (meiliIsRemote && sourceIsLocal) {
    return fail(
      `refusing to write local WordPress content (${wpHostname}) into remote Meilisearch (${meiliHostname})`,
      EXIT_CONFIG
    );
  }

  if (meiliIsRemote && !args.allowRemote) {
    return fail(
      `${meiliHostname} is not a local Meilisearch; pass --allow-remote to write to it`,
      EXIT_CONFIG
    );
  }

  const client = new Meilisearch({ host: meiliHost, apiKey: meiliKey });

  let existingUids: Set<string>;
  try {
    const indexes = await client.getRawIndexes({ limit: 1000 });
    existingUids = new Set(indexes.results.map((i) => i.uid));
  } catch (error) {
    return fail(`could not reach Meilisearch: ${(error as Error).message}`, EXIT_FAILED);
  }

  const results: Record<string, IndexResult> = {};
  for (const definition of targets as IndexDefinition[]) {
    const result = await rebuildIndex(client, definition, existingUids);
    results[definition.uid] = result;

    if (result.ok) {
      console.log(
        `  ${definition.uid.padEnd(12)} indexed ${result.indexed}  deleted ${result.deleted}  ${result.durationMs}ms`
      );
    } else {
      console.error(
        `  ${definition.uid.padEnd(12)} FAILED  ${result.error ?? 'unknown error'}  (${result.durationMs}ms)`
      );
    }
  }

  writeStepSummary(summariseResults(args.index, results));

  const failed = Object.values(results).filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`reindex: ${failed.length} of ${Object.keys(results).length} index(es) failed`);
    return EXIT_FAILED;
  }

  return EXIT_OK;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`reindex: ${(error as Error).message}`);
    process.exitCode = EXIT_FAILED;
  });
