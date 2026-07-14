import { useState } from 'react';
import { gql } from '@apollo/client';

interface FaqQuestion {
  question?: string | null;
  answer?: string | null;
}

interface FaqGroup {
  groupTitle?: string | null;
  questions?: FaqQuestion[] | null;
  footerLinks?: string | null;
}

interface FaqProps {
  faqBlock?: {
    groups?: FaqGroup[] | null;
  } | null;
}

export default function Faq(props: FaqProps) {
  const groups = props.faqBlock?.groups ?? [];
  const [open, setOpen] = useState<string | null>(null);

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="section faq">
      <div className="faq__inner">
        {groups.map((group, gi) => (
          <div key={gi} className="faq__group">
            {group.groupTitle && <h3 className="faq__group-title">{group.groupTitle}</h3>}

            <ul className="faq__list">
              {(group.questions ?? []).map((item, qi) => {
                const id = `${gi}-${qi}`;
                const isOpen = open === id;
                return (
                  <li key={id} className={`faq__item${isOpen ? ' faq__item--open' : ''}`}>
                    <button
                      type="button"
                      className="faq__question"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : id)}
                    >
                      <span>{item.question}</span>
                      <span className="faq__icon" aria-hidden="true" />
                    </button>

                    {isOpen && item.answer && (
                      <div
                        className="faq__answer"
                        dangerouslySetInnerHTML={{ __html: item.answer }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>

            {group.footerLinks && (
              <div
                className="faq__footer-links"
                dangerouslySetInnerHTML={{ __html: group.footerLinks }}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

Faq.displayName = 'AcfFaq';

Faq.fragments = {
  key: `AcfFaqFragment`,
  entry: gql`
    fragment AcfFaqFragment on AcfFaq {
      faqBlock {
        groups {
          groupTitle
          footerLinks
          questions {
            question
            answer
          }
        }
      }
    }
  `,
};
