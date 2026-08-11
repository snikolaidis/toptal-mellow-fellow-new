import Link from 'next/link';
import { GridIcon } from '@/components/icons';
import { NavMenuItem, isRealHref } from '@/graphql/queries/menus';

interface PrimaryNavProps {
  items: NavMenuItem[];
}

export default function PrimaryNav({ items }: PrimaryNavProps) {
  return (
    <div className="site-header__nav">
      <div className="site-header__nav-scroll">
        <div className="site-header__shop">
          <button
            type="button"
            id="nav-shop"
            className="site-header__shop-trigger"
            aria-expanded="false"
            data-mega-menu-trigger
          >
            <GridIcon />
            <span>Shop</span>
          </button>
          <span className="site-header__shop-divider" aria-hidden="true" />
        </div>

        {items.map((item) => {
          const children = item.childItems?.nodes ?? [];

          if (children.length > 0) {
            return (
              <div
                key={item.id}
                className="navbar-item has-dropdown is-hoverable site-header__nav-item"
              >
                {isRealHref(item.uri) ? (
                  <Link
                    id={`nav-item-${item.id}`}
                    className="navbar-link"
                    href={item.uri}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span id={`nav-item-${item.id}`} className="navbar-link">
                    {item.label}
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
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
