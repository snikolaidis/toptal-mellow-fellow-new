import Link from 'next/link';
import { ChevronDownIcon } from '@/components/icons';
import { NavMenuItem, isRealHref } from '@/graphql/queries/menus';

interface MenuDrawerProps {
  items: NavMenuItem[];
  isOpen: boolean;
  openMenus: Set<string>;
  onToggleSubmenu: (id: string) => void;
  onNavigate: () => void;
}

export default function MenuDrawer({
  items,
  isOpen,
  openMenus,
  onToggleSubmenu,
  onNavigate,
}: MenuDrawerProps) {
  return (
    <div
      id="site-header-drawer"
      className={`site-header__drawer ${isOpen ? 'is-active' : ''}`}
    >
      {items.map((item) => {
        const children = item.childItems?.nodes ?? [];

        if (children.length > 0) {
          const submenuOpen = openMenus.has(item.id);
          return (
            <div
              key={item.id}
              className={`site-header__drawer-group ${submenuOpen ? 'is-open' : ''}`}
            >
              <button
                type="button"
                id={`nav-drawer-item-${item.id}`}
                className="site-header__drawer-trigger"
                aria-expanded={submenuOpen}
                onClick={() => onToggleSubmenu(item.id)}
              >
                <span>{item.label}</span>
                <span className="site-header__drawer-caret" aria-hidden="true">
                  <ChevronDownIcon />
                </span>
              </button>
              <div className="site-header__drawer-submenu">
                {children.map((child) =>
                  isRealHref(child.uri) ? (
                    <Link
                      key={child.id}
                      id={`nav-drawer-item-${child.id}`}
                      className="site-header__drawer-link"
                      href={child.uri}
                      onClick={onNavigate}
                    >
                      {child.label}
                    </Link>
                  ) : (
                    <span
                      key={child.id}
                      id={`nav-drawer-item-${child.id}`}
                      className="site-header__drawer-link"
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
              id={`nav-drawer-item-${item.id}`}
              className="site-header__drawer-link"
            >
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.id}
            id={`nav-drawer-item-${item.id}`}
            className="site-header__drawer-link"
            href={item.uri}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
