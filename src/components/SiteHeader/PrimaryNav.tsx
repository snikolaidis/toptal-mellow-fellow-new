import Link from 'next/link';
import { ReactNode, RefObject } from 'react';
import { ChevronDownIcon, GridIcon } from '@/components/icons';
import { NavMenuItem, isRealHref } from '@/graphql/queries/menus';

interface PrimaryNavProps {
  items: NavMenuItem[];
  megaMenuOpen: boolean;
  megaMenuId: string;
  megaMenuTriggerRef: RefObject<HTMLButtonElement>;
  megaMenuPanel: ReactNode;
  onMegaMenuToggle: (viaKeyboard: boolean) => void;
  onMegaMenuPointerEnter: () => void;
  onMegaMenuPointerLeave: () => void;
  onSiblingActivate: () => void;
}

export default function PrimaryNav({
  items,
  megaMenuOpen,
  megaMenuId,
  megaMenuTriggerRef,
  megaMenuPanel,
  onMegaMenuToggle,
  onMegaMenuPointerEnter,
  onMegaMenuPointerLeave,
  onSiblingActivate,
}: PrimaryNavProps) {
  return (
    <div className="site-header__nav">
      <div className="site-header__nav-scroll">
        {/* The panel is a child of this wrapper, so one enter/leave pair covers
            both and moving between them needs no bridging element. */}
        <div
          className="site-header__shop"
          onMouseEnter={onMegaMenuPointerEnter}
          onMouseLeave={onMegaMenuPointerLeave}
        >
          <button
            type="button"
            id="nav-shop"
            ref={megaMenuTriggerRef}
            className="site-header__shop-trigger"
            aria-expanded={megaMenuOpen}
            aria-controls={megaMenuId}
            // Enter and Space fire a click whose detail is 0; a real pointer
            // click reports 1 or more. It is the only signal separating the two
            // here, and it decides whether opening moves focus into the panel.
            onClick={(event) => onMegaMenuToggle(event.detail === 0)}
          >
            <GridIcon />
            <span>Shop</span>
          </button>

          {/* Directly after the trigger so document order matches what the panel
              looks like: Tab out of the trigger enters the panel instead of
              skipping past the nav items sitting between them. */}
          {megaMenuPanel}

          <span className="site-header__shop-divider" aria-hidden="true" />
        </div>

        {items.map((item) => {
          const children = item.childItems?.nodes ?? [];
          const caret = (
            <span className="site-header__nav-caret" aria-hidden="true">
              <ChevronDownIcon />
            </span>
          );

          if (children.length > 0) {
            return (
              <div
                key={item.id}
                className="navbar-item has-dropdown is-hoverable site-header__nav-item"
                onMouseEnter={onSiblingActivate}
                onFocus={onSiblingActivate}
              >
                {isRealHref(item.uri) ? (
                  <Link
                    id={`nav-item-${item.id}`}
                    className="navbar-link is-arrowless"
                    href={item.uri}
                  >
                    {item.label}
                    {caret}
                  </Link>
                ) : (
                  <span
                    id={`nav-item-${item.id}`}
                    className="navbar-link is-arrowless"
                  >
                    {item.label}
                    {caret}
                  </span>
                )}
                <div className="navbar-dropdown">
                  {children.map((child) =>
                    isRealHref(child.uri) ? (
                      <Link
                        key={child.id}
                        id={`nav-item-${child.id}`}
                        className="navbar-item"
                        href={child.uri}
                      >
                        {child.label}
                      </Link>
                    ) : (
                      <span
                        key={child.id}
                        id={`nav-item-${child.id}`}
                        className="navbar-item"
                      >
                        {child.label}
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          }

          if (!isRealHref(item.uri)) {
            return (
              <span
                key={item.id}
                id={`nav-item-${item.id}`}
                className="navbar-item site-header__nav-item"
                onMouseEnter={onSiblingActivate}
                onFocus={onSiblingActivate}
              >
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.id}
              id={`nav-item-${item.id}`}
              className="navbar-item site-header__nav-item"
              href={item.uri}
              onMouseEnter={onSiblingActivate}
              onFocus={onSiblingActivate}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
