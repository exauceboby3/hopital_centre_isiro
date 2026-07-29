'use client';

import { Activity, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Modal } from './modal';

interface ResultField {
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'SELECT' | 'LONG_TEXT';
  unit?: string;
  reference?: string;
  required: boolean;
  options?: string[];
}

interface LaboratoryService {
  id: string;
  code: string;
  name: string;
  category?: string;
  price: string;
  isActive: boolean;
  labResultTemplate?:
    | ResultField[]
    | {
        version?: number;
        specimenType?: string;
        method?: string;
        fields?: ResultField[];
      };
}

interface CatalogForm {
  code: string;
  name: string;
  category: string;
  specimenType: string;
  method: string;
  price: string;
  isActive: boolean;
  resultFields: ResultField[];
}

const emptyField = (): ResultField => ({
  key: '',
  label: '',
  type: 'TEXT',
  unit: '',
  reference: '',
  required: true,
  options: [],
});

const emptyForm = (): CatalogForm => ({
  code: '',
  name: '',
  category: 'Autres examens',
  specimenType: '',
  method: '',
  price: '',
  isActive: true,
  resultFields: [emptyField()],
});

function templateOf(service: LaboratoryService) {
  if (Array.isArray(service.labResultTemplate)) {
    return { fields: service.labResultTemplate, specimenType: '', method: '' };
  }
  return {
    fields: service.labResultTemplate?.fields?.length
      ? service.labResultTemplate.fields
      : [emptyField()],
    specimenType: service.labResultTemplate?.specimenType ?? '',
    method: service.labResultTemplate?.method ?? '',
  };
}

const normalizeKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

export function LabCatalogEditor() {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<LaboratoryService[]>([]);
  const [editing, setEditing] = useState<LaboratoryService | null>(null);
  const [form, setForm] = useState<CatalogForm>(emptyForm);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setServices(await api<LaboratoryService[]>('/billing/services?type=LABORATORY'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Catalogue indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const startNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setNotice('');
  };

  const startEdit = (service: LaboratoryService) => {
    const template = templateOf(service);
    setEditing(service);
    setForm({
      code: service.code,
      name: service.name,
      category: service.category || 'Autres examens',
      specimenType: template.specimenType,
      method: template.method,
      price: service.price,
      isActive: service.isActive,
      resultFields: template.fields.map((field) => ({
        ...field,
        unit: field.unit ?? '',
        reference: field.reference ?? '',
        options: field.options ?? [],
      })),
    });
    setNotice('');
  };

  const setField = (index: number, changes: Partial<ResultField>) => {
    setForm((current) => ({
      ...current,
      resultFields: current.resultFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...changes } : field,
      ),
    }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const fields = form.resultFields.map((field, index) => ({
      ...field,
      key: normalizeKey(field.key || field.label || `rubrique_${index + 1}`),
      label: field.label.trim(),
      unit: field.unit?.trim() || undefined,
      reference: field.reference?.trim() || undefined,
      options:
        field.type === 'SELECT'
          ? (field.options ?? []).map((option) => option.trim()).filter(Boolean)
          : undefined,
    }));
    if (fields.some((field) => !field.key || !field.label)) {
      setError('Chaque rubrique doit avoir une clé et un libellé.');
      return;
    }
    if (new Set(fields.map((field) => field.key)).size !== fields.length) {
      setError('Deux rubriques ne peuvent pas utiliser la même clé.');
      return;
    }
    if (
      fields.some(
        (field) => field.type === 'SELECT' && (!field.options || field.options.length < 2),
      )
    ) {
      setError('Une rubrique à choix doit proposer au moins deux valeurs.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api(editing ? `/laboratory/exams/catalog/${editing.id}` : '/laboratory/exams/catalog', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          category: form.category.trim(),
          specimenType: form.specimenType.trim() || undefined,
          method: form.method.trim() || undefined,
          price: Number(form.price),
          isActive: form.isActive,
          resultFields: fields,
        }),
      });
      setNotice(editing ? 'Examen mis à jour.' : 'Examen ajouté au catalogue.');
      startNew();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = services.filter((service) =>
    `${service.code} ${service.name} ${service.category ?? ''}`
      .toLocaleLowerCase('fr')
      .includes(query.trim().toLocaleLowerCase('fr')),
  );

  return (
    <>
      <button className="secondary-button" onClick={() => setOpen(true)}>
        <Settings2 size={17} /> Configurer les examens
      </button>
      {open && (
        <Modal
          wide
          title="Catalogue des examens"
          eyebrow="Unités, références et méthode"
          onClose={() => setOpen(false)}
        >
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          <div className="lab-catalog-editor">
            <aside className="lab-catalog-list">
              <div className="lab-catalog-list-heading">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher un examen…"
                />
                <button className="primary-button" onClick={startNew} type="button">
                  <Plus size={16} /> Nouveau
                </button>
              </div>
              <div className="lab-catalog-list-scroll">
                {loading ? (
                  <div className="empty-state"><Activity className="spin" /></div>
                ) : filtered.length === 0 ? (
                  <div className="empty-state">Aucun examen trouvé.</div>
                ) : (
                  filtered.map((service) => {
                    const template = templateOf(service);
                    return (
                      <button
                        type="button"
                        className={editing?.id === service.id ? 'lab-catalog-item active' : 'lab-catalog-item'}
                        key={service.id}
                        onClick={() => startEdit(service)}
                      >
                        <span>
                          <strong>{service.name}</strong>
                          <small>{service.code} · {service.category || 'Sans catégorie'}</small>
                          <small>{template.fields.length} rubrique(s){template.specimenType ? ` · ${template.specimenType}` : ''}</small>
                        </span>
                        <Pencil size={15} />
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <form className="lab-catalog-form" onSubmit={save}>
              <div className="form-grid">
                <label className="field"><span>Référence *</span><input required maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
                <label className="field"><span>Prix CDF *</span><input required min="1" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
                <label className="field full"><span>Nom de l’examen *</span><input required maxLength={150} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label className="field"><span>Rubrique / catégorie *</span><input required maxLength={100} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
                <label className="field"><span>Type d’échantillon</span><input maxLength={150} placeholder="Sang total, sérum, urine…" value={form.specimenType} onChange={(event) => setForm({ ...form, specimenType: event.target.value })} /></label>
                <label className="field full"><span>Méthode</span><input maxLength={200} placeholder="Méthode analytique ou automate" value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} /></label>
                <label className="check-row full"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>Examen actif et disponible à la prescription</span></label>
              </div>

              <div className="lab-result-fields-heading">
                <div><strong>Tableau du résultat</strong><small>Ces unités et références seront reprises automatiquement lors de la saisie.</small></div>
                <button type="button" className="secondary-button" onClick={() => setForm((current) => ({ ...current, resultFields: [...current.resultFields, emptyField()] }))}><Plus size={15} /> Ajouter une rubrique</button>
              </div>

              <div className="lab-result-fields">
                {form.resultFields.map((field, index) => (
                  <article className="lab-result-field-card" key={`${field.key}-${index}`}>
                    <div className="lab-result-field-number">{index + 1}</div>
                    <div className="form-grid">
                      <label className="field"><span>Libellé *</span><input required maxLength={120} value={field.label} onChange={(event) => setField(index, { label: event.target.value, key: field.key || normalizeKey(event.target.value) })} /></label>
                      <label className="field"><span>Clé technique *</span><input required maxLength={60} value={field.key} onChange={(event) => setField(index, { key: normalizeKey(event.target.value) })} /></label>
                      <label className="field"><span>Type *</span><select value={field.type} onChange={(event) => setField(index, { type: event.target.value as ResultField['type'] })}><option value="TEXT">Texte</option><option value="NUMBER">Nombre</option><option value="SELECT">Choix</option><option value="LONG_TEXT">Texte long</option></select></label>
                      <label className="field"><span>Unité</span><input maxLength={40} placeholder="g/dL, mmol/L…" value={field.unit ?? ''} onChange={(event) => setField(index, { unit: event.target.value })} /></label>
                      <label className="field full"><span>Valeur de référence</span><input maxLength={120} placeholder="Ex. Adulte : 12–17" value={field.reference ?? ''} onChange={(event) => setField(index, { reference: event.target.value })} /></label>
                      {field.type === 'SELECT' && <label className="field full"><span>Choix possibles *</span><input value={(field.options ?? []).join(', ')} placeholder="Négatif, Positif, Indéterminé" onChange={(event) => setField(index, { options: event.target.value.split(',') })} /></label>}
                      <label className="check-row"><input type="checkbox" checked={field.required} onChange={(event) => setField(index, { required: event.target.checked })} /><span>Rubrique obligatoire</span></label>
                    </div>
                    <button type="button" className="icon-button danger" title="Retirer la rubrique" disabled={form.resultFields.length === 1} onClick={() => setForm((current) => ({ ...current, resultFields: current.resultFields.filter((_, fieldIndex) => fieldIndex !== index) }))}><Trash2 size={16} /></button>
                  </article>
                ))}
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Fermer</button>
                <button className="primary-button" disabled={saving}>{saving && <Activity className="spin" size={16} />}{editing ? 'Mettre à jour l’examen' : 'Ajouter l’examen'}</button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
