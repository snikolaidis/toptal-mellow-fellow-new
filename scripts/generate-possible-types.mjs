/**
 * Regenerates possibleTypes.json from the live WPGraphQL schema.
 *
 * Faust's Apollo client needs an up-to-date possibleTypes map to resolve
 * fragments on interfaces/unions (e.g. EditorBlock -> AcfImageSlider). New ACF
 * blocks add new possible types, so run this after deploying a new block's
 * mu-plugin to WP:
 *
 *   node scripts/generate-possible-types.mjs
 *
 * Reads the endpoint from NEXT_PUBLIC_WORDPRESS_URL in .env.local, falling back
 * to the production WP Engine host.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function readWpUrl() {
  const fallback = 'https://mellowfellow1.wpenginepowered.com';
  try {
    const env = fs.readFileSync(path.join(rootDir, '.env.local'), 'utf8');
    const match = env.match(/^NEXT_PUBLIC_WORDPRESS_URL=(.+)$/m);
    return match ? match[1].trim() : fallback;
  } catch {
    return fallback;
  }
}

const endpoint = `${readWpUrl()}/graphql`;

const query = `
  query PossibleTypes {
    __schema {
      types {
        kind
        name
        possibleTypes {
          name
        }
      }
    }
  }
`;

const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});

const { data, errors } = await res.json();
if (errors) {
  console.error(errors);
  process.exit(1);
}

const result = {};
data.__schema.types.forEach((type) => {
  if (type.possibleTypes) {
    result[type.name] = type.possibleTypes.map((t) => t.name);
  }
});

fs.writeFileSync(
  path.join(rootDir, 'possibleTypes.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(`Wrote possibleTypes.json with ${Object.keys(result).length} keys from ${endpoint}`);
