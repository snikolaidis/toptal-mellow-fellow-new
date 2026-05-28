const heading = "DEALS OF THE DAY";
const description = "Get today’s deals & preview upcoming deals";

const highlights = [
  { id: 1, small_text: 'Smokeable Bundles', big_text: 'Enjoy 30% Off', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Smokeable_Bundle.webp' },
  { id: 2, small_text: 'Monthly Mystery Boxes', big_text: '30% Off Value', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Fam_Box.webp' },
  { id: 3, small_text: 'Edibles Bundles', big_text: 'Stock Up & Save', link: 'https://mellowfellow.fun/collections/new-arrivals', image: '/Collection_Cards_Edible_Bundle.webp' }
];

export default function HighlightsGroup() {
  return (
    <section className="section highlights-group">
      <div className="container">
        <div className="highlights-group__box">
          <div className="highlights-group__header">
            {heading.length > 0 &&
              <h3 className="highlights-group__title">
                { heading }
              </h3>
            }

            {description.length > 0 &&
              <p className="highlights-group__description">
                { description }
              </p>
            }
          </div>

          <div className="highlights-group__track">
            {highlights.map((highlight) => (
              <a href={ highlight.link } className="highlights-group__item">
                <img className="highlights-group__item-image" src={ highlight.image } alt="" width="800" />
                
                <h4 className="highlights-group__item-title">
                    <span className="highlights-group__big-text">
                      { highlight.big_text }
                    </span>
                    <span className="highlights-group__small-text">
                      { highlight.small_text }
                    </span>
                </h4>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}