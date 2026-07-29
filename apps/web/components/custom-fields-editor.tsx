'use client';

import { ListPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { api } from '@/lib/api';
import { resilientApi } from '@/lib/offline-queue';
import { hasAnyRole } from '@/lib/roles';
import { Modal } from './modal';

interface Definition {
  id: string;
  key: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: string[];
}

interface StoredValue {
  definition: Definition;
  value: unknown;
}

export function CustomFieldsEditor({
  entity,
  entityId,
  compact = true,
}: {
  entity: string;
  entityId: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const show = async () => {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const [fields, stored] = await Promise.all([
        api<Definition[]>(`/configuration/custom-fields?entity=${entity}`),
        api<StoredValue[]>(`/configuration/custom-values/${entity}/${entityId}`),
      ]);
      setDefinitions(fields);
      setValues(Object.fromEntries(stored.map((row) => [row.definition.key, row.value])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await resilientApi(`/configuration/custom-values/${entity}/${entityId}`, {
        method: 'PATCH',
        body: JSON.stringify({ values }),
      });
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const set = (definition: Definition, raw: string | boolean) => {
    const value = definition.type === 'NUMBER' && raw !== '' ? Number(raw) : raw;
    setValues((current) => ({ ...current, [definition.key]: value }));
  };

  if (!hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN'])) return null;

  return (
    <>
      <button
        type="button"
        className={compact ? 'icon-button' : 'secondary-button'}
        onClick={() => void show()}
        title="Rubriques personnalisées"
      >
        <ListPlus size={17} /> {!compact && 'Rubriques'}
      </button>
      {open && (
        <Modal title="Rubriques personnalisées" eyebrow={entity} onClose={() => setOpen(false)}>
          {error && <div className="alert error">{error}</div>}
          {loading ? (
            <div className="empty-state">Chargement…</div>
          ) : definitions.length === 0 ? (
            <div className="empty-state">
              Aucune rubrique définie. Un administrateur ou le super-administrateur peut en créer
              dans le centre de contrôle.
            </div>
          ) : (
            <form onSubmit={save}>
              <div className="form-grid">
                {definitions.map((definition) => (
                  <label
                    className={`field ${definition.type === 'TEXTAREA' ? 'full' : ''}`}
                    key={definition.id}
                  >
                    <span>
                      {definition.label} {definition.required ? '*' : ''}
                    </span>
                    {definition.type === 'TEXTAREA' ? (
                      <textarea
                        required={definition.required}
                        placeholder={definition.placeholder}
                        value={String(values[definition.key] ?? '')}
                        onChange={(event) => set(definition, event.target.value)}
                      />
                    ) : definition.type === 'SELECT' ? (
                      <select
                        required={definition.required}
                        value={String(values[definition.key] ?? '')}
                        onChange={(event) => set(definition, event.target.value)}
                      >
                        <option value="">Sélectionner</option>
                        {(definition.options ?? []).map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : definition.type === 'BOOLEAN' ? (
                      <select
                        required={definition.required}
                        value={String(values[definition.key] ?? '')}
                        onChange={(event) =>
                          set(definition, event.target.value === 'true' ? true : false)
                        }
                      >
                        <option value="">Sélectionner</option>
                        <option value="true">Oui</option>
                        <option value="false">Non</option>
                      </select>
                    ) : (
                      <input
                        required={definition.required}
                        type={
                          definition.type === 'NUMBER'
                            ? 'number'
                            : definition.type === 'DATE'
                              ? 'date'
                              : 'text'
                        }
                        placeholder={definition.placeholder}
                        value={String(values[definition.key] ?? '')}
                        onChange={(event) => set(definition, event.target.value)}
                      />
                    )}
                    {definition.helpText && <small>{definition.helpText}</small>}
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
                  Annuler
                </button>
                <button className="primary-button" disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
