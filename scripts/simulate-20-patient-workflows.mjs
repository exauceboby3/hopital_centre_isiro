import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FINAL_DECISIONS = new Set(['PRESCRIPTION', 'DISCHARGE', 'COMPLETE', 'HOSPITALIZATION']);

class HospitalSimulation {
  constructor() {
    this.patients = new Map();
    this.identityKeys = new Map();
    this.appointments = new Map();
    this.consultations = new Map();
    this.invoices = new Map();
    this.hospitalizations = new Map();
    this.beds = new Map(Array.from({ length: 8 }, (_, i) => [`BED-${i + 1}`, 'AVAILABLE']));
    this.stock = new Map([['PARACETAMOL', 200], ['AMOXICILLIN', 100], ['QUININE', 80]]);
    this.events = [];
    this.sequence = 0;
  }

  id(prefix) { this.sequence += 1; return `${prefix}-${this.sequence}`; }
  log(patientId, action) { this.events.push({ patientId, action }); }

  identityKey({ lastName, postName, firstName, dateOfBirth, phone }) {
    const name = [lastName, postName, firstName].filter(Boolean).join(' ').trim().toLowerCase().replace(/\s+/g, ' ');
    const reliable = dateOfBirth || phone?.replace(/\D/g, '');
    return reliable ? `${name}|${reliable}` : null;
  }

  createPatient(data) {
    const key = this.identityKey(data);
    if (key && this.identityKeys.has(key)) throw new Error('PATIENT_ALREADY_EXISTS');
    const id = this.id('PAT');
    const patient = { id, record: `CHI-2026-${String(this.patients.size + 1).padStart(6, '0')}`, ...data, archived: false };
    this.patients.set(id, patient);
    if (key) this.identityKeys.set(key, id);
    this.log(id, 'PATIENT_CREATED');
    return patient;
  }

  createAppointment(patientId, doctorId, scheduledAt) {
    const active = [...this.appointments.values()].find((a) => a.patientId === patientId && ['SCHEDULED', 'CHECKED_IN'].includes(a.status));
    if (active) throw new Error('ACTIVE_APPOINTMENT_EXISTS');
    if (scheduledAt.getTime() < Date.now() - 5 * 60_000) throw new Error('PAST_APPOINTMENT');
    const invoiceId = this.id('INV');
    this.invoices.set(invoiceId, { id: invoiceId, patientId, total: 20, paid: 0, status: 'PENDING' });
    const id = this.id('APT');
    const appointment = { id, patientId, doctorId, status: 'SCHEDULED', journey: 'AWAITING_PAYMENT', invoiceId };
    this.appointments.set(id, appointment);
    this.log(patientId, 'APPOINTMENT_CREATED');
    return appointment;
  }

  pay(invoiceId, amount) {
    const invoice = this.invoices.get(invoiceId);
    assert(invoice, 'invoice missing');
    if (invoice.status === 'PAID') throw new Error('INVOICE_ALREADY_PAID');
    if (amount <= 0 || invoice.paid + amount > invoice.total) throw new Error('INVALID_PAYMENT');
    invoice.paid += amount;
    invoice.status = invoice.paid === invoice.total ? 'PAID' : 'PARTIALLY_PAID';
    const appointment = [...this.appointments.values()].find((a) => a.invoiceId === invoiceId);
    if (invoice.status === 'PAID' && appointment) {
      appointment.status = 'CHECKED_IN';
      appointment.journey = 'WAITING_DOCTOR';
    }
    this.log(invoice.patientId, 'PAYMENT_RECORDED');
  }

  recordVitals(appointmentId) {
    const appointment = this.appointments.get(appointmentId);
    assert(appointment);
    if (['COMPLETED', 'CANCELLED'].includes(appointment.status)) throw new Error('EPISODE_CLOSED');
    this.log(appointment.patientId, 'VITALS_RECORDED');
  }

  acknowledge(appointmentId, doctorId) {
    const appointment = this.appointments.get(appointmentId);
    assert(appointment);
    if (appointment.doctorId !== doctorId) throw new Error('WRONG_DOCTOR');
    if (appointment.status !== 'CHECKED_IN') throw new Error('NOT_CHECKED_IN');
    let consultation = [...this.consultations.values()].find((c) => c.appointmentId === appointmentId);
    if (!consultation) {
      consultation = { id: this.id('CONS'), appointmentId, patientId: appointment.patientId, doctorId, status: 'IN_PROGRESS', exams: [], prescription: null, signed: false, decision: null };
      this.consultations.set(consultation.id, consultation);
    } else consultation.status = 'IN_PROGRESS';
    appointment.journey = 'IN_CONSULTATION';
    this.log(appointment.patientId, 'CONSULTATION_STARTED');
    return consultation;
  }

  requestLab(consultationId, count = 2) {
    const c = this.consultations.get(consultationId); assert(c);
    if (c.signed) throw new Error('SIGNED_RECORD');
    c.exams = Array.from({ length: count }, (_, i) => ({ id: `${consultationId}-LAB-${i + 1}`, status: 'REQUESTED' }));
    c.status = 'WAITING'; c.decision = 'LABORATORY';
    this.appointments.get(c.appointmentId).journey = 'LABORATORY';
    this.log(c.patientId, 'LAB_REQUESTED');
  }

  validateLabs(consultationId) {
    const c = this.consultations.get(consultationId); assert(c);
    c.exams.forEach((e) => { e.status = 'VALIDATED'; });
    c.status = 'IN_PROGRESS';
    const a = this.appointments.get(c.appointmentId); a.journey = 'RETURN_TO_DOCTOR'; a.status = 'CHECKED_IN';
    this.log(c.patientId, 'LAB_VALIDATED_RETURN_DOCTOR');
  }

  requestImaging(consultationId) {
    const c = this.consultations.get(consultationId); assert(c);
    c.status = 'WAITING'; c.decision = 'IMAGING';
    this.appointments.get(c.appointmentId).journey = 'IMAGING';
    this.log(c.patientId, 'IMAGING_REQUESTED');
  }

  completeImaging(consultationId) {
    const c = this.consultations.get(consultationId); assert(c);
    c.status = 'IN_PROGRESS';
    this.appointments.get(c.appointmentId).journey = 'RETURN_TO_DOCTOR';
    this.log(c.patientId, 'IMAGING_COMPLETED_RETURN_DOCTOR');
  }

  createPrescription(consultationId, medication = 'PARACETAMOL', quantity = 5) {
    const c = this.consultations.get(consultationId); assert(c);
    if (c.prescription) return c.prescription;
    const invoiceId = this.id('INV');
    this.invoices.set(invoiceId, { id: invoiceId, patientId: c.patientId, total: quantity * 2, paid: 0, status: 'PENDING' });
    c.prescription = { id: this.id('RX'), medication, quantity, dispensed: false, invoiceId };
    this.log(c.patientId, 'PRESCRIPTION_CREATED');
    return c.prescription;
  }

  finalDecision(consultationId, decision) {
    const c = this.consultations.get(consultationId); assert(c);
    if (c.signed) throw new Error('SIGNED_RECORD');
    if (!FINAL_DECISIONS.has(decision)) throw new Error('NOT_FINAL');
    if (c.exams.some((e) => !['VALIDATED', 'CANCELLED'].includes(e.status))) throw new Error('LAB_RESULTS_PENDING');
    if (decision === 'PRESCRIPTION' && !c.prescription) throw new Error('PRESCRIPTION_REQUIRED');
    c.decision = decision; c.status = 'COMPLETED';
    const a = this.appointments.get(c.appointmentId);
    a.journey = decision === 'HOSPITALIZATION' ? 'HOSPITALIZATION' : 'COMPLETED';
    if (decision !== 'HOSPITALIZATION') a.status = 'COMPLETED';
    this.log(c.patientId, `FINAL_DECISION_${decision}`);
  }

  sign(consultationId) {
    const c = this.consultations.get(consultationId); assert(c);
    if (c.signed) throw new Error('ALREADY_SIGNED');
    if (c.status !== 'COMPLETED' || !FINAL_DECISIONS.has(c.decision)) throw new Error('NOT_SIGNABLE');
    if (c.exams.some((e) => !['VALIDATED', 'CANCELLED'].includes(e.status))) throw new Error('LAB_RESULTS_PENDING');
    c.signed = true;
    this.log(c.patientId, 'CONSULTATION_SIGNED');
  }

  editSigned(consultationId) {
    const c = this.consultations.get(consultationId);
    if (c.signed) throw new Error('SIGNED_RECORD_IMMUTABLE');
  }

  dispense(consultationId) {
    const c = this.consultations.get(consultationId); assert(c?.prescription);
    const rx = c.prescription;
    if (rx.dispensed) throw new Error('ALREADY_DISPENSED');
    const invoice = this.invoices.get(rx.invoiceId);
    if (invoice.status !== 'PAID') throw new Error('PHARMACY_PAYMENT_REQUIRED');
    const available = this.stock.get(rx.medication) ?? 0;
    if (available < rx.quantity) throw new Error('INSUFFICIENT_STOCK');
    this.stock.set(rx.medication, available - rx.quantity);
    rx.dispensed = true;
    this.log(c.patientId, 'MEDICATION_DISPENSED');
  }

  transfer(consultationId, newDoctorId) {
    const c = this.consultations.get(consultationId); assert(c);
    if (c.signed || c.status === 'COMPLETED') throw new Error('CLOSED_TRANSFER');
    c.doctorId = newDoctorId; c.status = 'WAITING';
    const a = this.appointments.get(c.appointmentId); a.doctorId = newDoctorId; a.journey = 'WAITING_DOCTOR';
    this.log(c.patientId, 'TRANSFERRED');
  }

  requestHospitalization(consultationId) {
    const c = this.consultations.get(consultationId); assert(c);
    if ([...this.hospitalizations.values()].some((h) => h.patientId === c.patientId && h.status === 'ACTIVE')) throw new Error('ACTIVE_HOSPITALIZATION_EXISTS');
    this.finalDecision(consultationId, 'HOSPITALIZATION');
    const invoiceId = this.id('INV');
    this.invoices.set(invoiceId, { id: invoiceId, patientId: c.patientId, total: 50, paid: 0, status: 'DRAFT' });
    c.hospitalAuthorization = { id: this.id('AUTH'), invoiceId };
    this.log(c.patientId, 'HOSPITALIZATION_REQUESTED');
  }

  admit(consultationId, bedId) {
    const c = this.consultations.get(consultationId); assert(c?.hospitalAuthorization);
    if ([...this.hospitalizations.values()].some((h) => h.patientId === c.patientId && h.status === 'ACTIVE')) throw new Error('ACTIVE_HOSPITALIZATION_EXISTS');
    if (this.beds.get(bedId) !== 'AVAILABLE') throw new Error('BED_UNAVAILABLE');
    this.beds.set(bedId, 'OCCUPIED');
    const h = { id: this.id('HOSP'), patientId: c.patientId, consultationId, bedId, status: 'ACTIVE', admittedAt: Date.now() - 2 * 86_400_000 };
    this.hospitalizations.set(h.id, h);
    this.log(c.patientId, 'HOSPITALIZED');
    return h;
  }

  nursingCare(hospitalizationId) {
    const h = this.hospitalizations.get(hospitalizationId); assert(h?.status === 'ACTIVE');
    this.log(h.patientId, 'NURSING_CARE_COMPLETED');
  }

  discharge(hospitalizationId) {
    const h = this.hospitalizations.get(hospitalizationId); assert(h);
    if (h.status !== 'ACTIVE') throw new Error('ALREADY_DISCHARGED');
    h.status = 'DISCHARGED'; h.dischargedAt = Date.now();
    this.beds.set(h.bedId, 'MAINTENANCE');
    const c = this.consultations.get(h.consultationId);
    const invoice = this.invoices.get(c.hospitalAuthorization.invoiceId);
    invoice.total = Math.max(1, Math.ceil((h.dischargedAt - h.admittedAt) / 86_400_000)) * 50;
    invoice.status = 'PENDING';
    this.log(h.patientId, 'HOSPITAL_DISCHARGE');
  }

  cancelAppointment(appointmentId) {
    const a = this.appointments.get(appointmentId); assert(a);
    a.status = 'CANCELLED'; a.journey = 'CANCELLED';
    this.log(a.patientId, 'APPOINTMENT_CANCELLED');
  }
}

const system = new HospitalSimulation();
const results = [];
const now = Date.now();
const doctors = ['DOC-A', 'DOC-B', 'SURGEON-A', 'MIDWIFE-A'];

const sameNameA = system.createPatient({ lastName: 'MALU', firstName: 'Jean', sex: 'MALE' });
const sameNameB = system.createPatient({ lastName: 'MALU', firstName: 'Jean', sex: 'MALE' });
assert.notEqual(sameNameA.id, sameNameB.id);

for (let index = 0; index < 20; index += 1) {
  const patient = index < 2
    ? [sameNameA, sameNameB][index]
    : system.createPatient({
        lastName: `PATIENT${index + 1}`,
        firstName: `Test${index + 1}`,
        sex: index % 2 ? 'FEMALE' : 'MALE',
        dateOfBirth: `199${index % 10}-0${(index % 9) + 1}-15`,
        phone: `+24381000${String(index).padStart(3, '0')}`,
      });
  const doctor = doctors[index % doctors.length];
  const appointment = system.createAppointment(patient.id, doctor, new Date(now + (index + 1) * 3_600_000));

  if (index === 19) {
    system.cancelAppointment(appointment.id);
    results.push({ patient: patient.record, scenario: 'annulation', ok: true });
    continue;
  }

  system.pay(appointment.invoiceId, 20);
  system.recordVitals(appointment.id);
  let consultation = system.acknowledge(appointment.id, doctor);

  if (index < 5) {
    const rx = system.createPrescription(consultation.id, 'PARACETAMOL', 5);
    system.pay(rx.invoiceId, 10);
    system.finalDecision(consultation.id, 'PRESCRIPTION');
    system.sign(consultation.id);
    system.dispense(consultation.id);
    assert.throws(() => system.dispense(consultation.id), /ALREADY_DISPENSED/);
    assert.throws(() => system.editSigned(consultation.id), /SIGNED_RECORD_IMMUTABLE/);
    results.push({ patient: patient.record, scenario: 'prescription-retour-domicile', ok: true });
  } else if (index < 10) {
    system.requestLab(consultation.id, 3);
    assert.throws(() => system.finalDecision(consultation.id, 'COMPLETE'), /LAB_RESULTS_PENDING/);
    system.validateLabs(consultation.id);
    consultation = system.acknowledge(appointment.id, doctor);
    const rx = system.createPrescription(consultation.id, 'AMOXICILLIN', 4);
    system.pay(rx.invoiceId, 8);
    system.finalDecision(consultation.id, 'PRESCRIPTION');
    system.sign(consultation.id);
    system.dispense(consultation.id);
    results.push({ patient: patient.record, scenario: 'laboratoire-retour-médecin', ok: true });
  } else if (index < 15) {
    system.requestLab(consultation.id, 2);
    system.validateLabs(consultation.id);
    consultation = system.acknowledge(appointment.id, doctor);
    system.requestHospitalization(consultation.id);
    const bedId = `BED-${index - 9}`;
    const hospitalization = system.admit(consultation.id, bedId);
    assert.throws(() => system.admit(consultation.id, 'BED-8'), /ACTIVE_HOSPITALIZATION_EXISTS/);
    system.nursingCare(hospitalization.id);
    system.discharge(hospitalization.id);
    assert.equal(system.beds.get(bedId), 'MAINTENANCE');
    assert.throws(() => system.discharge(hospitalization.id), /ALREADY_DISCHARGED/);
    results.push({ patient: patient.record, scenario: 'hospitalisation-soins-sortie', ok: true });
  } else if (index < 18) {
    system.requestImaging(consultation.id);
    system.completeImaging(consultation.id);
    consultation = system.acknowledge(appointment.id, doctor);
    system.finalDecision(consultation.id, 'COMPLETE');
    system.sign(consultation.id);
    results.push({ patient: patient.record, scenario: 'imagerie-retour-médecin', ok: true });
  } else {
    system.transfer(consultation.id, 'DOC-TRANSFER');
    consultation = system.acknowledge(appointment.id, 'DOC-TRANSFER');
    system.finalDecision(consultation.id, 'DISCHARGE');
    system.sign(consultation.id);
    results.push({ patient: patient.record, scenario: 'transfert-médical', ok: true });
  }
}

assert.throws(
  () => system.createPatient({ lastName: 'PATIENT3', firstName: 'Test3', dateOfBirth: '1992-03-15', phone: '+24381000002' }),
  /PATIENT_ALREADY_EXISTS/,
);
assert.equal(results.length, 20);
assert.equal(results.filter((r) => r.ok).length, 20);

const report = {
  generatedAt: new Date().toISOString(),
  patientsTested: 20,
  successfulScenarios: results.length,
  failedScenarios: 0,
  eventsExecuted: system.events.length,
  remainingStock: Object.fromEntries(system.stock),
  bedStates: Object.fromEntries(system.beds),
  scenarios: results,
  negativeControls: [
    'doublon avec identité fiable refusé',
    'homonymes sans identifiant fiable autorisés',
    'décision finale bloquée tant que le laboratoire est en attente',
    'double délivrance pharmacie refusée',
    'modification après signature refusée',
    'double hospitalisation refusée',
    'double sortie refusée',
    'lit placé en maintenance après sortie',
  ],
  scope: 'Simulation déterministe de la logique métier; ne remplace pas un test E2E sur PostgreSQL et les API démarrées.',
};

const out = path.resolve('artifacts/20-patient-workflow-report.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
