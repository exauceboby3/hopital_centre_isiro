'use client';

import { FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './data-exchange-launcher.css';

export function DataExchangeLauncher() {
  const pathname = usePathname();
  if (pathname.startsWith('/data-exchange') || pathname.startsWith('/print')) return null;
  return (
    <Link
      className="data-exchange-launcher"
      href="/data-exchange"
      title="Importer ou exporter en PDF, Excel et CSV"
      aria-label="Ouvrir les imports et exports"
    >
      <FileSpreadsheet size={19} />
      <span>PDF · Excel · CSV</span>
    </Link>
  );
}
