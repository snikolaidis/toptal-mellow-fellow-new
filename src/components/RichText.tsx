import { createElement } from 'react';
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'span',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'pre',
  'code',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'srcset',
  'sizes',
  'width',
  'height',
  'class',
  'loading',
  'decoding',
  'colspan',
  'rowspan',
];

export interface RichTextProps {
  html?: string | null;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export default function RichText({ html, as = 'div', className }: RichTextProps) {
  if (!html) return null;

  const clean = sanitizeRichText(html);
  if (!clean) return null;

  return createElement(as, {
    className,
    dangerouslySetInnerHTML: { __html: clean },
  });
}
