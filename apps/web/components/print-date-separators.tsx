'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

function applyDateSeparators() {
  const heading = [...document.querySelectorAll<HTMLHeadingElement>('h3')].find((element) =>
    element.textContent?.includes('Historique médical complet'),
  );
  const table = heading?.nextElementSibling;
  if (!(table instanceof HTMLTableElement)) return;

  let previousDate = '';
  table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
    const dateCell = row.cells.item(0);
    const currentDate = dateCell?.textContent?.trim().split(/\s+/)[0] ?? '';
    row.classList.toggle('print-date-break', Boolean(currentDate && currentDate !== previousDate));
    if (currentDate) previousDate = currentDate;
  });
}

export function PrintDateSeparators() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/print') return;

    applyDateSeparators();
    const observer = new MutationObserver(() => applyDateSeparators());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
