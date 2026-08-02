import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

class AdvancedClinicalSimulation {
  constructor() {
    this.doctors = new Map();
    this.patients = new Map();
    this.appointments = new Map();
    this.consultations = new Map();
    this.audit = [];
    this.sequence = 0;
  }

  id(prefix) {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  addDoctor(id, active = true) {
    this.doctors.set(id, { id, active });
  }

  addPatient(doctorId, index) {
    this.assertActiveDoctor(doctorId);
    const patientId = this.id('PAT');
    const appointmentId = this.id('APT');
    const consultationId = this.id('CONS');
    const startedAt = new Date(Date.UTC(2026, 7, 2, 8, index, 0));
    this.patients.set(patientId, {
      id: patientId,
      record: `ADV-2026-${String(index).padStart(4, '0')}`,
    });
    this.appointments.set(appointmentId, {
      id: appointmentId,
      patientId,
      doctorId,
      status: 'CHECKED_IN',
      journey: 'IN_CONSULTATION',
      doctorAcknowledgedAt: startedAt,
      version: 1,
    });
    this.consultations.set(consultationId, {
      id: consultationId,
      appointmentId,
      patientId,
      doctorId,
      status: 'IN_PROGRESS',
      startedAt,
      completedAt: null,
      signed: false,
      clinicalHistory: [`Évaluation initiale par ${doctorId}`],
      labRequests: [],
      version: 1,
    });
    return { patientId, appointmentId, consultationId, startedAt };
  }

  assertActiveDoctor(doctorId) {
    const doctor = this.doctors.get(doctorId);
    if (!doctor?.active) throw new Error('DOCTOR_INACTIVE');
  }

  consultationForAppointment(appointmentId) {
    return [...this.consultations.values()].find((row) => row.appointmentId === appointmentId);
  }

  activeLoad(doctorId) {
    return [...this.consultations.values()].filter(
      (row) => row.doctorId === doctorId && ['WAITING', 'IN_PROGRESS'].includes(row.status),
    ).length;
  }

  addClinicalNote(consultationId, doctorId, note) {
    const consultation = this.consultations.get(consultationId);
    assert(consultation, 'consultation missing');
    if (consultation.doctorId !== doctorId) throw new Error('WRONG_DOCTOR');
    if (consultation.signed || ['COMPLETED', 'CANCELLED'].includes(consultation.status)) {
      throw new Error('CONSULTATION_IMMUTABLE');
    }
    if (consultation.status !== 'IN_PROGRESS') throw new Error('CONSULTATION_NOT_ACKNOWLEDGED');
    consultation.clinicalHistory.push(note);
    consultation.version += 1;
  }

  requestLab(consultationId, doctorId) {
    const consultation = this.consultations.get(consultationId);
    assert(consultation, 'consultation missing');
    if (consultation.doctorId !== doctorId) throw new Error('WRONG_DOCTOR');
    consultation.labRequests.push({
      id: this.id('LAB'),
      requestedByDoctorId: doctorId,
      status: 'REQUESTED',
    });
    consultation.status = 'WAITING';
    const appointment = this.appointments.get(consultation.appointmentId);
    appointment.journey = 'LABORATORY';
  }

  validateLabs(consultationId) {
    const consultation = this.consultations.get(consultationId);
    assert(consultation, 'consultation missing');
    consultation.labRequests.forEach((request) => {
      request.status = 'VALIDATED';
    });
    const appointment = this.appointments.get(consultation.appointmentId);
    appointment.status = 'CHECKED_IN';
    appointment.journey = 'RETURN_TO_DOCTOR';
  }

  transfer(appointmentId, actingDoctorId, targetDoctorId, reason, expectedVersion) {
    const appointment = this.appointments.get(appointmentId);
    assert(appointment, 'appointment missing');
    const consultation = this.consultationForAppointment(appointmentId);
    if (appointment.doctorId !== actingDoctorId) throw new Error('WRONG_DOCTOR');
    if (reason.trim().length < 5) throw new Error('TRANSFER_REASON_TOO_SHORT');
    if (appointment.status !== 'CHECKED_IN' || ['COMPLETED', 'CANCELLED'].includes(appointment.journey)) {
      throw new Error('APPOINTMENT_CLOSED');
    }
    if (consultation?.signed || ['COMPLETED', 'CANCELLED'].includes(consultation?.status)) {
      throw new Error('CONSULTATION_CLOSED');
    }
    this.assertActiveDoctor(targetDoctorId);
    if (targetDoctorId === actingDoctorId) throw new Error('SAME_DOCTOR');
    if (expectedVersion !== undefined && appointment.version !== expectedVersion) {
      throw new Error('CONCURRENT_TRANSFER_CONFLICT');
    }

    const originalStartedAt = consultation?.startedAt ?? null;
    appointment.doctorId = targetDoctorId;
    appointment.doctorAcknowledgedAt = null;
    appointment.journey = 'WAITING_DOCTOR';
    appointment.version += 1;
    if (consultation) {
      consultation.doctorId = targetDoctorId;
      consultation.status = 'WAITING';
      consultation.completedAt = null;
      consultation.version += 1;
      assert.equal(consultation.startedAt, originalStartedAt, 'clinical start time was lost');
    }
    this.audit.push({
      action: 'PATIENT_TRANSFERRED',
      appointmentId,
      fromDoctorId: actingDoctorId,
      toDoctorId: targetDoctorId,
      reason: reason.trim(),
      originalStartedAt: originalStartedAt?.toISOString() ?? null,
    });
  }

  acknowledge(appointmentId, doctorId) {
    const appointment = this.appointments.get(appointmentId);
    assert(appointment, 'appointment missing');
    const consultation = this.consultationForAppointment(appointmentId);
    assert(consultation, 'consultation missing');
    if (appointment.doctorId !== doctorId || consultation.doctorId !== doctorId) {
      throw new Error('WRONG_DOCTOR');
    }
    if (appointment.status !== 'CHECKED_IN') throw new Error('APPOINTMENT_CLOSED');
    consultation.status = 'IN_PROGRESS';
    appointment.journey = 'IN_CONSULTATION';
    appointment.doctorAcknowledgedAt = new Date();
  }

  complete(consultationId, doctorId, signed = false) {
    const consultation = this.consultations.get(consultationId);
    assert(consultation, 'consultation missing');
    if (consultation.doctorId !== doctorId) throw new Error('WRONG_DOCTOR');
    consultation.status = 'COMPLETED';
    consultation.completedAt = new Date();
    consultation.signed = signed;
    const appointment = this.appointments.get(consultation.appointmentId);
    appointment.status = 'COMPLETED';
    appointment.journey = 'COMPLETED';
  }

  cancel(consultationId) {
    const consultation = this.consultations.get(consultationId);
    assert(consultation, 'consultation missing');
    consultation.status = 'CANCELLED';
    const appointment = this.appointments.get(consultation.appointmentId);
    appointment.status = 'CANCELLED';
    appointment.journey = 'CANCELLED';
  }
}

const checks = [];
const recordCheck = (name, test) => {
  try {
    test();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
const expectError = (name, code, test) =>
  recordCheck(name, () => assert.throws(test, (error) => error instanceof Error && error.message === code));

const system = new AdvancedClinicalSimulation();
['DOC-A', 'DOC-B', 'DOC-C', 'SURGEON-A', 'MIDWIFE-A'].forEach((doctor) => system.addDoctor(doctor));
system.addDoctor('DOC-INACTIVE', false);

const assignments = new Map();
let patientIndex = 1;
for (const doctorId of ['DOC-A', 'DOC-B', 'DOC-C', 'SURGEON-A', 'MIDWIFE-A']) {
  const rows = [];
  for (let count = 0; count < 4; count += 1) {
    rows.push(system.addPatient(doctorId, patientIndex));
    patientIndex += 1;
  }
  assignments.set(doctorId, rows);
}

for (const doctorId of assignments.keys()) {
  recordCheck(`${doctorId} accepte quatre patients actifs`, () => {
    assert.equal(system.activeLoad(doctorId), 4);
  });
}

const transferAfterTreatment = assignments.get('DOC-A')[0];
system.addClinicalNote(
  transferAfterTreatment.consultationId,
  'DOC-A',
  'Traitement initial commencé avant transfert.',
);
const preservedStart = system.consultations.get(transferAfterTreatment.consultationId).startedAt;
const preservedHistory = [
  ...system.consultations.get(transferAfterTreatment.consultationId).clinicalHistory,
];
system.transfer(
  transferAfterTreatment.appointmentId,
  'DOC-A',
  'DOC-B',
  'Avis spécialisé et poursuite du traitement',
  1,
);
recordCheck('le transfert conserve la même consultation', () => {
  assert.equal(
    system.consultationForAppointment(transferAfterTreatment.appointmentId).id,
    transferAfterTreatment.consultationId,
  );
});
recordCheck('le transfert conserve l’heure initiale de prise en charge', () => {
  assert.equal(system.consultations.get(transferAfterTreatment.consultationId).startedAt, preservedStart);
});
recordCheck('le transfert conserve toutes les notes cliniques antérieures', () => {
  assert.deepEqual(
    system.consultations.get(transferAfterTreatment.consultationId).clinicalHistory,
    preservedHistory,
  );
});
recordCheck('le médecin B peut recevoir un cinquième patient sans écraser les quatre autres', () => {
  assert.equal(system.activeLoad('DOC-B'), 5);
  assert.equal(system.activeLoad('DOC-A'), 3);
});
expectError('l’ancien médecin ne peut plus écrire après transfert', 'WRONG_DOCTOR', () =>
  system.addClinicalNote(transferAfterTreatment.consultationId, 'DOC-A', 'Modification interdite'),
);
system.acknowledge(transferAfterTreatment.appointmentId, 'DOC-B');
system.addClinicalNote(
  transferAfterTreatment.consultationId,
  'DOC-B',
  'Traitement repris par le médecin destinataire.',
);
recordCheck('le nouveau médecin reprend le traitement sans perdre le début initial', () => {
  const consultation = system.consultations.get(transferAfterTreatment.consultationId);
  assert.equal(consultation.startedAt, preservedStart);
  assert.equal(consultation.status, 'IN_PROGRESS');
  assert.match(consultation.clinicalHistory.at(-1), /repris/);
});

const labTransfer = assignments.get('DOC-B')[1];
system.requestLab(labTransfer.consultationId, 'DOC-B');
const labOrigin = system.consultations.get(labTransfer.consultationId).labRequests[0].requestedByDoctorId;
system.transfer(
  labTransfer.appointmentId,
  'DOC-B',
  'DOC-C',
  'Transfert pendant examens biologiques en cours',
  1,
);
system.validateLabs(labTransfer.consultationId);
system.acknowledge(labTransfer.appointmentId, 'DOC-C');
recordCheck('un examen demandé avant transfert conserve son médecin demandeur', () => {
  assert.equal(labOrigin, 'DOC-B');
  assert.equal(
    system.consultations.get(labTransfer.consultationId).labRequests[0].requestedByDoctorId,
    'DOC-B',
  );
});
recordCheck('les résultats validés reviennent au nouveau médecin affecté', () => {
  assert.equal(system.consultations.get(labTransfer.consultationId).doctorId, 'DOC-C');
  assert.equal(system.consultations.get(labTransfer.consultationId).status, 'IN_PROGRESS');
});

const chainTransfer = assignments.get('DOC-A')[1];
const chainStart = system.consultations.get(chainTransfer.consultationId).startedAt;
system.transfer(chainTransfer.appointmentId, 'DOC-A', 'DOC-B', 'Premier transfert médical', 1);
system.acknowledge(chainTransfer.appointmentId, 'DOC-B');
system.addClinicalNote(chainTransfer.consultationId, 'DOC-B', 'Réévaluation intermédiaire.');
system.transfer(chainTransfer.appointmentId, 'DOC-B', 'DOC-C', 'Deuxième avis médical requis', 2);
system.acknowledge(chainTransfer.appointmentId, 'DOC-C');
recordCheck('une chaîne de transferts garde un seul épisode clinique', () => {
  assert.equal(system.consultationForAppointment(chainTransfer.appointmentId).id, chainTransfer.consultationId);
  assert.equal(system.consultations.get(chainTransfer.consultationId).startedAt, chainStart);
  assert.equal(system.consultations.get(chainTransfer.consultationId).doctorId, 'DOC-C');
});

const raceTransfer = assignments.get('DOC-A')[2];
const raceVersion = system.appointments.get(raceTransfer.appointmentId).version;
system.transfer(raceTransfer.appointmentId, 'DOC-A', 'DOC-B', 'Transfert concurrent gagnant', raceVersion);
expectError('un second transfert concurrent est rejeté', 'WRONG_DOCTOR', () =>
  system.transfer(raceTransfer.appointmentId, 'DOC-A', 'DOC-C', 'Transfert concurrent perdant', raceVersion),
);
recordCheck('un seul médecin gagne le transfert concurrent', () => {
  assert.equal(system.appointments.get(raceTransfer.appointmentId).doctorId, 'DOC-B');
  assert.equal(
    system.audit.filter((entry) => entry.appointmentId === raceTransfer.appointmentId).length,
    1,
  );
});

const sameDoctor = assignments.get('DOC-C')[0];
expectError('transfert vers le même médecin refusé', 'SAME_DOCTOR', () =>
  system.transfer(sameDoctor.appointmentId, 'DOC-C', 'DOC-C', 'Même médecin interdit', 1),
);
expectError('motif trop court refusé', 'TRANSFER_REASON_TOO_SHORT', () =>
  system.transfer(sameDoctor.appointmentId, 'DOC-C', 'DOC-B', 'non', 1),
);
expectError('médecin inactif refusé', 'DOCTOR_INACTIVE', () =>
  system.transfer(sameDoctor.appointmentId, 'DOC-C', 'DOC-INACTIVE', 'Médecin indisponible', 1),
);
expectError('un autre médecin ne peut pas transférer le patient', 'WRONG_DOCTOR', () =>
  system.transfer(sameDoctor.appointmentId, 'DOC-A', 'DOC-B', 'Tentative non autorisée', 1),
);

const completed = assignments.get('SURGEON-A')[0];
system.complete(completed.consultationId, 'SURGEON-A');
expectError('consultation terminée non transférable', 'APPOINTMENT_CLOSED', () =>
  system.transfer(completed.appointmentId, 'SURGEON-A', 'DOC-A', 'Transfert après clôture', 1),
);

const signed = assignments.get('SURGEON-A')[1];
system.complete(signed.consultationId, 'SURGEON-A', true);
expectError('consultation signée non transférable', 'APPOINTMENT_CLOSED', () =>
  system.transfer(signed.appointmentId, 'SURGEON-A', 'DOC-A', 'Transfert après signature', 1),
);

const cancelled = assignments.get('MIDWIFE-A')[0];
system.cancel(cancelled.consultationId);
expectError('consultation annulée non transférable', 'APPOINTMENT_CLOSED', () =>
  system.transfer(cancelled.appointmentId, 'MIDWIFE-A', 'DOC-A', 'Transfert après annulation', 1),
);

const pendingAcknowledgement = assignments.get('MIDWIFE-A')[1];
system.transfer(
  pendingAcknowledgement.appointmentId,
  'MIDWIFE-A',
  'DOC-A',
  'Transfert avant reprise du dossier',
  1,
);
expectError('le nouveau médecin ne peut pas écrire avant reconnaissance du patient', 'CONSULTATION_NOT_ACKNOWLEDGED', () =>
  system.addClinicalNote(pendingAcknowledgement.consultationId, 'DOC-A', 'Écriture trop tôt'),
);
system.acknowledge(pendingAcknowledgement.appointmentId, 'DOC-A');
recordCheck('le nouveau médecin peut écrire après reconnaissance', () => {
  system.addClinicalNote(pendingAcknowledgement.consultationId, 'DOC-A', 'Patient reconnu et repris.');
  assert.match(
    system.consultations.get(pendingAcknowledgement.consultationId).clinicalHistory.at(-1),
    /reconnu/,
  );
});

for (const [doctorId, rows] of assignments) {
  recordCheck(`les quatre dossiers initiaux de ${doctorId} restent uniques`, () => {
    assert.equal(new Set(rows.map((row) => row.consultationId)).size, 4);
    assert.equal(new Set(rows.map((row) => row.patientId)).size, 4);
  });
}

recordCheck('chaque transfert produit une trace d’audit complète', () => {
  assert(system.audit.length >= 5);
  for (const entry of system.audit) {
    assert(entry.fromDoctorId);
    assert(entry.toDoctorId);
    assert(entry.reason.length >= 5);
    assert(entry.originalStartedAt);
  }
});

const failedChecks = checks.filter((check) => !check.ok);
const report = {
  generatedAt: new Date().toISOString(),
  title: 'Test avancé de charge médicale et transferts',
  patientsSimulated: system.patients.size,
  doctorsTested: [...system.doctors.values()].filter((doctor) => doctor.active).length,
  initialPatientsPerDoctor: 4,
  assertionsExecuted: checks.length,
  passedAssertions: checks.length - failedChecks.length,
  failedAssertions: failedChecks.length,
  transferEvents: system.audit.length,
  initialLoad: Object.fromEntries(
    [...assignments.keys()].map((doctorId) => [doctorId, assignments.get(doctorId).length]),
  ),
  finalActiveLoad: Object.fromEntries(
    [...assignments.keys()].map((doctorId) => [doctorId, system.activeLoad(doctorId)]),
  ),
  checks,
  coverageMatrix: [
    'quatre patients simultanés par médecin',
    'cinquième patient reçu après transfert',
    'transfert après début du traitement',
    'conservation de startedAt et de l’historique clinique',
    'retrait immédiat des droits de l’ancien médecin',
    'reprise par le nouveau médecin après reconnaissance',
    'transfert avec laboratoire en attente',
    'chaîne de transferts sans duplication de consultation',
    'conflit de transferts concurrents',
    'médecin identique, inactif ou non autorisé',
    'motif de transfert invalide',
    'consultation terminée, signée ou annulée',
    'audit de chaque transfert',
  ],
  scope:
    'Simulation déterministe de la matrice de charge et de transfert. La CI ajoute des tests Jest sur PostgreSQL réel pour les services concernés.',
};

const outputPath = path.resolve('artifacts/advanced-doctor-load-report.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (failedChecks.length) process.exitCode = 1;
