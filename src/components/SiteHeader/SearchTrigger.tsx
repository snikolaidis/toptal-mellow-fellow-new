import { SearchIcon } from '@/components/icons';

interface SearchTriggerProps {
  onOpen: () => void;
  placeholder?: string;
}

// One button, not a field plus a nested button: the magnifier is decorative so
// there is a single tab stop and no interactive element inside an interactive
// element. Click and Enter both come free from the button element.
//
// Do not add onFocus={onOpen}. SearchModal restores focus to whatever was
// focused when it opened, so a focus handler here reopens it on every close and
// the modal cannot be dismissed.
export default function SearchTrigger({
  onOpen,
  placeholder = 'Search...',
}: SearchTriggerProps) {
  return (
    <button
      type="button"
      className="site-header__search"
      onClick={onOpen}
      aria-label="Search products"
      aria-haspopup="dialog"
    >
      <span className="site-header__search-placeholder">{placeholder}</span>
      <span className="site-header__search-button" aria-hidden="true">
        <SearchIcon />
      </span>
    </button>
  );
}
