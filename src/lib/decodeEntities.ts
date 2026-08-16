const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  deg: '°',
  trade: '™',
  reg: '®',
  copy: '©',
  prime: '′',
  Prime: '″',
};

const ENTITY_PATTERN = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

export function decodeEntities(value: string): string;
export function decodeEntities<T extends null | undefined>(value: T): T;
export function decodeEntities(value: string | null | undefined): string | null | undefined;
export function decodeEntities(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string' || !value.includes('&')) {
    return value;
  }

  // Single pass, never looped: "&amp;lt;script&amp;gt;" must decode to inert
  // text, not to a live tag.
  return value.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body.charCodeAt(0) === 35 /* # */) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const codePoint = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);

      if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff) {
        return match;
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }

    const named = NAMED_ENTITIES[body];
    return named === undefined ? match : named;
  });
}
