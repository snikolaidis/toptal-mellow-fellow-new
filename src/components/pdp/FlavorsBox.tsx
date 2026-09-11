import { Product, ProductTaxonomies, ProductTaxonomyTerm } from '@/types/woocommerce';

interface Props {
  product: Product;
  taxonomies?: ProductTaxonomies | null;
}

interface IconItem {
  id: string;
  name: string;
  iconUrl: string;
}

function toIconItems(nodes: ProductTaxonomyTerm[] | undefined): IconItem[] {
  return (nodes || [])
    .map((term) => ({
      id: term.id,
      name: term.name,
      iconUrl: term.extraTaxonomyFields?.propIcon?.node?.sourceUrl,
    }))
    .filter((term): term is IconItem => !!term.iconUrl);
}

type BestForTaxonomy = 'vibe' | 'effect' | 'setting';

export default function FlavorsBox({ product, taxonomies }: Props) {

  const strainName = product?.strainNames?.nodes?.[0]?.name;

  const flavorIcons = toIconItems(taxonomies?.flavors?.nodes);

  const bestForItems: Array<IconItem & { taxonomy: BestForTaxonomy }> = [
    ...toIconItems(taxonomies?.vibes?.nodes).map((item) => ({ ...item, taxonomy: 'vibe' as const })),
    ...toIconItems(taxonomies?.effects?.nodes).map((item) => ({ ...item, taxonomy: 'effect' as const })),
    ...toIconItems(taxonomies?.settings?.nodes).map((item) => ({ ...item, taxonomy: 'setting' as const })),
  ];

  return (
    <div className="flavors-box">
      {strainName && (
        <h3 className="flavors-box__heading">
          How <span className="flavors-box__strain-name">{strainName}</span> Hits
        </h3>
      )}

      <div className="flavors-box__content">
        {flavorIcons.length > 0 && (
          <div className="flavors-box__section">
            <h4 className="flavors-box__title">
              Top Flavors
            </h4>
            <ul className="flavors-box__icons">
              {flavorIcons.map((flavor) => (
                <li key={flavor.id} className="flavors-box__icon">
                  <img
                    src={flavor.iconUrl}
                    alt={flavor.name}
                    title={flavor.name}
                    loading="lazy"
                    decoding="async"
                    width={40}
                    height={40}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {bestForItems.length > 0 && (
          <div className="flavors-box__section flavors-box__section--best-for">
            <h4 className="flavors-box__title">
              Best For
            </h4>
            <ul className="flavors-box__best-for">
              {bestForItems.map((item) => (
                <li
                  key={item.id}
                  className={`flavors-box__best-item flavors-box__best-item--${item.taxonomy}`}
                >
                  <span className="flavors-box__best-icon">
                    <img
                      src={item.iconUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={40}
                      height={40}
                    />
                  </span>
                  <span className="flavors-box__best-name">{item.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}