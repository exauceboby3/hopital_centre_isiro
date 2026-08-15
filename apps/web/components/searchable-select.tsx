'use client';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

const SEARCH_PAGE_SIZE = 80;

export interface SearchableOption {
  value: string;
  label: string;
  shortLabel?: string;
  description?: string;
  disabled?: boolean;
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Rechercher et sélectionner…',
  required = false,
  disabled = false,
  className = '',
  helpText,
}: {
  label: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  helpText?: string;
}) {
  const root = useRef<HTMLLabelElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selected?.label ?? '');
  }, [selected?.label]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = useMemo(() => {
    const search = normalize(query);
    if (!search || selected?.label === query) return options.slice(0, 80);
    return options
      .filter((option) => normalize(`${option.label} ${option.description ?? ''}`).includes(search))
      .slice(0, 80);
  }, [options, query, selected?.label]);

  return (
    <label ref={root} className={`field searchable-field ${className}`}>
      <span>
        {label} {required ? '*' : ''}
      </span>
      <div className={`searchable-select ${open ? 'open' : ''}`}>
        <Search size={17} aria-hidden="true" />
        <input
          required={required}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange('');
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && open && filtered.length === 1) {
              event.preventDefault();
              const first = filtered[0];
              if (first) {
                onChange(first.value);
                setQuery(first.label);
                setOpen(false);
              }
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (!value) setQuery('');
            }, 120);
          }}
        />
        {value ? (
          <button
            type="button"
            className="searchable-clear"
            aria-label={`Effacer ${label}`}
            onClick={() => {
              onChange('');
              setQuery('');
            }}
          >
            <X size={16} />
          </button>
        ) : (
          <ChevronDown size={17} aria-hidden="true" />
        )}
        {open && !disabled && (
          <div id={listboxId} className="searchable-options" role="listbox">
            {filtered.length === 0 ? (
              <div className="searchable-empty">Aucun résultat</div>
            ) : (
              filtered.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  key={option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setQuery(option.label);
                    setOpen(false);
                  }}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {option.value === value && <Check size={16} />}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {helpText && <small>{helpText}</small>}
    </label>
  );
}

export function SearchableMultiSelect({
  label,
  values,
  options,
  onChange,
  placeholder = 'Rechercher puis cocher…',
  required = false,
  disabled = false,
  className = '',
  helpText,
  expanded = false,
}: {
  label: string;
  values: string[];
  options: SearchableOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  helpText?: string;
  expanded?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const labelId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(SEARCH_PAGE_SIZE);
  const selected = useMemo(
    () => values.map((value) => options.find((option) => option.value === value)).filter(Boolean),
    [options, values],
  ) as SearchableOption[];

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!expanded && !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [expanded]);

  const matchingOptions = useMemo(() => {
    const search = normalize(query.trim());
    return options.filter((option) =>
      search
        ? normalize(`${option.value} ${option.label} ${option.description ?? ''}`).includes(search)
        : true,
    );
  }, [options, query]);

  const filtered = useMemo(
    () => matchingOptions.slice(0, visibleCount),
    [matchingOptions, visibleCount],
  );

  useEffect(() => {
    setVisibleCount(SEARCH_PAGE_SIZE);
  }, [query, options]);

  const toggle = (value: string) => {
    onChange(
      values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value],
    );
  };

  return (
    <div ref={root} className={`field searchable-field searchable-multi-field ${className}`}>
      <span id={labelId}>
        {label} {required ? '*' : ''}
      </span>
      {selected.length > 0 && (
        <div className="searchable-selected-values" aria-label={`${label} sélectionnés`}>
          {selected.map((option) => (
            <span key={option.value}>
              {option.shortLabel ?? option.label}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Retirer ${option.label}`}
                  onClick={() => toggle(option.value)}
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div
        className={`searchable-select ${open || expanded ? 'open' : ''}${expanded ? ' expanded' : ''}`}
      >
        <Search size={17} aria-hidden="true" />
        <input
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-labelledby={labelId}
          aria-expanded={open || expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        />
        <ChevronDown size={17} aria-hidden="true" />
        {(open || expanded) && !disabled && (
          <div id={listboxId} className="searchable-options" role="listbox" aria-multiselectable>
            {filtered.length === 0 ? (
              <div className="searchable-empty">Aucun résultat</div>
            ) : (
              <>
                {filtered.map((option) => {
                  const checked = values.includes(option.value);
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      disabled={option.disabled}
                      key={option.value}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => toggle(option.value)}
                    >
                      <span>
                        <strong>{option.label}</strong>
                        {option.description && <small>{option.description}</small>}
                      </span>
                      <span className={`searchable-checkbox${checked ? ' checked' : ''}`}>
                        {checked && <Check size={14} />}
                      </span>
                    </button>
                  );
                })}
                {filtered.length < matchingOptions.length && (
                  <button
                    type="button"
                    className="searchable-load-more"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setVisibleCount((count) => count + SEARCH_PAGE_SIZE)}
                  >
                    Afficher les {Math.min(
                      SEARCH_PAGE_SIZE,
                      matchingOptions.length - filtered.length,
                    )}{' '}
                    suivants · {filtered.length.toLocaleString('fr-FR')} sur{' '}
                    {matchingOptions.length.toLocaleString('fr-FR')}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {helpText && <small>{helpText}</small>}
    </div>
  );
}
