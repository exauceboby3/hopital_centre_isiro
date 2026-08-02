import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BedStatus, CustomFieldEntity, HospitalizationStatus, Prisma } from '@prisma/client';
import { hospitalCalendarYear } from '../common/hospital-time';
import { ConfigurationService } from '../configuration/configuration.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicalAmendmentDto } from './dto/create-clinical-amendment.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsDto } from './dto/list-patients.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

type DatabaseClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuration: ConfigurationService,
  ) {}

  async list(query: ListPatientsDto) {
    const search = query.search?.trim();
    const where: Prisma.PatientWhereInput = {
      archivedAt: null,
      ...(query.sex ? { sex: query.sex } : {}),
      ...(search
        ? {
            OR: [
              { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { postName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        omit: { identityKey: true },
        skip,
        take: query.limit,
        orderBy: [{ lastName: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async lookup(query: ListPatientsDto) {
    const search = query.search?.trim();
    const where: Prisma.PatientWhereInput = {
      archivedAt: null,
      ...(query.sex ? { sex: query.sex } : {}),
      ...(search
        ? {
            OR: [
              { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { postName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        select: {
          id: true,
          medicalRecordNumber: true,
          lastName: true,
          postName: true,
          firstName: true,
          sex: true,
          phone: true,
          createdAt: true,
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ medicalRecordNumber: 'asc' }],
      }),
      this.prisma.patient.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, archivedAt: null },
      omit: { identityKey: true },
      include: {
        appointments: { orderBy: { scheduledAt: 'desc' }, take: 10 },
        consultations: { orderBy: { createdAt: 'desc' }, take: 10 },
        examRequests: { orderBy: { requestedAt: 'desc' }, take: 10 },
        hospitalizations: { orderBy: { admittedAt: 'desc' }, take: 10 },
        clinicalAmendments: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { author: { select: { id: true, username: true, role: true } } },
        },
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient introuvable.');
    }
    return {
      ...patient,
      customFields: await this.configuration.values(CustomFieldEntity.PATIENT, patient.id),
    };
  }

  async clinicalAmendments(patientId: string) {
    const exists = await this.prisma.patient.count({ where: { id: patientId, archivedAt: null } });
    if (!exists) throw new NotFoundException('Patient introuvable.');
    return this.prisma.patientClinicalAmendment.findMany({
      where: { patientId },
      include: {
        author: { select: { id: true, username: true, role: true } },
        consultation: { select: { id: true, reason: true, status: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createClinicalAmendment(
    patientId: string,
    dto: CreateClinicalAmendmentDto,
    authorId: string,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, archivedAt: null },
      select: { id: true, medicalRecordNumber: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    if (dto.consultationId) {
      const consultation = await this.prisma.consultation.findFirst({
        where: { id: dto.consultationId, patientId },
        select: { id: true },
      });
      if (!consultation) {
        throw new ConflictException('La consultation sélectionnée ne correspond pas à ce patient.');
      }
    }

    return this.prisma.$transaction(async (transaction) => {
      const amendment = await transaction.patientClinicalAmendment.create({
        data: {
          patientId,
          consultationId: dto.consultationId,
          authorId,
          category: dto.category.trim().toUpperCase(),
          fieldName: dto.fieldName.trim(),
          previousValue: dto.previousValue?.trim() || null,
          newValue: dto.newValue.trim(),
          reason: dto.reason.trim(),
        },
        include: {
          author: { select: { id: true, username: true, role: true } },
          consultation: { select: { id: true, reason: true, status: true, createdAt: true } },
        },
      });
      await transaction.auditLog.create({
        data: {
          userId: authorId,
          action: 'PATIENT_CLINICAL_AMENDMENT_CREATED',
          entity: 'Patient',
          entityId: patientId,
          metadata: {
            medicalRecordNumber: patient.medicalRecordNumber,
            amendmentId: amendment.id,
            consultationId: dto.consultationId ?? null,
            category: amendment.category,
            fieldName: amendment.fieldName,
            reason: amendment.reason,
          },
        },
      });
      return amendment;
    });
  }

  create(dto: CreatePatientDto, db?: DatabaseClient) {
    if (db) return this.createWithDatabase(dto, db);
    return this.prisma.$transaction((transaction) => this.createWithDatabase(dto, transaction));
  }

  private async createWithDatabase(dto: CreatePatientDto, db: DatabaseClient) {
    const year = hospitalCalendarYear();
    const { customFields, ...patientData } = dto;
    const identityKey = this.identityKey(patientData);
    await this.ensureUniqueIdentity(db, identityKey);
    const sequence = await db.patientNumberSequence.upsert({
      where: { year },
      update: { lastValue: { increment: 1 } },
      create: { year, lastValue: 1 },
    });
    const medicalRecordNumber = `CHI-${year}-${String(sequence.lastValue).padStart(6, '0')}`;
    const patient = await db.patient.create({
      data: {
        ...patientData,
        medicalRecordNumber,
        identityKey,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
      omit: { identityKey: true },
    });
    await this.configuration.saveValues(
      CustomFieldEntity.PATIENT,
      patient.id,
      customFields,
      db,
      true,
    );
    return patient;
  }

  async history(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, archivedAt: null },
      select: {
        id: true,
        medicalRecordNumber: true,
        lastName: true,
        postName: true,
        firstName: true,
        sex: true,
        dateOfBirth: true,
        bloodType: true,
        phone: true,
        address: true,
        emergencyContact: true,
        createdAt: true,
      },
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
      clinicalOrders,
      specialtyCases,
      radiologyStudies,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: id },
        select: { id: true, scheduledAt: true, service: true, reason: true, status: true },
      }),
      this.prisma.consultation.findMany({
        where: { patientId: id },
        select: {
          id: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          reason: true,
          report: true,
          orientation: true,
          status: true,
          doctor: { select: { lastName: true, postName: true, firstName: true } },
        },
      }),
      this.prisma.examRequest.findMany({
        where: { patientId: id },
        select: {
          id: true,
          requestedAt: true,
          completedAt: true,
          validatedAt: true,
          type: true,
          observations: true,
          result: true,
          status: true,
        },
      }),
      this.prisma.hospitalization.findMany({
        where: { patientId: id },
        select: {
          id: true,
          admittedAt: true,
          dischargedAt: true,
          reason: true,
          notes: true,
          status: true,
          bed: { select: { code: true, room: { select: { code: true, name: true } } } },
        },
      }),
      this.prisma.vitalSign.findMany({
        where: { patientId: id },
        select: {
          id: true,
          recordedAt: true,
          weightKg: true,
          heightCm: true,
          temperatureC: true,
          systolic: true,
          diastolic: true,
          pulse: true,
          oxygenPercent: true,
          notes: true,
        },
      }),
      this.prisma.prescription.findMany({
        where: { patientId: id },
        select: {
          id: true,
          number: true,
          prescribedAt: true,
          diagnosis: true,
          generalInstructions: true,
          status: true,
          items: {
            select: {
              dosage: true,
              frequency: true,
              medicationName: true,
              strength: true,
              availability: true,
              medication: { select: { name: true, strength: true } },
            },
          },
        },
      }),
      this.prisma.nursingCare.findMany({
        where: { patientId: id },
        select: {
          id: true,
          scheduledAt: true,
          performedAt: true,
          label: true,
          medicationName: true,
          observations: true,
          status: true,
        },
      }),
      this.prisma.clinicalOrder.findMany({
        where: { patientId: id },
        select: {
          id: true,
          createdAt: true,
          completedAt: true,
          validatedAt: true,
          clinicalIndication: true,
          result: true,
          status: true,
          service: { select: { name: true } },
        },
      }),
      this.prisma.specialtyCase.findMany({
        where: { patientId: id },
        select: {
          id: true,
          createdAt: true,
          completedAt: true,
          title: true,
          diagnosis: true,
          report: true,
          status: true,
        },
      }),
      this.prisma.radiologyStudy.findMany({
        where: { patientId: id },
        select: {
          id: true,
          createdAt: true,
          acquiredAt: true,
          reportedAt: true,
          bodyPart: true,
          indication: true,
          report: true,
          modality: true,
          status: true,
        },
      }),
    ]);

    type HistoryEntry = {
      id: string;
      kind: string;
      date: Date;
      title: string;
      description?: string;
      status?: string;
    };
    const entries: HistoryEntry[] = [];
    appointments.forEach((row) =>
      entries.push({
        id: row.id,
        kind: 'APPOINTMENT',
        date: row.scheduledAt,
        title: `Rendez-vous · ${row.service}`,
        description: row.reason ?? undefined,
        status: row.status,
      }),
    );
    consultations.forEach((row) => {
      const doctor = [row.doctor.lastName, row.doctor.postName, row.doctor.firstName]
        .filter(Boolean)
        .join(' ');
      entries.push({
        id: row.id,
        kind: 'CONSULTATION',
        date: row.completedAt ?? row.startedAt ?? row.createdAt,
        title: `Consultation · ${row.reason}`,
        description: [row.report, row.orientation, doctor ? `Médecin : ${doctor}` : undefined]
          .filter(Boolean)
          .join(' — '),
        status: row.status,
      });
    });
    exams.forEach((row) =>
      entries.push({
        id: row.id,
        kind: 'LABORATORY',
        date: row.validatedAt ?? row.completedAt ?? row.requestedAt,
        title: `Laboratoire · ${row.type}`,
        description: row.result ?? row.observations ?? undefined,
        status: row.status,
      }),
    );
    hospitalizations.forEach((row) =>
      entries.push({
        id: row.id,
        kind: 'HOSPITALIZATION',
        date: row.dischargedAt ?? row.admittedAt,
        title: `Hospitalisation · ${row.reason}`,
        description: [`${row.bed.room.name} (${row.bed.room.code}), lit ${row.bed.code}`, row.notes]
          .filter(Boolean)
          .join(' — '),
        status: row.status,
      }),
    );
    vitalSigns.forEach((row) => {
      const values = [
        row.temperatureC ? `${row.temperatureC.toString()} °C` : undefined,
        row.weightKg ? `${row.weightKg.toString()} kg` : undefined,
        row.heightCm ? `${row.heightCm.toString()} cm` : undefined,
        row.systolic && row.diastolic ? `TA ${row.systolic}/${row.diastolic}` : undefined,
        row.pulse ? `Pouls ${row.pulse}/min` : undefined,
        row.oxygenPercent ? `SpO₂ ${row.oxygenPercent}%` : undefined,
        row.notes,
      ];
      entries.push({
        id: row.id,
        kind: 'VITAL_SIGN',
        date: row.recordedAt,
        title: 'Paramètres vitaux',
        description: values.filter(Boolean).join(' · '),
      });
    });
    prescriptions.forEach((row) =>
      entries.push({
        id: row.id,
        kind: 'PRESCRIPTION',
        date: row.prescribedAt,
        title: `Ordonnance ${row.number}`,
        description: [
          row.diagnosis,
          row.items
            .map(
              (item) =>
                `${item.medicationName || item.medication?.name || 'Médicament'} ${item.strength || item.medication?.strength || ''} — ${item.dosage}, ${item.frequency}${item.availability !== 'INTERNAL' ? ' — achat extérieur' : ''}`,
            )
            .join(' ; '),
          row.generalInstructions,
        ]
          .filter(Boolean)
          .join(' — '),
        status: row.status,
      }),
    );
    nursingCare.forEach((row) =>
      entries.push({
        id: row.id,
        kind: 'NURSING',
        date: row.performedAt ?? row.scheduledAt,
        title: `Soin infirmier · ${row.label}`,
        description: [row.medicationName, row.observations].filter(Boolean).join(' — '),
        status: row.status,
      }),
    );
    clinicalOrders.forEach((row) =>
      entries.push({
        id: row.id,
        kind: 'CLINICAL_ORDER',
        date: row.validatedAt ?? row.completedAt ?? row.createdAt,
        title: `Acte clinique · ${row.service.name}`,
        description: row.result ?? row.clinicalIndication,
        status: row.status,
      }),
    );
    specialtyCases.forEach((row) =>
      entries.push({
        id: row.id,
        kind: 'SPECIALTY',
        date: row.completedAt ?? row.createdAt,
        title: row.title,
        description: row.report ?? row.diagnosis ?? undefined,
        status: row.status,
      }),
    );
    radiologyStudies.forEach((row) =>
      entries.push({
        id: row.id,
        kind: 'RADIOLOGY',
        date: row.reportedAt ?? row.acquiredAt ?? row.createdAt,
        title: `Imagerie ${row.modality} · ${row.bodyPart}`,
        description: row.report ?? row.indication,
        status: row.status,
      }),
    );

    entries.sort((left, right) => right.date.getTime() - left.date.getTime());
    const counts = entries.reduce<Record<string, number>>((result, entry) => {
      result[entry.kind] = (result[entry.kind] ?? 0) + 1;
      return result;
    }, {});
    return {
      patient: {
        ...patient,
        customFields: await this.configuration.values(CustomFieldEntity.PATIENT, patient.id),
      },
      entries,
      counts,
    };
  }

  async update(id: string, dto: UpdatePatientDto) {
    const current = await this.prisma.patient.findFirst({
      where: { id, archivedAt: null },
      select: {
        lastName: true,
        postName: true,
        firstName: true,
        dateOfBirth: true,
        phone: true,
      },
    });
    if (!current) throw new NotFoundException('Patient introuvable.');
    const { customFields, ...patientData } = dto;
    return this.prisma.$transaction(async (transaction) => {
      const identityKey = this.identityKey({
        lastName: dto.lastName ?? current.lastName,
        postName: dto.postName ?? current.postName ?? undefined,
        firstName: dto.firstName ?? current.firstName ?? undefined,
        dateOfBirth:
          dto.dateOfBirth === undefined
            ? current.dateOfBirth?.toISOString()
            : dto.dateOfBirth || undefined,
        phone: dto.phone ?? current.phone ?? undefined,
      });
      await this.ensureUniqueIdentity(transaction, identityKey, id);
      const patient = await transaction.patient.update({
        where: { id },
        data: {
          ...patientData,
          identityKey,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        },
        omit: { identityKey: true },
      });
      if (customFields) {
        await this.configuration.saveValues(
          CustomFieldEntity.PATIENT,
          id,
          customFields,
          transaction,
          false,
        );
      }
      return patient;
    });
  }

  async removePermanently(
    id: string,
    actorId: string,
    confirmation: string,
    reason: string,
  ): Promise<{
    success: true;
    deletedRecords: number;
    patient: { id: string; medicalRecordNumber: string; displayName: string };
  }> {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      select: {
        id: true,
        medicalRecordNumber: true,
        lastName: true,
        postName: true,
        firstName: true,
      },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    if (confirmation.trim() !== patient.medicalRecordNumber) {
      throw new ConflictException('Le numéro de dossier saisi ne correspond pas au patient.');
    }
    if (reason.trim().length < 10) {
      throw new ConflictException('Un motif détaillé est obligatoire pour la suppression définitive.');
    }

    const deletedRecords = await this.prisma.$transaction(async (transaction) => {
      const activeHospitalizations = await transaction.hospitalization.findMany({
        where: { patientId: id, status: HospitalizationStatus.ACTIVE },
        select: { bedId: true },
      });
      const bedIds = [...new Set(activeHospitalizations.map((row) => row.bedId))];
      let deleted = 0;
      const count = (result: { count: number }) => {
        deleted += result.count;
      };

      count(
        await transaction.customFieldValue.deleteMany({
          where: { entityId: id, definition: { entity: CustomFieldEntity.PATIENT } },
        }),
      );
      count(
        await transaction.labExamDocument.deleteMany({
          where: { examRequest: { patientId: id } },
        }),
      );
      count(
        await transaction.dicomInstance.deleteMany({
          where: { study: { patientId: id } },
        }),
      );
      count(
        await transaction.prescriptionItem.deleteMany({
          where: { prescription: { patientId: id } },
        }),
      );
      count(
        await transaction.insuranceClaim.deleteMany({
          where: {
            OR: [{ patientInsurance: { patientId: id } }, { invoice: { patientId: id } }],
          },
        }),
      );
      count(
        await transaction.insuranceCoverage.deleteMany({
          where: {
            OR: [{ patientInsurance: { patientId: id } }, { invoice: { patientId: id } }],
          },
        }),
      );
      count(
        await transaction.voucherCoverage.deleteMany({
          where: {
            OR: [{ careVoucher: { patientId: id } }, { invoice: { patientId: id } }],
          },
        }),
      );
      count(await transaction.careAuthorization.deleteMany({ where: { patientId: id } }));
      count(
        await transaction.payment.deleteMany({
          where: { invoice: { patientId: id } },
        }),
      );
      count(
        await transaction.invoiceItem.deleteMany({
          where: { invoice: { patientId: id } },
        }),
      );
      count(await transaction.bloodTransfusion.deleteMany({ where: { patientId: id } }));
      count(await transaction.specialtyCase.deleteMany({ where: { patientId: id } }));
      count(await transaction.radiologyStudy.deleteMany({ where: { patientId: id } }));
      count(await transaction.nursingCare.deleteMany({ where: { patientId: id } }));
      count(await transaction.prescription.deleteMany({ where: { patientId: id } }));
      count(await transaction.careVoucher.deleteMany({ where: { patientId: id } }));
      count(await transaction.patientInsurance.deleteMany({ where: { patientId: id } }));
      count(await transaction.clinicalOrder.deleteMany({ where: { patientId: id } }));
      count(await transaction.invoice.deleteMany({ where: { patientId: id } }));
      count(await transaction.hospitalization.deleteMany({ where: { patientId: id } }));
      if (bedIds.length > 0) {
        await transaction.bed.updateMany({
          where: {
            id: { in: bedIds },
            hospitalizations: { none: { status: HospitalizationStatus.ACTIVE } },
          },
          data: { status: BedStatus.AVAILABLE },
        });
      }
      count(await transaction.examRequest.deleteMany({ where: { patientId: id } }));
      count(await transaction.vitalSign.deleteMany({ where: { patientId: id } }));
      count(await transaction.consultation.deleteMany({ where: { patientId: id } }));
      count(await transaction.appointment.deleteMany({ where: { patientId: id } }));
      await transaction.patient.delete({ where: { id } });
      await transaction.auditLog.create({
        data: {
          userId: actorId,
          action: 'PATIENT_PERMANENTLY_DELETED',
          entity: 'Patient',
          entityId: id,
          metadata: {
            medicalRecordNumber: patient.medicalRecordNumber,
            displayName: [patient.lastName, patient.postName, patient.firstName]
              .filter(Boolean)
              .join(' '),
            reason: reason.trim(),
            deletedRecords: deleted + 1,
          },
        },
      });

      return deleted + 1;
    });

    return {
      success: true,
      deletedRecords,
      patient: {
        id: patient.id,
        medicalRecordNumber: patient.medicalRecordNumber,
        displayName: [patient.lastName, patient.postName, patient.firstName]
          .filter(Boolean)
          .join(' '),
      },
    };
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.patient.count({ where: { id, archivedAt: null } });
    if (!exists) {
      throw new NotFoundException('Patient introuvable.');
    }
  }

  private identityKey(patient: {
    lastName: string;
    postName?: string | null;
    firstName?: string | null;
    dateOfBirth?: string | Date | null;
    phone?: string | null;
  }): string | null {
    const name = [patient.lastName, patient.postName, patient.firstName]
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.normalize('NFKC').trim().toLocaleLowerCase('fr'))
      .join(' ')
      .replace(/\s+/g, ' ');
    const birthDate = patient.dateOfBirth
      ? new Date(patient.dateOfBirth).toISOString().slice(0, 10)
      : '';
    const phone = patient.phone?.replace(/[^0-9+]/g, '') ?? '';
    if (!birthDate && !phone) return null;
    return `${name}|${birthDate || phone}`;
  }

  private async ensureUniqueIdentity(
    transaction: DatabaseClient,
    identityKey: string | null,
    excludedPatientId?: string,
  ): Promise<void> {
    if (!identityKey) return;
    const existing = await transaction.patient.findFirst({
      where: {
        identityKey,
        archivedAt: null,
        ...(excludedPatientId ? { id: { not: excludedPatientId } } : {}),
      },
      select: { medicalRecordNumber: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'PATIENT_ALREADY_EXISTS',
        message: `Ce patient possède déjà le dossier ${existing.medicalRecordNumber}. Recherchez ce numéro et ajoutez toutes les nouvelles informations dans ce dossier unique.`,
      });
    }
  }
}
