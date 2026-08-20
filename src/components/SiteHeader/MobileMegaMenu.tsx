import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { CloseIcon, ChevronDownIcon } from '@/components/icons';
import { isRealHref } from '@/graphql/queries/menus';
import { scaleIcon } from '@/lib/productIcons';
import { decodeEntities } from '@/lib/decodeEntities';
import { MegaMenuModel, MegaMenuProduct } from './megaMenuModel';

interface MobileMegaMenuProps {
  isOpen: boolean;
  onClose: () => void;
  model: MegaMenuModel;
}

const ICON_HEIGHT = 28;

export default function MobileMegaMenu({
  isOpen,
  onClose,
  model,
}: MobileMegaMenuProps) {
  const { products, illustrated, plain, moods, cannabinoids, featured } = model;

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
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen, onClose]);

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

  const productRow = (product: MegaMenuProduct) => {
    const { item, icon } = product;
    const box = icon ? scaleIcon(icon, ICON_HEIGHT) : null;

    return (
      <li key={item.id} className="site-header__mobile-row">
        <Link href={item.uri} className="site-header__mobile-link">
          {icon && box && (
            <Image
              className="site-header__mobile-icon"
              src={icon.src}
              alt=""
              width={box.width}
              height={box.height}
            />
          )}
          <span>{item.label}</span>
        </Link>

        {icon && product.hasChildren && (
          <button
            type="button"
            className="site-header__mobile-chevron"
            data-chevron={product.key}
            // The row's link already carries this label, so without a name of
            // its own the item is announced twice.
            aria-label={`Browse ${item.label}`}
            onClick={() => openChild(product)}
          >
            <ChevronDownIcon />
          </button>
        )}
      </li>
    );
  };

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

  return (
    <div
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
              {illustrated.map(productRow)}
              {plain.map(productRow)}
            </ul>
          </section>

          <section className="site-header__mobile-section">
            <h2 className="site-header__mobile-heading">Featured</h2>
            {featured.length > 0 &&
              textList(
                featured.map((f) => ({ key: f.url, href: f.url, label: f.label }))
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
        </div>
      )}
    </div>
  );
}
