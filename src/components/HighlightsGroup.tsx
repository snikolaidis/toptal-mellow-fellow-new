interface Highlight {
  id: number;
  small_text: string;
  big_text: string;
  link: string;
  image: string;
}

interface HighlightGroupsProps {
  highlights: Highlight[];
  title: string;
  description: string;
}

export default function HighlightsGroup({ highlights, title, description }: HighlightGroupsProps) {
  return (
    <section className="section highlights-group">
      <div className="container">
        <div className="highlights-group__box">
          <div className="highlights-group__header">

            {title.length > 0 &&
              <h3 className="highlights-group__title">
                { title }
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