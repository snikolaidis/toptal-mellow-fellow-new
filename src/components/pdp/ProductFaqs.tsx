export interface ProductFaqDetails {
  noidOrBlendDescriptionTitle?: string | null;
  whatIsNoid?: string | null;
  directionsForUse?: string | null;
  deviceSpecifications?: string | null;
  ingredientsV2?: string | null;
  servingSize?: string | null;
  disclaimers?: string | null;
  coaLink?: string | null;
}

interface Props {
  details?: ProductFaqDetails | null;
  noidName?: string;
}

const PACKAGING_COPY =
  'Please note that the packaging of your ordered items may vary. Occasionally, there are updates between prints.\n\nThese modifications could be influenced by regulation changes, aesthetic enhancements, or adjustments aimed at enhancing your overall user experience.\n\nWe promise that the quality experience you expect at purchase is in the final product you receive. Please reach out if you have any questions or concerns.';

const ASK_COPY = 'We are always happy to answer any questions. <a href="/pages/contact-us">Contact Us</a>';

export default function ProductFaqs({ details, noidName }: Props) {
  if (!details) return null;

  const items: Array<{ question: string; answer: string }> = [];
  const noidTitle = details.noidOrBlendDescriptionTitle || noidName;
  if (details.whatIsNoid && noidTitle) items.push({ question: `What is ${noidTitle}?`, answer: details.whatIsNoid });
  if (details.directionsForUse) items.push({ question: 'Directions for Use', answer: details.directionsForUse });
  if (details.deviceSpecifications) items.push({ question: 'Device Specifications', answer: details.deviceSpecifications });
  if (details.ingredientsV2) items.push({ question: 'Ingredients', answer: details.ingredientsV2 });
  items.push({ question: 'Our Packaging Evolution', answer: PACKAGING_COPY });
  items.push({ question: 'Ask a question', answer: ASK_COPY });
  if (details.disclaimers) items.push({ question: 'Disclaimer', answer: details.disclaimers });

  if (items.length === 0) return null;

  return (
    <section className="faq-section">
      {items.map((item) => (
        <details key={item.question} className="faq-item">
          <summary>{item.question}</summary>
          <div className="faq-answer" dangerouslySetInnerHTML={{ __html: item.answer }} />
        </details>
      ))}
    </section>
  );
}
