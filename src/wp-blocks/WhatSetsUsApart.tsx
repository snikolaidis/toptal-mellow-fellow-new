import type { CSSProperties } from 'react';
import { gql } from '@apollo/client';
import Image from 'next/image';

interface MediaItem {
  id?: string;
  altText?: string | null;
  sourceUrl?: string | null;
}

interface Item {
  icon?: { node?: MediaItem | null } | null;
  label?: string | null;
  labelColor?: string | null;
}

interface WhatSetsUsApartProps {
  whatSetsUsApart?: {
    heading?: string | null;
    items?: Item[] | null;
  } | null;
}

export default function WhatSetsUsApart(props: WhatSetsUsApartProps) {
  const data = props.whatSetsUsApart;

  if (!data) {
    return null;
  }

  const items = (data.items ?? []).filter((item) => item.icon?.node?.sourceUrl);

  return (
    <section className="what-sets-us-apart">
      {data.heading && <h2 className="what-sets-us-apart__heading">{data.heading}</h2>}

      {items.length > 0 && (
        <div className="what-sets-us-apart__grid">
          {items.map((item, i) => {
            const icon = item.icon!.node!;
            return (
              <div key={i} className="what-sets-us-apart__item">
                <Image
                  className="what-sets-us-apart__icon"
                  src={icon.sourceUrl!}
                  alt={icon.altText || ''}
                  width={125}
                  height={125}
                />
                {item.label && (
                  <p
                    className="what-sets-us-apart__label"
                    style={
                      item.labelColor
                        ? ({ '--label-color': item.labelColor } as CSSProperties)
                        : undefined
                    }
                  >
                    {item.label}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

WhatSetsUsApart.displayName = 'AcfWhatSetsUsApart';

WhatSetsUsApart.fragments = {
  key: `AcfWhatSetsUsApartFragment`,
  entry: gql`
    fragment AcfWhatSetsUsApartFragment on AcfWhatSetsUsApart {
      whatSetsUsApart {
        heading
        items {
          label
          labelColor
          icon {
            node {
              id
              altText
              sourceUrl
            }
          }
        }
      }
    }
  `,
};
