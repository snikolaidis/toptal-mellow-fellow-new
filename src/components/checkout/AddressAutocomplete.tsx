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
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());

  const fetchSuggestions = useCallback(async (q: string) => {
    const query = q.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const cached = cacheRef.current.get(query.toLowerCase());
    if (cached) {
      setSuggestions(cached);
      setOpen(cached.length > 0);
      setActiveIndex(-1);
      return;
    }
    // Cancel the previous in-flight request so only the latest keystroke resolves.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/address-autocomplete?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      }).then((r) => r.json());
      const list: AddressSuggestion[] = res.success ? res.suggestions : [];
      cacheRef.current.set(query.toLowerCase(), list);
      setSuggestions(list);
      setOpen(list.length > 0);
      setActiveIndex(-1);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setSuggestions([]);
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const timer = setTimeout(() => fetchSuggestions(value), 180);
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

  const select = async (s: AddressSuggestion) => {
    justSelected.current = true;
    setOpen(false);
    setActiveIndex(-1);
    let chosen = s;
    // Google predictions arrive without a structured address; resolve it on select.
    if (!s.line1 && s.id) {
      try {
        const res = await fetch(
          `/api/address-autocomplete?placeId=${encodeURIComponent(s.id)}`
        ).then((r) => r.json());
        if (res.success && res.suggestion) {
          chosen = res.suggestion;
        }
      } catch {
        // keep the typed value if details lookup fails
      }
    }
    onChange(chosen.line1 || value);
    onSelectAddress(chosen);
    setSuggestions([]);
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
