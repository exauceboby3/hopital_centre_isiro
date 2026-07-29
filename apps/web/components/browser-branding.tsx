'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import {
  applyBrowserBranding,
  cachedBranding,
  HOSPITAL_BRANDING_CHANGED_EVENT,
  HospitalBranding,
  publishBranding,
} from '@/lib/branding';

export function BrowserBranding() {
  useEffect(() => {
    const cached = cachedBranding();
    if (cached) applyBrowserBranding(cached);

    const applyUpdate = (event: Event) => {
      if (event instanceof CustomEvent) {
        applyBrowserBranding(event.detail as HospitalBranding);
      }
    };
    window.addEventListener(HOSPITAL_BRANDING_CHANGED_EVENT, applyUpdate);
    void api<HospitalBranding>('/health/branding')
      .then(publishBranding)
      .catch(() => undefined);

    return () => window.removeEventListener(HOSPITAL_BRANDING_CHANGED_EVENT, applyUpdate);
  }, []);

  return null;
}
