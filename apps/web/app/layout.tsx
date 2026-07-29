import type { Metadata, Viewport } from 'next';
import { AppInstallAction } from '@/components/app-install-action';
import { AuthProvider } from '@/components/auth-provider';
import { BrowserBranding } from '@/components/browser-branding';
import './globals.css';
import './software-branding.css';

export const metadata: Metadata = {
  title: "Centre Hospitalier d'Isiro",
  description: 'Plateforme sécurisée de gestion hospitalière',
  applicationName: 'CHI Isiro',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CHI Isiro',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/software-logo.svg',
    shortcut: '/software-logo.svg',
    apple: '/software-logo.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#004a44',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <BrowserBranding />
        <AuthProvider>
          <AppInstallAction />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
