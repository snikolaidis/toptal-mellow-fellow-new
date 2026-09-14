// A circular badge — ring + two accent dots, a label arced along the ring
// (drawn twice, mirrored top and bottom)
//
// viewBox is a self-contained 74.22x74.22 box: ring radius 36.36 + 0.75
// stroke, centered at (37.11, 37.11).
import { useId } from 'react';

const CENTER = 37.11;
const RING_RADIUS = 36.36;
const DOT_OFFSET = 26.31;
const DOT_RADIUS = 1.97;
const VALUE_Y = CENTER + 4.27;
const UNIT_Y = CENTER + 13.68;

function BadgeFrame() {
  return (
    <>
      <circle className="nutrition-badge__ring" cx={CENTER} cy={CENTER} r={RING_RADIUS} />
      <circle className="nutrition-badge__dot" cx={CENTER - DOT_OFFSET} cy={CENTER} r={DOT_RADIUS} />
      <circle className="nutrition-badge__dot" cx={CENTER + DOT_OFFSET} cy={CENTER} r={DOT_RADIUS} />
    </>
  );
}

const LABEL_RADIUS = 25.8;
const TOP_ARC = `M ${CENTER - LABEL_RADIUS} ${CENTER} A ${LABEL_RADIUS} ${LABEL_RADIUS} 0 0 1 ${CENTER + LABEL_RADIUS} ${CENTER}`;
const BOTTOM_ARC = `M ${CENTER - LABEL_RADIUS} ${CENTER} A ${LABEL_RADIUS} ${LABEL_RADIUS} 0 0 0 ${CENTER + LABEL_RADIUS} ${CENTER}`;
const LABEL_MAX_ARC = Math.round(LABEL_RADIUS * ((150 * Math.PI) / 180) * 100) / 100;
const LABEL_MAX_CHARS = 11;

interface TextLabelBadgeProps {
  label: string;
  value?: string;
  unit?: string;
  className?: string;
}

export function TextLabelBadge({ label, value, unit, className }: TextLabelBadgeProps) {
  // Several badges share the page, so each needs its own arc ids.
  const id = useId();
  const topArcId = `${id}-top`;
  const bottomArcId = `${id}-bottom`;
  const fit =
    label.length > LABEL_MAX_CHARS
      ? { textLength: LABEL_MAX_ARC, lengthAdjust: 'spacingAndGlyphs' as const }
      : {};

  return (
    <svg
      className={`nutrition-badge nutrition-badge--text-label${className ? ` ${className}` : ''}`}
      viewBox="0 0 74.22 74.22"
      role="img"
      aria-label={value ? `${label}: ${value} ${unit || ''}`.trim() : label}
    >
      <defs>
        <path id={topArcId} d={TOP_ARC} />
        <path id={bottomArcId} d={BOTTOM_ARC} />
      </defs>

      <BadgeFrame />

      {[topArcId, bottomArcId].map((arcId) => (
        <text
          key={arcId}
          className="nutrition-badge__label-text"
          textAnchor="middle"
          dominantBaseline="central"
          aria-hidden="true"
        >
          <textPath href={`#${arcId}`} startOffset="50%" {...fit}>
            {label}
          </textPath>
        </text>
      ))}

      {value && (
        <text className="nutrition-badge__value" x={CENTER} y={VALUE_Y} textAnchor="middle" aria-hidden="true">
          {value}
        </text>
      )}
      {value && unit && (
        <text className="nutrition-badge__unit" x={CENTER} y={UNIT_Y} textAnchor="middle" aria-hidden="true">
          {unit}
        </text>
      )}
    </svg>
  );
}
