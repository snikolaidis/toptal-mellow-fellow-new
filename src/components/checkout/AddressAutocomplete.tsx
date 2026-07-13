import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './AddressAutocomplete.module.css';

export interface AddressSuggestion {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  postcode: string;
  countryCode: string;
}

interface AddressAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSelectAddress: (address: AddressSuggestion) => void;
  autoComplete?: string;
  className?: string;
}

export default function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelectAddress,
  autoComplete,
  className,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const justSelected = useRef(false);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/address-autocomplete?q=${encodeURIComponent(q)}`).then((r) => r.json());
      const list: AddressSuggestion[] = res.success ? res.suggestions : [];
      setSuggestions(list);
      setOpen(list.length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const timer = setTimeout(() => fetchSuggestions(value), 300);
    return () => clearTimeout(timer);
  }, [value, fetchSuggestions]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const select = (s: AddressSuggestion) => {
    justSelected.current = true;
    onChange(s.line1);
    onSelectAddress(s);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        select(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <input
        type="text"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
        autoComplete={autoComplete}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 && (
        <ul className={styles.list} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === activeIndex}
              className={`${styles.item} ${i === activeIndex ? styles.active : ''}`}
              onMouseDown={(e) => { e.preventDefault(); select(s); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
