'use client';

import { Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CLOSE_PRINT_PREVIEW_MESSAGE } from './print-mode-layout';
import { Modal } from './modal';

const printableKindAliases: Record<string, string> = {
  laboratory: 'lab',
};

export function PrintPreviewModal({
  title,
  subtitle,
  src,
  printable = true,
  onClose,
}: {
  title: string;
  subtitle?: string;
  src: string;
  printable?: boolean;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === CLOSE_PRINT_PREVIEW_MESSAGE) onClose();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose]);

  return (
    <Modal wide title={title} eyebrow={subtitle ?? 'Aperçu avant impression'} onClose={onClose}>
      <div className="embedded-print-preview">
        <iframe ref={frame} src={src} title={title} />
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Fermer
        </button>
        {printable && (
          <button
            type="button"
            className="primary-button"
            onClick={() => frame.current?.contentWindow?.print()}
          >
            <Printer size={17} /> Imprimer / PDF
          </button>
        )}
      </div>
    </Modal>
  );
}

type DirectPreviewProps = {
  src: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  printable?: boolean;
  kind?: never;
  id?: never;
  label?: never;
  icon?: never;
};

type DocumentPreviewProps = {
  kind: string;
  id: string;
  label: string;
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  disabled?: boolean;
  printable?: boolean;
  src?: never;
  children?: never;
};

type PrintPreviewButtonProps = DirectPreviewProps | DocumentPreviewProps;

export function PrintPreviewButton(props: PrintPreviewButtonProps) {
  const [open, setOpen] = useState(false);
  const className = props.className ?? 'text-button';
  const disabled = props.disabled ?? false;
  const printable = props.printable ?? true;

  let src: string;
  let title: string;
  let subtitle: string | undefined;
  let children: ReactNode;

  if (typeof props.kind === 'string') {
    const printableKind = printableKindAliases[props.kind] ?? props.kind;
    src = `/print?kind=${encodeURIComponent(printableKind)}&id=${encodeURIComponent(props.id)}`;
    title = props.title ?? props.label;
    subtitle = props.subtitle;
    children = (
      <>
        {props.icon ?? <Printer size={15} />} {props.label}
      </>
    );
  } else {
    src = props.src;
    title = props.title;
    subtitle = props.subtitle;
    children = props.children;
  }

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <PrintPreviewModal
          title={title}
          subtitle={subtitle}
          src={src}
          printable={printable}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
