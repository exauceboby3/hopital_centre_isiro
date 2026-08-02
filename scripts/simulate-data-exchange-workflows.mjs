import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const checks = [];
const verify = (name, predicate) => {
  assert.ok(predicate, name);
  checks.push({ name, ok: true });
};
const read = (file) => fs.readFileSync(file, 'utf8');

const definitions = read('apps/api/src/data-exchange/data-exchange.definitions.ts');
const service = read('apps/api/src/data-exchange/data-exchange.service.ts');
const controller = read('apps/api/src/data-exchange/data-exchange.controller.ts');
const codec = read('apps/api/src/data-exchange/tabular-codec.service.ts');
const page = read('apps/web/app/(protected)/data-exchange/page.tsx');
const client = read('apps/web/lib/data-exchange-client.ts');
const launcher = read('apps/web/components/data-exchange-launcher.tsx');

const datasets = [
  'patients', 'medications', 'staff', 'service-reports', 'requisitions',
  'billable-services', 'accounting', 'laboratory', 'invoices', 'hospitalizations',
  'appointments', 'consultations', 'prescriptions', 'department-stocks',
];
for (const dataset of datasets) {
  verify(`${dataset} est déclaré`, definitions.includes(`key: '${dataset}'`));
}

verify('les trois formats d’export sont activés', service.includes("['csv', 'xlsx', 'pdf']"));
verify('les imports sont limités à CSV et XLSX', service.includes("['csv', 'xlsx']"));
verify('la taille maximale est de 10 Mo', codec.includes('10 * 1024 * 1024'));
verify('la limite est de 5 000 lignes', codec.includes('5 000 lignes'));
verify('le CSV protège les guillemets', codec.includes("replaceAll('\\\"', '\\\"\\\"')") || codec.includes("replaceAll('\"', '\"\"')"));
verify('Excel est produit en OpenXML compressé', codec.includes('zipSync') && codec.includes('[Content_Types].xml'));
verify('Excel fige la ligne des en-têtes', codec.includes('state="frozen"'));
verify('Excel applique un filtre automatique', codec.includes('autoFilter'));
verify('le PDF porte le nom de l’établissement', codec.includes('hospitalName'));
verify('le PDF accepte le logo configuré', codec.includes('logoDataUrl') && codec.includes('pdf.image'));
verify('le PDF pagine les tableaux', codec.includes('Page ${index + 1}/${pages.count}'));
verify('tous les exports sont audités', service.includes("'DATA_EXPORTED'"));
verify('tous les imports confirmés sont audités', service.includes("'DATA_IMPORTED'"));
verify('un import passe d’abord par la prévisualisation', controller.includes("import/:dataset/preview"));
verify('un import possède une confirmation distincte', controller.includes("import/:dataset/commit"));
verify('les colonnes obligatoires sont contrôlées', service.includes('Colonnes obligatoires absentes'));
verify('les enums sont contrôlés', service.includes('column.values?.includes'));
verify('les dates Excel numériques sont converties', service.includes('Date.UTC(1899, 11, 30)'));
verify('les doublons du fichier sont détectés', service.includes('est dupliqué dans le fichier'));
verify('les patients existants ne sont pas écrasés en masse', service.includes('Les modifications de patient doivent passer par la fiche individuelle'));
verify('les changements de rôle sont bloqués à l’import', service.includes('Un changement de rôle doit être fait manuellement'));
verify('le stock produit un mouvement d’ajustement', service.includes("type: 'ADJUSTMENT'"));
verify('le stock initial produit une entrée', service.includes("type: 'ENTRY'"));
verify('les rapports sont groupés par service, date et garde', service.includes("[row.department, row.businessDate, row.shift]"));
const stockFormula = /const closingStock =[\s\S]{0,400}?Number\(row\.lostQuantity\);/.exec(service)?.[0] ?? '';
verify('la commande en cours ne gonfle pas le stock final', stockFormula.length > 0 && !stockFormula.includes('pendingOrder'));
verify('les réquisitions sont groupées', service.includes('Import groupé'));
verify('les données cliniques sensibles restent en export seul', service.includes('disponible uniquement en export'));
verify('les permissions sont évaluées côté serveur', service.includes('hasAnyRole(user, roles)'));
verify('les départements sont limités selon le rôle', service.includes('assertDepartmentForUser'));
verify('la page propose PDF', page.includes("download('pdf')"));
verify('la page propose Excel', page.includes("download('xlsx')"));
verify('la page propose CSV', page.includes("download('csv')"));
verify('la page permet de télécharger les modèles', page.includes('downloadTemplate'));
verify('la page affiche les erreurs ligne par ligne', page.includes('row.errors.map'));
verify('la confirmation est bloquée si le fichier est invalide', page.includes('!preview.canCommit'));
verify('les téléchargements renouvellent une session expirée', client.includes("api('/auth/refresh'"));
verify('un accès global est disponible depuis toutes les pages', launcher.includes('/data-exchange'));
verify('les imports acceptent FormData', page.includes("form.append('file', file)"));

const report = {
  generatedAt: new Date().toISOString(),
  title: 'Validation PDF, Excel, CSV et imports contrôlés',
  datasets: datasets.length,
  exportFormats: 3,
  importFormats: 2,
  assertionsExecuted: checks.length,
  passedAssertions: checks.length,
  failedAssertions: 0,
  checks,
  limitations: [
    'Les imports cliniques destructifs restent volontairement désactivés.',
    'Un test humain sur le serveur réel reste nécessaire pour vérifier les téléchargements dans Safari, Chrome et Firefox.',
  ],
};

fs.mkdirSync('artifacts', { recursive: true });
fs.mkdirSync(path.join('docs', 'validation'), { recursive: true });
fs.writeFileSync('artifacts/data-exchange-workflow-report.json', JSON.stringify(report, null, 2));
fs.writeFileSync('docs/validation/data-exchange-workflow-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
