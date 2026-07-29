import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Centre Hospitalier d'Isiro",
    short_name: 'CHI Isiro',
    description: 'Gestion hospitalière sécurisée, avec continuité hors ligne.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#004a44',
    theme_color: '#004a44',
    lang: 'fr',
    icons: [
      { src: '/software-logo.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      { src: '/software-logo.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
