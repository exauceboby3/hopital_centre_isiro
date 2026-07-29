import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import eslintConfigPrettier from 'eslint-config-prettier';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
  {
    rules: {
      // Les pages clientes synchronisent volontairement leur état avec l'API protégée.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: [
      'app/(protected)/financial-assistance/page.tsx',
      'app/(protected)/clinical-governance/page.tsx',
      'app/(protected)/doctor-waiting-room/page.tsx',
      'app/(protected)/emergency-access/page.tsx',
    ],
    rules: {
      // Ces écrans opérationnels calculent des délais et expirations depuis l'heure réelle du navigateur.
      'react-hooks/purity': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
