import { useEffect, useId, useRef, useState } from 'react';
import { Product } from '@/types/woocommerce';

interface Props {
  product: Product;
}

type MeterType = 'standard' | 'wellness';

interface MeterCopy {
  titleHtml: string;
  labels: [string, string, string, string, string];
  subtitles: [string, string, string, string, string];
}

// Presentational copy per meter flavor. Only `meterType` (which copy set)
// and `meterValue` (level 1-5, which segment is active) come from ACF —
// labels/subtitles are fixed content, same as the design source.
const TAXONOMY: Record<MeterType, MeterCopy> = {
  standard: {
    titleHtml: 'Mellow Meter',
    labels: ['Microdose', 'Low', 'Balanced', 'Strong', 'High'],
    subtitles: [
      'A small dose for a functional feel.',
      'Light potency for a gentle lift.',
      'Moderate potency for a fuller experience.',
      'High potency for a more intense effect.',
      'Very high potency for the most experienced.',
    ],
  },
  wellness: {
    titleHtml: 'Mellow <b>Wellness</b> Meter',
    labels: ['Gentle Support', 'Mild Support', 'Balanced Support', 'Strong Support', 'Intensive Support'],
    subtitles: [
      'Subtle, but noticeable.',
      'Easygoing, daily care.',
      'For well-rounded wellness needs.',
      'For more targeted support.',
      'For your most concentrated wellness routine.',
    ],
  },
};

const SEGMENT_COLORS = ['var(--mm-c1)', 'var(--mm-c2)', 'var(--mm-c3)', 'var(--mm-c4)', 'var(--mm-c5)'];
const CENTER = { x: 178.32, y: 210 };
const R_OUTER = 148;
const R_INNER = 92;
const SEGMENTS = 5;
const SWEEP = 180; // degrees, semicircle
const GAP = 2.2; // degree gap between segments
const R_RIM = R_OUTER + 44;
const R_LABEL = R_OUTER + 17;
const R_HUB = R_INNER - 26;
const R_HUB_INNER = R_HUB * 0.55;

// Math.cos/Math.sin can differ in their last bit between Node (SSR) and the
// browser (hydration), which turns into a server/client path-attribute
// mismatch. Rounding kills that without any visible precision loss.
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180; // 0deg = pointing up
  return { x: round(cx + r * Math.cos(a)), y: round(cy + r * Math.sin(a)) };
}

// angle convention: -90 = far left (9 o'clock), 0 = up, 90 = far right (3 o'clock)
function segAngles(i: number) {
  const start = -90 + (i * SWEEP) / SEGMENTS + GAP / 2;
  const end = -90 + ((i + 1) * SWEEP) / SEGMENTS - GAP / 2;
  return { start, end, center: (start + end) / 2 };
}

function wedgePath(i: number) {
  const { start, end } = segAngles(i);
  const p1 = polar(CENTER.x, CENTER.y, R_OUTER, start);
  const p2 = polar(CENTER.x, CENTER.y, R_OUTER, end);
  const p3 = polar(CENTER.x, CENTER.y, R_INNER, end);
  const p4 = polar(CENTER.x, CENTER.y, R_INNER, start);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${R_OUTER} ${R_OUTER} 0 0 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${R_INNER} ${R_INNER} 0 0 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

// Guide arc each label's textPath rides along, confined to that segment's
// own angular lane so neighboring curved labels never overlap.
function labelArcPath(i: number) {
  const { center } = segAngles(i);
  const halfSpan = SWEEP / SEGMENTS / 2;
  const start = center - halfSpan;
  const end = center + halfSpan;
  const p1 = polar(CENTER.x, CENTER.y, R_LABEL, start);
  const p2 = polar(CENTER.x, CENTER.y, R_LABEL, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${R_LABEL} ${R_LABEL} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
}

// Rough width estimate so longer labels shrink to fit their own lane
// instead of overflowing into neighboring segments.
function fitFontSize(label: string) {
  const arcLenPx = (R_LABEL * ((SWEEP / SEGMENTS) * Math.PI)) / 180 - 6; // small safety margin
  const base = 13;
  const estWidth = label.length * base * 0.62;
  if (estWidth <= arcLenPx) return base;
  return Math.max(7.5, base * (arcLenPx / estWidth));
}

const hubLeft = polar(CENTER.x, CENTER.y, R_HUB, -90);
const hubRight = polar(CENTER.x, CENTER.y, R_HUB, 90);
const HUB_PATH = `M ${hubLeft.x} ${hubLeft.y} A ${R_HUB} ${R_HUB} 0 0 1 ${hubRight.x} ${hubRight.y} Z`;

const hubInnerLeft = polar(CENTER.x, CENTER.y, R_HUB_INNER, -90);
const hubInnerRight = polar(CENTER.x, CENTER.y, R_HUB_INNER, 90);
const HUB_INNER_PATH = `M ${hubInnerLeft.x} ${hubInnerLeft.y} A ${R_HUB_INNER} ${R_HUB_INNER} 0 0 1 ${hubInnerRight.x} ${hubInnerRight.y} Z`;

const rimStart = polar(CENTER.x, CENTER.y, R_RIM, -90);
const rimEnd = polar(CENTER.x, CENTER.y, R_RIM, 90);
const RIM_PATH = `M ${rimStart.x} ${rimStart.y} A ${R_RIM} ${R_RIM} 0 0 1 ${rimEnd.x} ${rimEnd.y}`;

const NEEDLE_LEN = R_INNER + 6; // extends past the hub, into the colored ring
const NEEDLE_PATH = `M ${CENTER.x - 6} ${CENTER.y} L ${CENTER.x} ${CENTER.y - NEEDLE_LEN} L ${CENTER.x + 6} ${CENTER.y} Z`;

export default function ProductMellowMeter({ product }: Props) {
  const uid = useId();
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // meterType is an ACF checkbox field, so GraphQL returns it as [String];
  // this component only supports one flavor per product, so the first
  // checked value wins.
  const rawType = product.productDetails?.meterType?.[0];
  const rawValue = product.productDetails?.meterValue;

  const hasType = typeof rawType === 'string' && rawType.trim() !== '';
  const hasValue = typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue !== 0;

  // Sweep the needle in from the far left once the gauge actually scrolls
  // into view — the meter usually sits below the fold, so animating on
  // mount would finish before anyone sees it.
  useEffect(() => {
    if (!hasType || !hasValue) return;
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasType, hasValue]);

  if (!hasType || !hasValue) {
    return null;
  }

  const type: MeterType = rawType!.trim().toLowerCase() === 'wellness' ? 'wellness' : 'standard';
  const level = Math.min(5, Math.max(1, Math.round(rawValue!)));
  const copy = TAXONOMY[type];
  const gradientId = `mm-rim-grad-${uid}`;

  const targetAngle = segAngles(level - 1).center;
  const needleStyle: React.CSSProperties = {
    transform: `rotate(${mounted ? targetAngle : -90}deg)`,
    transformOrigin: `${CENTER.x}px ${CENTER.y}px`,
    transformBox: 'view-box',
    ...(mounted ? {} : { transition: 'none' }),
  };

  return (
    <div className="product-mellow-meter" ref={containerRef}>
      <div className="product-mellow-meter__card">
        <div className="product-mellow-meter__title-row">
          <h3 dangerouslySetInnerHTML={{ __html: copy.titleHtml }} />
        </div>

        <svg viewBox="-16 0 388.64 250" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#88c36d" />
              <stop offset=".24" stopColor="#f7c65c" />
              <stop offset=".5" stopColor="#f1a954" />
              <stop offset=".78" stopColor="#e97c5e" />
              <stop offset="1" stopColor="#e64e67" />
            </linearGradient>
          </defs>

          <path d={RIM_PATH} fill="none" stroke={`url(#${gradientId})`} strokeWidth={2.5} />

          {Array.from({ length: SEGMENTS }, (_, i) => (
            <path
              key={`seg-${i}`}
              d={wedgePath(i)}
              fill={SEGMENT_COLORS[i]}
              className={`product-mellow-meter__segment ${i < level ? 'is-active' : 'is-inactive'}`}
            />
          ))}

          {Array.from({ length: SEGMENTS }, (_, i) => {
            const arcId = `mm-label-arc-${uid}-${i}`;
            const label = copy.labels[i];
            return (
              <g key={arcId}>
                <path id={arcId} d={labelArcPath(i)} fill="none" stroke="none" />
                <text className="product-mellow-meter__label" style={{ fontSize: `${fitFontSize(label)}px` }}>
                  {/* eslint-disable-next-line react/no-unknown-property */}
                  <textPath xlinkHref={`#${arcId}`} href={`#${arcId}`} startOffset="50%" textAnchor="middle">
                    {label}
                  </textPath>
                </text>
              </g>
            );
          })}

          <path d={HUB_PATH} fill="var(--mm-track)" />
          <path d={HUB_INNER_PATH} fill="#ffffff" />

          <g className="product-mellow-meter__needle" style={needleStyle}>
            <path d={NEEDLE_PATH} fill="var(--mm-ink)" />
            <circle cx={CENTER.x} cy={CENTER.y} r={8} fill="var(--mm-ink)" />
          </g>
        </svg>

        <div className="product-mellow-meter__subtitle">{copy.subtitles[level - 1]}</div>
      </div>
    </div>
  );
}
