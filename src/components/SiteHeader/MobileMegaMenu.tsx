import Image from 'next/image';
import Link from 'next/link';
import { RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import {
  CloseIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@/components/icons';
import { isRealHref } from '@/graphql/queries/menus';
import { isVectorIcon, scaleIcon } from '@/lib/productIcons';
import { decodeEntities } from '@/lib/decodeEntities';
import {
  MegaMenuModel,
  MegaMenuProduct,
  MegaMenuPromoted,
} from './megaMenuModel';

interface MobileMegaMenuProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement>;
  model: MegaMenuModel;
}

const ICON_HEIGHT = 28;

// Matched on the label, since the link is an ordinary Featured row and nothing
// in the payload marks it out.
const DEAL_LABEL = 'limited time deals';

export default function MobileMegaMenu({
  id,
  isOpen,
  onClose,
  triggerRef,
  model,
}: MobileMegaMenuProps) {
  const {
    products,
    categories,
    tail,
    promoted,
    moods,
    cannabinoids,
    featured,
    learn,
  } = model;

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = products.find((p) => p.key === activeKey) ?? null;

  const panelRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const returnToRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) setActiveKey(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // A document listener, not a backdrop element: a backdrop would block the
  // page behind, which is meant to stay scrollable.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || panelRef.current?.contains(target)) return;
      // The burger toggles on click, and pointerdown lands first. Closing here
      // too would leave the click to reopen it, so it could never close.
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, onClose, triggerRef]);

  useEffect(() => {
    router.events.on('routeChangeStart', onClose);
    return () => router.events.off('routeChangeStart', onClose);
  }, [router.events, onClose]);

  // Back is the only way out of the child view, so focus goes there on entry
  // and returns to the chevron on exit.
  useEffect(() => {
    if (active) backRef.current?.focus();
    else if (returnToRef.current) {
      panelRef.current
        ?.querySelector<HTMLElement>(`[data-chevron="${returnToRef.current}"]`)
        ?.focus();
      returnToRef.current = null;
    }
  }, [active]);

  if (!isOpen) return null;

  const openChild = (product: MegaMenuProduct) => {
    returnToRef.current = product.key;
    setActiveKey(product.key);
  };

  const iconFor = (icon: MegaMenuProduct['icon']) => {
    // The box is reserved either way, so a row with no artwork still starts its
    // label on the same x as the rows above it.
    if (!icon) {
      return <span className="site-header__mobile-icon" aria-hidden="true" />;
    }
    const box = scaleIcon(icon, ICON_HEIGHT);
    return (
      <Image
        className="site-header__mobile-icon"
        src={icon.src}
        alt=""
        width={box.width}
        height={box.height}
        unoptimized={isVectorIcon(icon)}
      />
    );
  };

  const row = (
    key: string,
    item: MegaMenuProduct['item'],
    icon: MegaMenuProduct['icon'],
    onChevron?: () => void,
    bold?: boolean
  ) => (
    <li key={key} className="site-header__mobile-row">
      <Link
        href={item.uri}
        className={`site-header__mobile-link${
          bold ? ' site-header__mobile-link--bold' : ''
        }`}
      >
        {iconFor(icon)}
        <span>{item.label}</span>
      </Link>

      {onChevron && (
        <button
          type="button"
          className="site-header__mobile-chevron"
          data-chevron={key}
          // The row's link already carries this label, so without a name of
          // its own the item is announced twice.
          aria-label={`Browse ${item.label}`}
          onClick={onChevron}
        >
          <ChevronRightIcon />
        </button>
      )}
    </li>
  );

  const productRow = (product: MegaMenuProduct) =>
    row(
      product.key,
      product.item,
      product.icon,
      product.hasChildren ? () => openChild(product) : undefined
    );

  // Chevron here too, even though Syringes and Accessories are promoted out of
  // this list and so appear twice. The other children have no route anywhere
  // else, and a duplicate row beats an unreachable destination.
  const tailRow = (product: MegaMenuProduct) =>
    row(
      product.key,
      product.item,
      product.icon,
      product.hasChildren ? () => openChild(product) : undefined,
      true
    );

  const promotedRow = (entry: MegaMenuPromoted) =>
    row(entry.key, entry.item, entry.icon);

  const textList = (items: { key: string; href: string; label: string }[]) => (
    <ul className="site-header__mobile-list">
      {items.map((entry) => (
        <li key={entry.key}>
          <Link href={entry.href} className="site-header__mobile-text-link">
            {entry.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  // .site-header is sticky with a z-index, so it opens a stacking context the
  // panel cannot escape from inside it.
  return createPortal(
    <div
      id={id}
      ref={panelRef}
      className="site-header__mobile"
      role="navigation"
      aria-label="Shop menu"
    >
      {active ? (
        <div key="child" className="site-header__mobile-view">
          <div className="site-header__mobile-bar">
            <button
              type="button"
              ref={backRef}
              className="site-header__mobile-back"
              aria-label="Back to menu"
              onClick={() => setActiveKey(null)}
            >
              <ChevronDownIcon />
            </button>
            <h2 className="site-header__mobile-heading">{active.item.label}</h2>
          </div>

          <ul className="site-header__mobile-list">
            {active.children.map((child) => (
              <li key={child.id}>
                {isRealHref(child.uri) ? (
                  <Link
                    href={child.uri}
                    className="site-header__mobile-text-link"
                  >
                    {child.label}
                  </Link>
                ) : (
                  <span className="site-header__mobile-text-link">
                    {child.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div key="root" className="site-header__mobile-view">
          <div className="site-header__mobile-bar">
            <button
              type="button"
              className="site-header__mobile-close"
              aria-label="Close menu"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>

          <section className="site-header__mobile-section">
            <h2 className="site-header__mobile-heading">Shop by Product</h2>
            <ul className="site-header__mobile-list">
              {categories.map((p) => productRow(p))}
              {promoted.map((p) => promotedRow(p))}

              {tail.length > 0 && (
                <li className="site-header__mobile-divider" aria-hidden="true" />
              )}
              {tail.map((p) => tailRow(p))}
            </ul>
          </section>

          <section className="site-header__mobile-section">
            <h2 className="site-header__mobile-heading">Featured</h2>

            {/* The carousel image and its overlaid title go here, above the
                links. It shares a Site Settings group with the homepage
                carousel, which does not exist yet. */}

            {featured.length > 0 && (
              <ul className="site-header__mobile-list">
                {featured.map(({ label, url, target }) => (
                  <li key={url}>
                    <Link
                      href={url}
                      target={target}
                      rel={target === '_blank' ? 'noreferrer' : undefined}
                      className={`site-header__mobile-feature${
                        label.trim().toLowerCase() === DEAL_LABEL
                          ? ' site-header__mobile-feature--deal'
                          : ''
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="site-header__mobile-section">
            <h2 className="site-header__mobile-heading">Shop by Mood</h2>
            {textList(
              moods.map((m) => ({
                key: m.slug,
                href: `/moods/${m.slug}`,
                label: decodeEntities(m.name),
              }))
            )}
          </section>

          <section className="site-header__mobile-section">
            <h2 className="site-header__mobile-heading">Cannabinoids</h2>
            {textList(
              cannabinoids.map((c) => ({
                key: c.uri,
                href: c.uri,
                label: c.label,
              }))
            )}
          </section>

          {learn.length > 0 && (
            <section className="site-header__mobile-section">
              <span
                className="site-header__mobile-divider"
                aria-hidden="true"
              />
              {textList(
                learn.map((item) => ({
                  key: item.id,
                  href: item.uri,
                  label: item.label,
                }))
              )}
            </section>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
