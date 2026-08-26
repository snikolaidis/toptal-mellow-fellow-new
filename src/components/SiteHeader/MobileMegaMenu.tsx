import Image from 'next/image';
import Link from 'next/link';
import { RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/icons';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const returnToRef = useRef<string | null>(null);
  const wasOpenRef = useRef(false);
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

  // documentElement, not body. Bulma sets overflow-y: scroll on html, so the
  // viewport takes its overflow from the root and body.style.overflow is a
  // no-op. Five other components lock body and none of them work.
  useEffect(() => {
    if (!isOpen) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const root = modalRef.current;
      if (!root) return;

      const items = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const focused = document.activeElement;
      const inside = focused instanceof Node && root.contains(focused);

      if (event.shiftKey && (!inside || focused === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || focused === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      closeRef.current?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen, triggerRef]);

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
    <div ref={modalRef} className="site-header__mobile-modal">
      <div className="site-header__mobile-scrim" onClick={onClose} />

      <div
        id={id}
        ref={panelRef}
        className="site-header__mobile"
        role="dialog"
        aria-modal="true"
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
      </div>

      <button
        ref={closeRef}
        type="button"
        className="site-header__mobile-close"
        aria-label="Close menu"
        onClick={onClose}
      >
        <svg viewBox="0 0 17 17" fill="none" aria-hidden="true" focusable="false">
          <path
            fill="white"
            d="M15.7193 0.292787C15.5318 0.105316 15.2775 0 15.0123 0C14.7471 0 14.4928 0.105316 14.3053 0.292787L8.01229 6.58579L1.71929 0.292787C1.53069 0.110629 1.27808 0.00983372 1.01589 0.0121121C0.75369 0.0143906 0.502878 0.11956 0.31747 0.304968C0.132062 0.490376 0.0268924 0.741188 0.0246139 1.00339C0.0223355 1.26558 0.12313 1.51818 0.305288 1.70679L6.59829 7.99979L0.305288 14.2928C0.209778 14.385 0.133596 14.4954 0.0811869 14.6174C0.0287779 14.7394 0.00119157 14.8706 3.77571e-05 15.0034C-0.00111606 15.1362 0.0241854 15.2678 0.0744663 15.3907C0.124747 15.5136 0.199 15.6253 0.292893 15.7192C0.386786 15.8131 0.498438 15.8873 0.621334 15.9376C0.744231 15.9879 0.87591 16.0132 1.00869 16.012C1.14147 16.0109 1.27269 15.9833 1.39469 15.9309C1.5167 15.8785 1.62704 15.8023 1.71929 15.7068L8.01229 9.41379L14.3053 15.7068C14.4939 15.8889 14.7465 15.9897 15.0087 15.9875C15.2709 15.9852 15.5217 15.88 15.7071 15.6946C15.8925 15.5092 15.9977 15.2584 16 14.9962C16.0022 14.734 15.9014 14.4814 15.7193 14.2928L9.42629 7.99979L15.7193 1.70679C15.9068 1.51926 16.0121 1.26495 16.0121 0.999786C16.0121 0.734622 15.9068 0.480314 15.7193 0.292787Z"
          />
        </svg>
      </button>
    </div>,
    document.body
  );
}
