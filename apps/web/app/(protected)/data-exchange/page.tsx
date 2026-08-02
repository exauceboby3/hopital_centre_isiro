'use client';

import {
  Activity,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  downloadApiFile,
  saveDownloadedFile,
} from '@/lib/data-exchange-client';
import './data-exchange.css';

type Column = {
  key: string;
  label: string;
  kind: string;
  required?: boolean;
  description?: string;
};

type CatalogItem = {
  key: string;
  label: string;
  description: string;
  canExport: boolean;
  canImport: boolean;
  exportFormats: string[];
  importFormats: string[];
  columns: Column[];
};

type PreviewRow = {
  rowNumber: number;
  values: Record<string, unknown>;
  errors: string[];
  warnings: string[];
};

type Preview = {
  dataset: string;
  fileName: string;
  format: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  columns: Column[];
  rows: PreviewRow[];
  canCommit: boolean;
  truncated?: boolean;
};

type ImportResult = {
  importedRows: number;
  created: number;
  updated: number;
};

const today = new Date().toISOString().slice(0, 10);

export default function DataExchangePage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [dataset, setDataset] = useState('');
  const [filters, setFilters] = useState({ from: '', to: today, department: '', status: '', search: '' });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<CatalogItem[]>('/data-exchange/catalog');
      setCatalog(rows);
      setDataset((current) => current || rows[0]?.key || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Catalogue indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const selected = useMemo(
    () => catalog.find((item) => item.key === dataset) ?? null,
    [catalog, dataset],
  );

  const query = useMemo(() => {
    const parameters = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) parameters.set(key, value.trim());
    });
    const text = parameters.toString();
    return text ? `?${text}` : '';
  }, [filters]);

  const download = async (format: 'pdf' | 'xlsx' | 'csv') => {
    if (!selected) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const downloaded = await downloadApiFile(
        `/data-exchange/export/${selected.key}/${format}${query}`,
        `${selected.key}.${format}`,
      );
      saveDownloadedFile(downloaded);
      setNotice(`${selected.label} exporté en ${format.toUpperCase()}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Export impossible.');
    } finally {
      setWorking(false);
    }
  };

  const downloadTemplate = async (format: 'xlsx' | 'csv') => {
    if (!selected) return;
    setWorking(true);
    setError('');
    try {
      const downloaded = await downloadApiFile(
        `/data-exchange/template/${selected.key}/${format}`,
        `modele-${selected.key}.${format}`,
      );
      saveDownloadedFile(downloaded);
      setNotice(`Modèle ${format.toUpperCase()} téléchargé.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Modèle indisponible.');
    } finally {
      setWorking(false);
    }
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setResult(null);
    setError('');
    setNotice('');
  };

  const sendImport = async (action: 'preview' | 'commit') => {
    if (!selected || !file) return;
    const form = new FormData();
    form.append('file', file);
    setWorking(true);
    setError('');
    setNotice('');
    try {
      if (action === 'preview') {
        const response = await api<Preview>(
          `/data-exchange/import/${selected.key}/preview`,
          { method: 'POST', body: form },
        );
        setPreview(response);
        setResult(null);
        setNotice(
          response.canCommit
            ? 'Prévisualisation validée. Vous pouvez confirmer l’import.'
            : 'Le fichier contient des erreurs à corriger avant l’import.',
        );
      } else {
        const response = await api<ImportResult>(
          `/data-exchange/import/${selected.key}/commit`,
          { method: 'POST', body: form },
        );
        setResult(response);
        setNotice('Import terminé et journalisé.');
        setPreview(null);
        setFile(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import impossible.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <section className="panel empty-state"><Activity className="spin" /> Chargement des échanges de données…</section>;
  }

  return (
    <div className="data-exchange-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Centre de données</span>
          <h1>PDF, Excel, CSV et imports contrôlés</h1>
          <p>Exports avec filtres, modèles officiels, prévisualisation et validation ligne par ligne.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()} disabled={working}>
          <RefreshCw size={17} /> Actualiser
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <section className="exchange-dataset-grid" aria-label="Jeux de données disponibles">
        {catalog.map((item) => (
          <button
            key={item.key}
            className={item.key === dataset ? 'exchange-dataset active' : 'exchange-dataset'}
            onClick={() => {
              setDataset(item.key);
              setPreview(null);
              setFile(null);
              setResult(null);
            }}
          >
            <FileSpreadsheet size={20} />
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
            <b>{item.canImport ? 'Import + export' : 'Export'}</b>
          </button>
        ))}
      </section>

      {selected && (
        <div className="exchange-layout">
          <section className="panel exchange-export-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Export sécurisé</span><h2>{selected.label}</h2></div>
              <FileDown />
            </div>
            <div className="form-grid exchange-filters">
              <label className="field"><span>Date de début</span><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
              <label className="field"><span>Date de fin</span><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
              <label className="field"><span>Département / service</span><input value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })} placeholder="Tous" /></label>
              <label className="field"><span>Statut</span><input value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} placeholder="Tous" /></label>
              <label className="field full"><span>Recherche</span><div className="input-with-icon"><Filter size={16} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Numéro, nom, code, produit…" /></div></label>
            </div>
            <div className="exchange-format-actions">
              <button className="primary-button" disabled={working || !selected.canExport} onClick={() => void download('pdf')}><Download size={16} /> PDF</button>
              <button className="secondary-button" disabled={working || !selected.canExport} onClick={() => void download('xlsx')}><Download size={16} /> Excel</button>
              <button className="secondary-button" disabled={working || !selected.canExport} onClick={() => void download('csv')}><Download size={16} /> CSV</button>
            </div>
            <p className="exchange-security-note"><ShieldCheck size={16} /> Chaque export est enregistré dans le journal d’audit. Les données visibles dépendent du rôle connecté.</p>
          </section>

          <section className="panel exchange-import-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Import contrôlé</span><h2>Ajouter des données</h2></div>
              <Upload />
            </div>
            {!selected.canImport ? (
              <div className="alert info">Pour protéger le dossier médical et la comptabilité, ce module est disponible uniquement en export.</div>
            ) : (
              <>
                <p>Utilisez le modèle officiel. La validation ne modifie aucune donnée tant que l’import n’est pas confirmé.</p>
                <div className="exchange-template-actions">
                  <button className="text-button" disabled={working} onClick={() => void downloadTemplate('xlsx')}>Modèle Excel</button>
                  <button className="text-button" disabled={working} onClick={() => void downloadTemplate('csv')}>Modèle CSV</button>
                </div>
                <label className="exchange-file-drop">
                  <Upload size={24} />
                  <strong>{file?.name || 'Choisir un fichier CSV ou Excel'}</strong>
                  <small>10 Mo maximum · 5 000 lignes</small>
                  <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} />
                </label>
                <button className="primary-button" disabled={working || !file} onClick={() => void sendImport('preview')}>
                  {working && <Activity className="spin" size={16} />} Prévisualiser et vérifier
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {result && (
        <section className="panel import-result-card">
          <CheckCircle2 />
          <div><h2>Import terminé</h2><p>{result.importedRows} ligne(s) traitée(s), {result.created} création(s), {result.updated} mise(s) à jour.</p></div>
        </section>
      )}

      {preview && (
        <section className="panel exchange-preview">
          <div className="panel-heading">
            <div><span className="eyebrow">Prévisualisation</span><h2>{preview.fileName}</h2></div>
            <div className="preview-kpis">
              <span><b>{preview.totalRows}</b> lignes</span>
              <span className="success"><b>{preview.validRows}</b> valides</span>
              <span className={preview.invalidRows ? 'danger' : ''}><b>{preview.invalidRows}</b> invalides</span>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Ligne</th><th>État</th>{preview.columns.map((column) => <th key={column.key}>{column.label}{column.required ? ' *' : ''}</th>)}</tr></thead>
              <tbody>
                {preview.rows.slice(0, 500).map((row) => (
                  <tr key={row.rowNumber} className={row.errors.length ? 'invalid-row' : ''}>
                    <td>{row.rowNumber}</td>
                    <td>
                      {row.errors.length ? <XCircle className="danger-text" size={18} /> : <CheckCircle2 className="success-text" size={18} />}
                      {row.errors.map((message) => <small className="row-error" key={message}>{message}</small>)}
                      {row.warnings.map((message) => <small className="row-warning" key={message}>{message}</small>)}
                    </td>
                    {preview.columns.map((column) => <td key={column.key}>{String(row.values[column.key] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.totalRows > 500 && <p className="muted">Les 500 premières lignes sont affichées. Toutes les lignes ont néanmoins été validées.</p>}
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setPreview(null)}>Annuler</button>
            <button className="primary-button" disabled={working || !preview.canCommit || !file} onClick={() => void sendImport('commit')}>
              <ShieldCheck size={16} /> Confirmer l’import
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
