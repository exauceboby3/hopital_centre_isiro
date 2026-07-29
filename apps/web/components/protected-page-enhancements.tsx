'use client';

import {
  Activity,
  Camera,
  FlaskConical,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { hasRole } from '@/lib/roles';
import { useAuth } from './auth-provider';
import { Modal } from './modal';
import { UserAvatar } from './user-avatar';
import styles from './protected-page-enhancements.module.css';

type LabFieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'LONG_TEXT';

interface LabFieldDraft {
  id: string;
  key: string;
  label: string;
  type: LabFieldType;
  unit: string;
  reference: string;
  required: boolean;
  options: string;
}

const newField = (index = 1): LabFieldDraft => ({
  id: crypto.randomUUID(),
  key: index === 1 ? 'resultat' : `rubrique_${index}`,
  label: index === 1 ? 'Résultat' : `Rubrique ${index}`,
  type: 'NUMBER',
  unit: '',
  reference: '',
  required: true,
  options: '',
});

const emptyCatalog = {
  code: '',
  name: '',
  category: 'Autres examens',
  price: '',
};

function normalizeKey(value: string, index: number) {
  const normalized = value
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return normalized || `rubrique_${index + 1}`;
}

function LaboratoryCatalogEnhancement() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [fields, setFields] = useState<LabFieldDraft[]>([newField()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!hasRole(user, 'MEDICAL_BIOLOGIST')) return null;

  const updateField = (id: string, patch: Partial<LabFieldDraft>) =>
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api('/laboratory/exams/catalog', {
        method: 'POST',
        body: JSON.stringify({
          ...catalog,
          price: Number(catalog.price),
          resultFields: fields.map((field, index) => ({
            key: normalizeKey(field.key || field.label, index),
            label: field.label.trim(),
            type: field.type,
            unit: field.unit.trim() || undefined,
            reference: field.reference.trim() || undefined,
            required: field.required,
            options:
              field.type === 'SELECT'
                ? field.options
                    .split(',')
                    .map((option) => option.trim())
                    .filter(Boolean)
                : undefined,
          })),
        }),
      });
      setCatalog(emptyCatalog);
      setFields([newField()]);
      setOpen(false);
      setSuccess(
        'Examen ajouté. Les unités et valeurs de référence seront reprises automatiquement lors de la saisie des résultats.',
      );
      window.dispatchEvent(new Event('hospital:lab-catalog-updated'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible d'ajouter l'examen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className={`panel ${styles.labPanel}`}>
        <div className={styles.panelCopy}>
          <span className={styles.panelIcon}>
            <FlaskConical size={21} />
          </span>
          <div>
            <strong>Configuration biologique des examens</strong>
            <p>
              Le biologiste dispose aussi des actions du technicien. Définissez ici les rubriques,
              unités et valeurs de référence une seule fois.
            </p>
          </div>
        </div>
        <button className="secondary-button" onClick={() => setOpen(true)}>
          <Plus size={17} /> Ajouter un examen complet
        </button>
      </section>
      {success && <div className="alert success">{success}</div>}
      {error && <div className="alert error">{error}</div>}

      {open && (
        <Modal
          wide
          title="Ajouter un examen de laboratoire"
          eyebrow="Rubriques, unités et références"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit}>
            <div className="form-grid">
              <label className="field">
                <span>Référence *</span>
                <input
                  required
                  maxLength={40}
                  placeholder="LAB-GLY"
                  value={catalog.code}
                  onChange={(event) => setCatalog({ ...catalog, code: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Prix CDF *</span>
                <input
                  required
                  type="number"
                  min="1"
                  step="0.01"
                  value={catalog.price}
                  onChange={(event) => setCatalog({ ...catalog, price: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Nom de l’examen *</span>
                <input
                  required
                  maxLength={150}
                  value={catalog.name}
                  onChange={(event) => setCatalog({ ...catalog, name: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Catégorie *</span>
                <input
                  required
                  maxLength={100}
                  value={catalog.category}
                  onChange={(event) => setCatalog({ ...catalog, category: event.target.value })}
                />
              </label>
            </div>

            <div className={styles.fieldsHeading}>
              <div>
                <strong>Tableau du résultat</strong>
                <span>Ces informations seront affichées automatiquement à chaque résultat.</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setFields((current) => [...current, newField(current.length + 1)])}
              >
                <Plus size={16} /> Ajouter une rubrique
              </button>
            </div>

            <div className={styles.fieldList}>
              {fields.map((field, index) => (
                <article className={styles.fieldCard} key={field.id}>
                  <div className={styles.fieldCardHeading}>
                    <strong>Rubrique {index + 1}</strong>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() =>
                          setFields((current) => current.filter((item) => item.id !== field.id))
                        }
                        aria-label={`Supprimer la rubrique ${index + 1}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className={styles.fieldGrid}>
                    <label className="field">
                      <span>Libellé *</span>
                      <input
                        required
                        maxLength={120}
                        value={field.label}
                        onChange={(event) =>
                          updateField(field.id, {
                            label: event.target.value,
                            key: normalizeKey(event.target.value, index),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Type *</span>
                      <select
                        value={field.type}
                        onChange={(event) =>
                          updateField(field.id, { type: event.target.value as LabFieldType })
                        }
                      >
                        <option value="NUMBER">Nombre</option>
                        <option value="TEXT">Texte</option>
                        <option value="SELECT">Liste de choix</option>
                        <option value="LONG_TEXT">Texte long</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Unité</span>
                      <input
                        maxLength={40}
                        placeholder="mg/dL, g/L, %, UI/L…"
                        value={field.unit}
                        onChange={(event) => updateField(field.id, { unit: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Valeurs de référence</span>
                      <input
                        maxLength={120}
                        placeholder="70–110, &lt; 6, selon âge…"
                        value={field.reference}
                        onChange={(event) => updateField(field.id, { reference: event.target.value })}
                      />
                    </label>
                    {field.type === 'SELECT' && (
                      <label className="field full">
                        <span>Choix séparés par des virgules *</span>
                        <input
                          required
                          placeholder="Négatif, Positif, Indéterminé"
                          value={field.options}
                          onChange={(event) => updateField(field.id, { options: event.target.value })}
                        />
                      </label>
                    )}
                    <label className={styles.requiredField}>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          updateField(field.id, { required: event.target.checked })
                        }
                      />
                      Résultat obligatoire
                    </label>
                  </div>
                </article>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting || fields.length === 0}>
                {submitting ? <Activity className="spin" size={17} /> : <Save size={17} />}
                Enregistrer l’examen
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function ProfilePhotoEnhancement() {
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [version, setVersion] = useState(() => Date.now());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const previewName = useMemo(() => selectedFile?.name ?? '', [selectedFile]);

  if (!user) return null;

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const data = new FormData();
      data.set('file', selectedFile);
      await api('/users/me/photo', { method: 'POST', body: data });
      setSelectedFile(null);
      setVersion(Date.now());
      setSuccess('Photo de profil mise à jour.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Téléversement impossible.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className={`panel ${styles.photoPanel}`}>
      <UserAvatar userId={user.id} username={user.username} size={78} version={version} />
      <div className={styles.photoCopy}>
        <span className="eyebrow">Photo de profil</span>
        <strong>Ajoutez votre portrait professionnel</strong>
        <p>JPEG, PNG ou WebP, maximum 3 Mo. La photo sera visible dans la messagerie.</p>
        {success && <span className={styles.successText}>{success}</span>}
        {error && <span className={styles.errorText}>{error}</span>}
      </div>
      <form className={styles.photoForm} onSubmit={upload}>
        <label className="secondary-button">
          <Camera size={17} /> Choisir une photo
          <input
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {previewName && <span title={previewName}>{previewName}</span>}
        <button className="primary-button" disabled={!selectedFile || uploading}>
          {uploading ? <Activity className="spin" size={17} /> : <Upload size={17} />}
          Téléverser
        </button>
      </form>
    </section>
  );
}

export function ProtectedPageEnhancements() {
  const pathname = usePathname();

  if (pathname === '/profile') return <ProfilePhotoEnhancement />;
  if (pathname === '/laboratory') return <LaboratoryCatalogEnhancement />;
  return null;
}
