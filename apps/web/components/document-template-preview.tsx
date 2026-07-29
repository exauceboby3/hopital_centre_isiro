'use client';

import NextImage from 'next/image';
import { CSSProperties } from 'react';

interface PreviewProfile {
  name: string;
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoDataUrl?: string | null;
  documentHeader?: string;
  invoiceFooter?: string;
  documentAccentColor: string;
  documentPaperSize: string;
  documentOrientation: string;
  documentMarginMm: number;
}

interface PreviewTemplate {
  title?: string;
  headerText?: string;
  footerText?: string;
  paperSize: string;
  orientation: string;
  marginMm: number;
  accentColor?: string;
  showLogo: boolean;
}

export function DocumentTemplatePreview({
  profile,
  template,
}: {
  profile: PreviewProfile;
  template: PreviewTemplate;
}) {
  const accent = template.accentColor || profile.documentAccentColor;
  const landscape = (template.orientation || profile.documentOrientation) === 'LANDSCAPE';
  const style = {
    '--preview-accent': accent,
    '--preview-padding': `${Math.max(5, template.marginMm || profile.documentMarginMm) / 3}px`,
    aspectRatio: landscape ? '1.414 / 1' : '1 / 1.414',
  } as CSSProperties;

  return (
    <aside className="document-live-preview">
      <div>
        <strong>Aperçu en direct</strong>
        <span>
          {template.paperSize || profile.documentPaperSize} · {landscape ? 'Paysage' : 'Portrait'}
        </span>
      </div>
      <article className="document-preview-paper" style={style}>
        <header>
          {template.showLogo &&
            (profile.logoDataUrl ? (
              <NextImage
                unoptimized
                src={profile.logoDataUrl}
                alt={`Logo ${profile.name}`}
                width={54}
                height={54}
              />
            ) : (
              <b>CHI</b>
            ))}
          <div>
            <h3>{profile.name}</h3>
            <p>{profile.legalName}</p>
            <small>
              {[profile.address, profile.phone, profile.email].filter(Boolean).join(' · ')}
            </small>
          </div>
        </header>
        <p className="document-preview-note">
          {template.headerText || profile.documentHeader || 'En-tête du document'}
        </p>
        <h4>{template.title || 'TITRE DU DOCUMENT'}</h4>
        <section className="document-preview-lines">
          <span />
          <span />
          <span />
          <span />
        </section>
        <footer>{template.footerText || profile.invoiceFooter || 'Pied de page'}</footer>
      </article>
      <small>Les modifications du formulaire sont affichées avant leur enregistrement.</small>
    </aside>
  );
}
