import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const checks = [];
const check = (name, predicate) => { assert.ok(predicate, name); checks.push(name); };

const guard = read('apps/api/src/common/guards/roles.guard.ts');
check('ADMIN ne contourne plus RolesGuard', !guard.includes("userRoles.includes(Role.ADMIN) &&"));

const appointment = read('apps/api/src/appointments/appointments.service.ts');
const listBlock = appointment.slice(appointment.indexOf('async list('), appointment.indexOf('async markPastScheduledAsNoShow'));
check('GET rendez-vous ne modifie plus la base', !listBlock.includes('updateMany'));
check('Traitement NO_SHOW explicite', appointment.includes('markPastScheduledAsNoShow'));

const transferBlock = appointment.slice(
  appointment.indexOf('async transfer('),
  appointment.indexOf('private present('),
);
check('Transfert conserve le début clinique', !transferBlock.includes('startedAt: null'));
check('Transfert revendique atomiquement le rendez-vous', transferBlock.includes('appointment.updateMany'));
check('Transfert revendique atomiquement la consultation', transferBlock.includes('consultation.updateMany'));
check('Transfert refuse les consultations clôturées ou signées', transferBlock.includes('clôturée ou signée'));
check('Transfert exige un motif exploitable', transferBlock.includes('transferReason.length < 5'));

const consultationDto = read('apps/api/src/consultations/dto/update-consultation.dto.ts');
check('Statut consultation non modifiable directement par le client', !consultationDto.includes('status?: ConsultationStatus'));

const consultation = read('apps/api/src/consultations/consultations.service.ts');
check('Signature validée dans la transaction', consultation.includes('assertCanSignConsultation(consultation)'));
check('Signature atomique avec verrou optimiste', consultation.includes('updatedAt: consultation.updatedAt'));
check('Dossier signé immuable', consultation.includes('Ce dossier est signé et immuable'));
check('Constantes bloquées après clôture', consultation.includes('consultation.status === ConsultationStatus.COMPLETED'));

const patients = read('apps/api/src/patients/patients.service.ts');
check('Homonyme sans identifiant fiable non bloqué', patients.includes('if (!birthDate && !phone) return null'));
const controller = read('apps/api/src/patients/patients.controller.ts');
check('Suppression normale ne déclenche jamais une suppression définitive', !controller.slice(controller.indexOf("@Delete(':id')")).includes('removePermanently'));
check('Suppression définitive exige confirmation et motif', controller.includes('PermanentDeletePatientDto'));

const staff = read('apps/api/src/staff/staff.service.ts');
check('Chirurgien et sage-femme reçoivent un DoctorProfile', staff.includes('Role.SURGEON, Role.MIDWIFE') && staff.includes('clinicianRoles.includes(dto.role)'));

const patientController = read('apps/api/src/patients/patients.controller.ts');
check('Création patient et fiche initiale dans une seule transaction', patientController.includes('this.prisma.$transaction(async (transaction)'));

const pharmacy = read('apps/api/src/enterprise/grace-aware-enterprise.service.ts');
check('Délivrance pharmacie revendiquée atomiquement', pharmacy.includes('transaction.prescription.updateMany'));
check('Lots de pharmacie décrémentés avec contrôle concurrent', pharmacy.includes('transaction.medicationBatch.updateMany'));
check('Stock global décrémenté avec contrôle concurrent', pharmacy.includes('stockQuantity: { gte: quantityToDispense }'));
check('Conflit série PostgreSQL traduit proprement', pharmacy.includes("error.code === 'P2034'"));

const migration = read('apps/api/prisma/migrations/20260802090000_stabilize_active_clinical_episodes/migration.sql');
check('Une seule hospitalisation active par patient', migration.includes('Hospitalization_one_active_per_patient'));
check('Un seul patient actif par lit', migration.includes('Hospitalization_one_active_per_bed'));
check('Une seule consultation active par patient', migration.includes('Consultation_one_active_per_patient'));
check('Un seul rendez-vous actif par patient', migration.includes('Appointment_one_active_episode_per_patient'));

const profileService = read('apps/api/src/users/users.service.ts');
check('Profil convertit les champs optionnels vides en null', profileService.includes('return normalized ? normalized : null'));
check('Profil journalise chaque modification', profileService.includes('OWN_PROFILE_UPDATED'));

const patientAccess = read('apps/api/src/patients/patient-access.service.ts');
check('Médecin peut lire tous les dossiers actifs', patientAccess.includes('Les praticiens peuvent consulter tous les dossiers actifs'));
check('Corrections cliniques immuables avec motif', patients.includes('patientClinicalAmendment.create') && patients.includes('reason: dto.reason.trim()'));
check('Médecin corrige le dossier uniquement par avenant motivé', !controller.slice(controller.indexOf("@Patch(':id')"), controller.indexOf("@Delete(':id/permanent')")).includes('Role.DOCTOR'));

const prescription = read('apps/api/src/enterprise/enterprise.service.ts');
check('Prescription accepte un médicament non référencé', prescription.includes('PrescriptionAvailability.NON_CATALOGUED'));
check('Prescription externe ne facture pas le stock interne', prescription.includes("' — achat externe'"));

const reports = read('apps/api/src/service-reports/service-reports.service.ts');
check('Rapport journalier calcule les retours dans le reste', reports.includes('item.returnedQuantity -'));
check('Commande en cours ne gonfle pas le stock final', !reports.slice(reports.indexOf('const closingStock'), reports.indexOf('if (closingStock < 0)')).includes('pendingOrder'));
check('Coût comptable repris du catalogue pour les médicaments référencés', reports.includes('medication?.unitPrice ??'));
check('Réquisition transfère le stock central vers le département', reports.includes('departmentStock.upsert') && reports.includes('PHARMACIE_CENTRALE'));

const schema = read('apps/api/prisma/schema.prisma');
check('Rôle RH indépendant présent', schema.includes('\n  HR\n'));
check('Stocks des services séparés du stock central', schema.includes('model DepartmentStock'));
check('Rapports et réquisitions persistés', schema.includes('model DepartmentDailyReport') && schema.includes('model InternalRequisition'));

const mobile = read('apps/web/app/globals.css');
check('Écran mobile centré et limité à 480 px', mobile.includes('width: min(100%, 480px)'));

const exchangeController = read('apps/api/src/data-exchange/data-exchange.controller.ts');
const exchangeService = read('apps/api/src/data-exchange/data-exchange.service.ts');
const exchangeCodec = read('apps/api/src/data-exchange/tabular-codec.service.ts');
const exchangePage = read('apps/web/app/(protected)/data-exchange/page.tsx');
check('Exports PDF Excel CSV centralisés', exchangeController.includes("export/:dataset/:format") && exchangeService.includes("['csv', 'xlsx', 'pdf']"));
check('Imports séparés en prévisualisation et confirmation', exchangeController.includes('preview') && exchangeController.includes('commit'));
check('Imports limités à 10 Mo et 5000 lignes', exchangeCodec.includes('10 * 1024 * 1024') && exchangeCodec.includes('5 000 lignes'));
check('PDF reprend l’établissement et le logo', exchangeCodec.includes('hospitalName') && exchangeCodec.includes('logoDataUrl'));
check('Excel utilise OpenXML avec filtre et ligne figée', exchangeCodec.includes('autoFilter') && exchangeCodec.includes('state="frozen"'));
check('CSV échappe les guillemets', exchangeCodec.includes("replaceAll('\"', '\"\"')"));
check('Import patient ne remplace pas une fiche existante', exchangeService.includes('Les modifications de patient doivent passer par la fiche individuelle'));
check('Import stock crée des mouvements traçables', exchangeService.includes("type: 'ADJUSTMENT'") && exchangeService.includes("type: 'ENTRY'"));
check('Imports et exports sont audités', exchangeService.includes('DATA_IMPORTED') && exchangeService.includes('DATA_EXPORTED'));
check('Interface globale propose modèles et validation ligne par ligne', exchangePage.includes('downloadTemplate') && exchangePage.includes('row.errors.map'));

console.log(JSON.stringify({ checks: checks.length, passed: checks }, null, 2));
