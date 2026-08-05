import { Injectable, NotFoundException } from '@nestjs/common';
import { ExamStatus, Role } from '@prisma/client';
import { decodeClinicalReport, decodeMedicalSignature } from '../consultations/clinical-report';
import { presentVitalSign } from '../common/vital-sign-metadata';
import { PrismaService } from '../prisma/prisma.service';

interface HistoryEntry {
  id: string;
  kind: string;
  date: Date;
  dateKey: string;
  title: string;
  description?: string;
  status?: string;
  author?: string;
  department?: string;
  signature?: { doctorName: string; signedAt: string; hash: string } | null;
}

const departmentLabels: Partial<Record<Role, string>> = {
  SUPER_ADMIN: 'Super-administration',
  ADMIN: 'Administration',
  RECEPTIONIST: 'Réception',
  SECRETARY: 'Réception',
  DOCTOR: 'Médecine',
  NURSE: 'Soins infirmiers',
  LAB_TECHNICIAN: 'Laboratoire',
  MEDICAL_BIOLOGIST: 'Biologie médicale',
  RADIOLOGIST: 'Imagerie médicale',
  PHARMACIST: 'Pharmacie',
  CASHIER: 'Caisse',
  ACCOUNTANT: 'Comptabilité',
  HR: 'Ressources humaines',
};

@Injectable()
export class PatientHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async history(id: string, includeFinancialDetails = false) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, archivedAt: null },
      omit: { identityKey: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');

    const [
      appointments,
      consultations,
      exams,
      hospitalizations,
      vitalSigns,
      prescriptions,
      nursingCare,
      invoices,
      amendments,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: id },
        include: {
          createdBy: { select: { username: true, role: true } },
          doctor: true,
        },
      }),
      this.prisma.consultation.findMany({
        where: { patientId: id },
        include: {
          doctor: { include: { user: { select: { username: true, role: true } } } },
        },
      }),
      this.prisma.examRequest.findMany({
        where: { patientId: id },
        include: {
          requestedByDoctor: { include: { user: { select: { username: true, role: true } } } },
          performedByLabTech: { include: { user: { select: { username: true, role: true } } } },
          validatedByLabTech: { include: { user: { select: { username: true, role: true } } } },
        },
        orderBy: { requestedAt: 'asc' },
      }),
      this.prisma.hospitalization.findMany({
        where: { patientId: id },
        include: { bed: { include: { room: true } }, doctor: true },
      }),
      this.prisma.vitalSign.findMany({
        where: { patientId: id },
        include: { recordedBy: { select: { username: true, role: true } } },
      }),
      this.prisma.prescription.findMany({
        where: { patientId: id },
        include: {
          prescribedBy: { select: { username: true, role: true } },
          items: { include: { medication: true } },
        },
      }),
      this.prisma.nursingCare.findMany({
        where: { patientId: id },
        include: {
          performedBy: { select: { username: true, role: true } },
          assignedNurse: { select: { username: true, role: true } },
          hospitalization: { include: { bed: { include: { room: true } } } },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      includeFinancialDetails
        ? this.prisma.invoice.findMany({
            where: { patientId: id },
            include: {
              issuedBy: { select: { username: true, role: true } },
              payments: { include: { receivedBy: { select: { username: true, role: true } } } },
              careAuthorization: {
                include: {
                  examRequest: { select: { requestGroupId: true } },
                  service: { select: { type: true, name: true } },
                },
              },
            },
            orderBy: { issuedAt: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.patientClinicalAmendment.findMany({
        where: { patientId: id },
        include: { author: { select: { username: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const entries: HistoryEntry[] = [];
    const push = (entry: Omit<HistoryEntry, 'dateKey'>) =>
      entries.push({ ...entry, dateKey: entry.date.toISOString().slice(0, 10) });

    appointments.forEach((row) => {
      const doctorName = row.doctor
        ? [row.doctor.lastName, row.doctor.postName, row.doctor.firstName].filter(Boolean).join(' ')
        : undefined;
      push({
        id: row.id,
        kind: 'APPOINTMENT',
        date: row.scheduledAt,
        title: `Rendez-vous · ${row.service}`,
        description: [row.reason, doctorName ? `Médecin : ${doctorName}` : undefined]
          .filter(Boolean)
          .join(' — '),
        status: row.status,
        author: row.createdBy.username,
        department: departmentLabels[row.createdBy.role],
      });
    });

    consultations.forEach((row) => {
      const report = decodeClinicalReport(row.report).sections;
      const signature = decodeMedicalSignature(row.certificate);
      const doctorName = [row.doctor.lastName, row.doctor.postName, row.doctor.firstName]
        .filter(Boolean)
        .join(' ');
      push({
        id: row.id,
        kind: 'CONSULTATION',
        date: row.completedAt ?? row.startedAt ?? row.createdAt,
        title: `Consultation · ${report.chiefComplaint ?? row.reason}`,
        description: [
          report.diagnosis ? `Diagnostic : ${report.diagnosis}` : undefined,
          report.treatmentPlan ? `Conduite : ${report.treatmentPlan}` : undefined,
          row.orientation,
        ]
          .filter(Boolean)
          .join(' — '),
        status: row.status,
        author: doctorName || row.doctor.user.username,
        department: 'Médecine',
        signature: signature
          ? { doctorName: signature.doctorName, signedAt: signature.signedAt, hash: signature.hash }
          : null,
      });
    });

    vitalSigns.forEach((raw) => {
      const row = presentVitalSign(raw);
      const values = [
        row.temperatureC ? `${row.temperatureC.toString()} °C` : undefined,
        row.weightKg ? `${row.weightKg.toString()} kg` : undefined,
        row.systolic && row.diastolic ? `TA ${row.systolic}/${row.diastolic}` : undefined,
        row.pulse ? `FC ${row.pulse}/min` : undefined,
        row.respiratoryRate ? `FR ${row.respiratoryRate}/min` : undefined,
        row.oxygenPercent ? `SpO₂ ${row.oxygenPercent}%` : undefined,
        row.bloodGlucoseMgDl ? `Glycémie ${row.bloodGlucoseMgDl} mg/dL` : undefined,
        row.notes,
      ];
      push({
        id: row.id,
        kind: 'VITAL_SIGN',
        date: row.recordedAt,
        title: 'Signes vitaux',
        description: values.filter(Boolean).join(' · '),
        author: row.recordedBy.username,
        department: departmentLabels[row.recordedBy.role],
      });
    });

    const examGroups = new Map<string, typeof exams>();
    exams.forEach((exam) => {
      const group = examGroups.get(exam.requestGroupId);
      if (group) group.push(exam);
      else examGroups.set(exam.requestGroupId, [exam]);
    });

    examGroups.forEach((group, requestGroupId) => {
      const latest = [...group].sort(
        (a, b) =>
          (b.validatedAt ?? b.completedAt ?? b.requestedAt).getTime() -
          (a.validatedAt ?? a.completedAt ?? a.requestedAt).getTime(),
      )[0]!;
      const actor =
        latest.validatedByLabTech?.user ??
        latest.performedByLabTech?.user ??
        latest.requestedByDoctor.user;
      const allValidated = group.every((exam) => exam.status === ExamStatus.VALIDATED);
      const allCancelled = group.every((exam) => exam.status === ExamStatus.CANCELLED);
      const hasCompleted = group.some((exam) => exam.status === ExamStatus.COMPLETED);
      const hasInProgress = group.some((exam) => exam.status === ExamStatus.IN_PROGRESS);
      const status = allValidated
        ? ExamStatus.VALIDATED
        : allCancelled
          ? ExamStatus.CANCELLED
          : hasCompleted
            ? 'RESULT_ENTERED'
            : hasInProgress
              ? ExamStatus.IN_PROGRESS
              : ExamStatus.REQUESTED;
      const detail = group
        .map((exam) => {
          const result = exam.result?.trim();
          return `${exam.type} (${exam.status})${result ? ` : ${result.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`;
        })
        .join(' · ');
      push({
        id: requestGroupId,
        kind: 'LABORATORY',
        date: latest.validatedAt ?? latest.completedAt ?? latest.requestedAt,
        title: `Demande laboratoire · ${group.length} examen(s)`,
        description: detail,
        status,
        author: actor.username,
        department: departmentLabels[actor.role] ?? 'Laboratoire',
      });
    });

    prescriptions.forEach((row) => {
      push({
        id: row.id,
        kind: 'PRESCRIPTION',
        date: row.prescribedAt,
        title: `Ordonnance ${row.number}`,
        description: [
          row.diagnosis,
          row.items
            .map(
              (item) =>
                `${item.medicationName}${item.strength ? ` ${item.strength}` : ''} — ${item.dosage}, ${item.frequency}${item.availability === 'EXTERNAL' || item.availability === 'NON_CATALOGUED' ? ' · achat externe' : ''}`,
            )
            .join(' ; '),
        ]
          .filter(Boolean)
          .join(' — '),
        status: row.status,
        author: row.prescribedBy.username,
        department: departmentLabels[row.prescribedBy.role],
      });
    });

    nursingCare.forEach((row) => {
      const actor = row.performedBy ?? row.assignedNurse;
      push({
        id: row.id,
        kind: 'NURSING',
        date: row.performedAt ?? row.scheduledAt,
        title: row.label,
        description: [
          row.medicationName
            ? `${row.medicationName} · ${row.dose ?? ''} · ${row.route ?? ''}`
            : undefined,
          row.observations,
          row.instructions ? `Consignes/actions : ${row.instructions}` : undefined,
        ]
          .filter(Boolean)
          .join(' — '),
        status: row.status,
        author: actor?.username,
        department: 'Soins infirmiers',
      });
    });

    amendments.forEach((row) => {
      push({
        id: row.id,
        kind: 'AMENDMENT',
        date: row.createdAt,
        title: `Avenant clinique · ${row.fieldName}`,
        description: [
          row.previousValue ? `Ancienne valeur : ${row.previousValue}` : undefined,
          `Nouvelle valeur : ${row.newValue}`,
          `Motif : ${row.reason}`,
        ]
          .filter(Boolean)
          .join(' — '),
        status: 'RECORDED',
        author: row.author.username,
        department: departmentLabels[row.author.role] ?? 'Médecine',
      });
    });

    const invoiceGroups = new Map<string, Array<(typeof invoices)[number]>>();
    invoices.forEach((invoice) => {
      const laboratoryGroupId = invoice.careAuthorization?.examRequest?.requestGroupId;
      const key = laboratoryGroupId ? `LAB-${laboratoryGroupId}` : `INV-${invoice.id}`;
      const group = invoiceGroups.get(key);
      if (group) group.push(invoice);
      else invoiceGroups.set(key, [invoice]);
    });

    invoiceGroups.forEach((group, key) => {
      const laboratoryBatch = key.startsWith('LAB-') && group.length > 1;
      const total = group.reduce((sum, invoice) => sum + Number(invoice.total), 0);
      const payments = group.flatMap((invoice) =>
        invoice.payments.map((payment) => ({ invoice, payment })),
      );
      const latestInvoice = [...group].sort(
        (a, b) => b.issuedAt.getTime() - a.issuedAt.getTime(),
      )[0]!;
      const invoiceNumbers = group.map((invoice) => invoice.number).join(', ');
      const descriptions = group
        .map((invoice) => invoice.careAuthorization?.service?.name)
        .filter(Boolean)
        .join(' · ');

      push({
        id: laboratoryBatch ? key : latestInvoice.id,
        kind: 'INVOICE',
        date: latestInvoice.issuedAt,
        title: laboratoryBatch
          ? `Facturation laboratoire · ${group.length} examen(s)`
          : `Facture ${latestInvoice.number}`,
        description: laboratoryBatch
          ? `${descriptions || 'Examens de laboratoire'} — Total : ${total} CDF — Références : ${invoiceNumbers}`
          : `Montant : ${latestInvoice.total.toString()} CDF`,
        status: group.every((invoice) => invoice.status === 'PAID') ? 'PAID' : latestInvoice.status,
        author: latestInvoice.issuedBy.username,
        department: departmentLabels[latestInvoice.issuedBy.role],
      });

      if (payments.length) {
        const latestPayment = [...payments].sort(
          (a, b) => b.payment.paidAt.getTime() - a.payment.paidAt.getTime(),
        )[0]!;
        const paid = payments.reduce((sum, item) => sum + Number(item.payment.amount), 0);
        const methods = [...new Set(payments.map((item) => item.payment.method))].join(', ');
        push({
          id: laboratoryBatch ? `PAY-${key}` : latestPayment.payment.id,
          kind: 'PAYMENT',
          date: latestPayment.payment.paidAt,
          title: laboratoryBatch
            ? `Paiement laboratoire · ${group.length} examen(s)`
            : `Paiement · Facture ${latestPayment.invoice.number}`,
          description: `${paid} CDF · ${methods}${laboratoryBatch ? ` · ${invoiceNumbers}` : ''}`,
          status: 'PAID',
          author: latestPayment.payment.receivedBy.username,
          department: departmentLabels[latestPayment.payment.receivedBy.role],
        });
      }
    });

    hospitalizations.forEach((row) => {
      const doctor = row.doctor
        ? [row.doctor.lastName, row.doctor.postName, row.doctor.firstName].filter(Boolean).join(' ')
        : undefined;
      push({
        id: row.id,
        kind: 'HOSPITALIZATION',
        date: row.dischargedAt ?? row.admittedAt,
        title: `Hospitalisation · ${row.reason}`,
        description: [
          `${row.bed.room.name} (${row.bed.room.code}), lit ${row.bed.code}`,
          doctor ? `Médecin : ${doctor}` : undefined,
          row.notes,
        ]
          .filter(Boolean)
          .join(' — '),
        status: row.status,
        department: 'Hospitalisation',
      });
    });

    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    const groups = entries.reduce<Record<string, { date: string; entries: HistoryEntry[] }>>(
      (dateGroups, entry) => {
        (dateGroups[entry.dateKey] ??= { date: entry.dateKey, entries: [] }).entries.push(entry);
        return dateGroups;
      },
      {},
    );

    return {
      patient,
      entries,
      groups: Object.values(groups).sort((a, b) => b.date.localeCompare(a.date)),
      counts: entries.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
        return counts;
      }, {}),
    };
  }
}
