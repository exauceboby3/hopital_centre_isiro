'use client';

import { Search } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
}

interface ListFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  status?: string;
  onStatusChange?: (value: string) => void;
  statusOptions?: FilterOption[];
  resultCount?: number;
  allLabel?: string;
  resultLabel?: string;
}

export function ListFilters({
  query,
  onQueryChange,
  placeholder = 'Rechercher…',
  status,
  onStatusChange,
  statusOptions = [],
  resultCount,
  allLabel = 'Tous les statuts',
  resultLabel = 'résultat(s)',
}: ListFiltersProps) {
  return (
    <div className="table-toolbar list-filters">
      <div className="search-box">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>
      {onStatusChange && statusOptions.length > 0 && (
        <select
          className="table-filter-select"
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
          aria-label="Filtrer par statut"
        >
          <option value="">{allLabel}</option>
          {statusOptions.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {resultCount !== undefined && (
        <span className="filter-result-count">
          {resultCount.toLocaleString('fr-FR')} {resultLabel}
        </span>
      )}
    </div>
  );
}
