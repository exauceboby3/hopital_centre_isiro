export interface HospitalBranding {
  name: string;
  legalName?: string;
  logoDataUrl?: string | null;
  documentAccentColor?: string;
  updatedAt?: string;
}

export const HOSPITAL_PROFILE_UPDATED_EVENT = 'hospital-profile-updated';
export const HOSPITAL_BRANDING_CHANGED_EVENT = 'hospital-branding-changed';
const CACHE_KEY = 'hospital-public-branding';
const SOFTWARE_ICON = '/software-logo.svg';

export function cachedBranding(): HospitalBranding | null {
  try {
    const value = window.localStorage.getItem(CACHE_KEY);
    return value ? (JSON.parse(value) as HospitalBranding) : null;
  } catch {
    return null;
  }
}

export function publishBranding(branding: HospitalBranding) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(branding));
  } catch {
    // Le favicon reste actif même si le stockage local est saturé ou désactivé.
  }
  window.dispatchEvent(
    new CustomEvent<HospitalBranding>(HOSPITAL_BRANDING_CHANGED_EVENT, { detail: branding }),
  );
}

export function applyBrowserBranding(branding: HospitalBranding) {
  document.title = branding.legalName || branding.name;
  setIcon('icon', 'hospital-favicon', SOFTWARE_ICON);
  setIcon('shortcut icon', 'hospital-shortcut-icon', SOFTWARE_ICON);
  setIcon('apple-touch-icon', 'hospital-apple-icon', SOFTWARE_ICON);
}

function setIcon(rel: string, key: string, href: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[data-hospital-icon="${key}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    link.dataset.hospitalIcon = key;
    document.head.appendChild(link);
  }
  link.href = href;
}
