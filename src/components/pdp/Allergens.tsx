import RichText, { sanitizeRichText } from '@/components/RichText';

interface Props {
  html?: string | null;
}

export default function Allergens({ html }: Props) {
  // A WYSIWYG left blank can still save markup ("<p></p>", "&nbsp;"), so check
  // for visible text rather than just a non-empty string.
  const text = html ? sanitizeRichText(html).replace(/<[^>]*>|&nbsp;/g, '').trim() : '';
  if (!text) return null;

  return (
    <div className="product-allergens">
      <h3 className="product-allergens__heading">Allergens</h3>
      <RichText html={html} className="product-allergens__body" />
    </div>
  );
}
