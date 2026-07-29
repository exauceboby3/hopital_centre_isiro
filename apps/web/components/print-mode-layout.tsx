'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export const CLOSE_PRINT_PREVIEW_MESSAGE = 'hospital:close-print-preview';

export function PrintModeLayout() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/print') return;
    document.body.classList.add('hospital-print-mode');

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        '.print-toolbar .secondary-button',
      );
      if (!button || !button.textContent?.includes('Fermer')) return;
      event.preventDefault();
      event.stopPropagation();

      if (window.parent !== window) {
        window.parent.postMessage({ type: CLOSE_PRINT_PREVIEW_MESSAGE }, window.location.origin);
        return;
      }
      if (window.opener && !window.opener.closed) {
        window.close();
        return;
      }
      if (window.history.length > 1) window.history.back();
      else window.location.assign('/dashboard');
    };

    document.addEventListener('click', onClick, true);
    return () => {
      document.body.classList.remove('hospital-print-mode');
      document.removeEventListener('click', onClick, true);
    };
  }, [pathname]);

  return null;
}
