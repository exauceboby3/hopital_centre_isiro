'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const classLabels: Record<string, string> = {
  Facture: 'Facturation',
  Paiement: 'Facturation',
  Prescription: 'Prescriptions',
  Laboratoire: 'Laboratoire',
  Consultation: 'Consultations',
  'Signes vitaux': 'Signes vitaux',
  'Soin infirmier': 'Soins infirmiers',
  Hospitalisation: 'Hospitalisations',
  'Imagerie médicale': 'Imagerie médicale',
  DEATH: 'Décès et clôture du dossier',
};

function clean(value: string | null | undefined, fallback = '—') {
  const normalized = value
    ?.replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[:·\-\s]+|[:·\-\s]+$/g, '')
    .trim();
  return normalized || fallback;
}

function text(element: Element | null | undefined, fallback = '—') {
  return clean(element?.textContent, fallback);
}

function createCell(value: string, className: string, label: string) {
  const cell = document.createElement('td');
  cell.className = className;
  cell.dataset.label = label;
  cell.textContent = value;
  return cell;
}

function createStatusCell(value: string) {
  const cell = document.createElement('td');
  cell.className = 'history-status-cell';
  cell.dataset.label = 'Statut';
  const badge = document.createElement('span');
  badge.className = 'history-status-pill';
  badge.dataset.status = value.toUpperCase();
  badge.textContent = value;
  cell.append(badge);
  return cell;
}

function entryRow(entry: HTMLElement) {
  const main = entry.querySelector<HTMLElement>(':scope > div:first-child');
  const meta = entry.querySelector<HTMLElement>('.patient-history-meta');
  const title = text(main?.querySelector('strong'));
  const description = text(main?.querySelector('p'), 'Aucun détail complémentaire');
  const signature = text(main?.querySelector('.patient-history-signature'), '');
  const time = text(meta?.querySelector('time'));
  const status = text(meta?.querySelector('.status-badge'), 'Non précisé');
  const metadata = [...(meta?.querySelectorAll<HTMLElement>(':scope > span:not(.status-badge)') ?? [])]
    .map((item) => text(item, ''))
    .filter(Boolean);

  const row = document.createElement('tr');
  row.className = 'patient-history-table-row';
  row.append(
    createCell(time, 'history-time-cell', 'Heure'),
    createCell(title, 'history-event-cell', 'Événement'),
    createCell(
      signature ? `${description} · ${signature}` : description,
      'history-description-cell',
      'Détails / résultat',
    ),
    createCell(metadata[0] ?? 'Service non précisé', 'history-service-cell', 'Service'),
    createCell(metadata[1] ?? 'Auteur non précisé', 'history-author-cell', 'Auteur'),
    createStatusCell(status),
  );
  return row;
}

function createFolder(label: string, entries: HTMLElement[]) {
  const folder = document.createElement('details');
  folder.className = 'patient-history-class-folder';
  folder.open = true;

  const summary = document.createElement('summary');
  summary.className = 'patient-history-folder-summary';
  const title = document.createElement('strong');
  title.textContent = label;
  const count = document.createElement('span');
  count.textContent = `${entries.length} élément${entries.length > 1 ? 's' : ''}`;
  summary.append(title, count);

  const scroll = document.createElement('div');
  scroll.className = 'patient-history-table-scroll';
  const table = document.createElement('table');
  table.className = 'patient-history-class-table';

  const colgroup = document.createElement('colgroup');
  ['time', 'event', 'description', 'service', 'author', 'status'].forEach((name) => {
    const column = document.createElement('col');
    column.className = `history-column-${name}`;
    colgroup.append(column);
  });

  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Heure', 'Événement', 'Détails / résultat', 'Service', 'Auteur', 'Statut'].forEach(
    (labelValue) => {
      const header = document.createElement('th');
      header.scope = 'col';
      header.textContent = labelValue;
      headerRow.append(header);
    },
  );
  head.append(headerRow);

  const body = document.createElement('tbody');
  entries.forEach((entry) => body.append(entryRow(entry)));
  table.append(colgroup, head, body);
  scroll.append(table);
  folder.append(summary, scroll);
  return folder;
}

function organizeDateGroup(group: HTMLElement) {
  const entries = [...group.querySelectorAll<HTMLElement>(':scope > article')];
  if (!entries.length) return;

  group.querySelector<HTMLElement>(':scope > .patient-history-class-folders')?.remove();
  const classes = new Map<string, HTMLElement[]>();
  entries.forEach((entry) => {
    const rawLabel = entry.querySelector<HTMLElement>('.eyebrow')?.textContent?.trim() || 'Autres éléments';
    const label = classLabels[rawLabel] ?? rawLabel;
    const current = classes.get(label);
    if (current) current.push(entry);
    else classes.set(label, [entry]);
  });

  const container = document.createElement('div');
  container.className = 'patient-history-class-folders';
  classes.forEach((classEntries, label) => container.append(createFolder(label, classEntries)));

  entries.forEach((entry) => entry.remove());
  group.append(container);
  group.dataset.subfoldersReady = 'true';
}

export function PatientHistorySubfolders() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/patients') return;
    let frame = 0;
    const organize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document
          .querySelectorAll<HTMLElement>('.patient-history-date-group')
          .forEach(organizeDateGroup);
      });
    };

    organize();
    const observer = new MutationObserver(organize);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
