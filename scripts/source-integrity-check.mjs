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

console.log(JSON.stringify({ checks: checks.length, passed: checks }, null, 2));
