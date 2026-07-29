import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillableServiceType,
  ConsultationStatus,
  ExamStatus,
  PatientJourneyStage,
  Prisma,
  Role,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteExamDto } from './dto/complete-exam.dto';
import {
  CreateExamBatchDto,
  CreateExamDto,
  CreateLabExamCatalogDto,
  UpdateLabExamCatalogDto,
} from './dto/create-exam.dto';
import { decodeLabTemplate, encodeLabTemplate } from './lab-template-envelope';
import { LabResultField } from './lab-result-templates';

export interface LabDocumentUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const examInclude = {
  patient: true,
  requestedByDoctor: { include: { user: { select: { username: true } } } },
  performedByLabTech: { include: { user: { select: { username: true } } } },
  validatedByLabTech: { include: { user: { select: { username: true } } } },
  careAuthorization: { include: { service: true, invoice: { include: { payments: true } } } },
  document: {
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
  },
} satisfies Prisma.ExamRequestInclude;

type ExamRow = Prisma.ExamRequestGetPayload<{ include: typeof examInclude }>;
type CatalogRow = Prisma.BillableServiceGetPayload<Record<string, never>>;

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
  ) {}

  async list(status?: ExamStatus, patientId?: string) {
    const rows = await this.prisma.examRequest.findMany({
      where: { ...(status ? { status } : {}), ...(patientId ? { patientId } : {}) },
      include: examInclude,
      orderBy: { requestedAt: 'desc' },
      take: 250,
    });
    return rows.map((row) => this.presentExam(row));
  }

  async get(id: string) {
    const exam = await this.prisma.examRequest.findUnique({ where: { id }, include: examInclude });
    if (!exam) throw new NotFoundException('Examen introuvable.');
    return this.presentExam(exam);
  }

  async request(dto: CreateExamDto, userId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) throw new ForbiddenException('Profil médecin requis.');
    return this.prisma.$transaction(async (transaction) => {
      const { billableServiceId, ...examData } = dto;
      const service = await transaction.billableService.findUnique({ where: { id: billableServiceId } });
      if (!service || !service.isActive || service.type !== BillableServiceType.LABORATORY) {
        throw new BadRequestException('Examen de laboratoire introuvable, inactif ou non facturable.');
      }
      const template = decodeLabTemplate(service.labResultTemplate, service.code, service.category);
      const exam = await transaction.examRequest.create({
        data: {
          ...examData,
          type: service.name,
          requestGroupId: randomUUID(),
          resultSchema: this.asJson(template.fields),
          requestedByDoctorId: doctor.id,
        },
      });
      await this.authorizations.createFromService(
        {
          patientId: dto.patientId,
          serviceId: billableServiceId,
          createdById: userId,
          expectedType: BillableServiceType.LABORATORY,
          examRequestId: exam.id,
        },
        transaction,
      );
      await this.markLaboratoryStage(transaction, dto.consultationId);
      const row = await transaction.examRequest.findUniqueOrThrow({
        where: { id: exam.id },
        include: examInclude,
      });
      return this.presentExam(row);
    });
  }

  async requestBatch(dto: CreateExamBatchDto, userId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { userId } });
    if (!doctor) throw new ForbiddenException('Profil médecin requis.');
    const services = await this.prisma.billableService.findMany({
      where: { id: { in: dto.serviceIds }, type: BillableServiceType.LABORATORY, isActive: true },
    });
    if (services.length !== dto.serviceIds.length) {
      throw new BadRequestException(
        'Un ou plusieurs examens sélectionnés sont introuvables, inactifs ou non facturables au laboratoire.',
      );
    }
    if (dto.consultationId) {
      const existing = await this.prisma.careAuthorization.count({
        where: {
          serviceId: { in: dto.serviceIds },
          examRequest: { consultationId: dto.consultationId },
        },
      });
      if (existing > 0) {
        throw new ConflictException('Un examen sélectionné a déjà été demandé pendant cette consultation.');
      }
    }
    const orderedServices = dto.serviceIds.map(
      (serviceId) => services.find((service) => service.id === serviceId)!,
    );
    const requestGroupId = randomUUID();

    return this.prisma.$transaction(async (transaction) => {
      const created: ExamRow[] = [];
      for (const service of orderedServices) {
        const template = decodeLabTemplate(service.labResultTemplate, service.code, service.category);
        const exam = await transaction.examRequest.create({
          data: {
            patientId: dto.patientId,
            consultationId: dto.consultationId,
            requestedByDoctorId: doctor.id,
            requestGroupId,
            type: service.name,
            observations: dto.observations,
            resultSchema: this.asJson(template.fields),
          },
        });
        await this.authorizations.createFromService(
          {
            patientId: dto.patientId,
            serviceId: service.id,
            createdById: userId,
            expectedType: BillableServiceType.LABORATORY,
            examRequestId: exam.id,
          },
          transaction,
        );
        created.push(
          await transaction.examRequest.findUniqueOrThrow({
            where: { id: exam.id },
            include: examInclude,
          }),
        );
      }
      await this.markLaboratoryStage(transaction, dto.consultationId);
      return created.map((row) => this.presentExam(row));
    });
  }

  async createCatalogEntry(dto: CreateLabExamCatalogDto) {
    try {
      const category = dto.category?.trim() || 'Autres examens';
      const template = encodeLabTemplate({
        value: dto.resultFields,
        code: dto.code,
        category,
        specimenType: dto.specimenType,
        method: dto.method,
      });
      const row = await this.prisma.billableService.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          category,
          type: BillableServiceType.LABORATORY,
          price: new Prisma.Decimal(dto.price),
          requiresPrepayment: true,
          isActive: dto.isActive ?? true,
          labResultTemplate: this.asJson(template),
        },
      });
      return this.presentCatalog(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Cette référence d’examen existe déjà dans le catalogue.');
      }
      throw error;
    }
  }

  async updateCatalogEntry(id: string, dto: UpdateLabExamCatalogDto) {
    const current = await this.prisma.billableService.findFirst({
      where: { id, type: BillableServiceType.LABORATORY },
    });
    if (!current) throw new NotFoundException('Examen du catalogue introuvable.');
    const category = dto.category?.trim() || current.category || 'Autres examens';
    const existing = decodeLabTemplate(current.labResultTemplate, current.code, current.category);
    const template = encodeLabTemplate({
      value: dto.resultFields ?? existing.fields,
      code: dto.code ?? current.code,
      category,
      specimenType: dto.specimenType ?? existing.specimenType,
      method: dto.method ?? existing.method,
    });
    try {
      const row = await this.prisma.billableService.update({
        where: { id },
        data: {
          code: dto.code?.trim().toUpperCase(),
          name: dto.name?.trim(),
          category,
          price: dto.price === undefined ? undefined : new Prisma.Decimal(dto.price),
          isActive: dto.isActive,
          labResultTemplate: this.asJson(template),
        },
      });
      return this.presentCatalog(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Cette référence d’examen existe déjà dans le catalogue.');
      }
      throw error;
    }
  }

  async complete(id: string, dto: CompleteExamDto, userId: string) {
    const lab = await this.prisma.labTechnicianProfile.findUnique({ where: { userId } });
    if (!lab) throw new ForbiddenException('Profil de technicien de laboratoire requis.');
    const exam = await this.find(id);
    if (exam.status !== ExamStatus.REQUESTED && exam.status !== ExamStatus.IN_PROGRESS) {
      throw new BadRequestException('Cet examen ne peut plus recevoir de résultat.');
    }
    if (!exam.careAuthorization) {
      throw new NotFoundException("Autorisation financière de l'examen introuvable.");
    }
    const template = decodeLabTemplate(
      exam.resultSchema ?? exam.careAuthorization.service?.labResultTemplate,
      exam.careAuthorization.service?.code,
      exam.careAuthorization.service?.category,
    );
    const structuredResult = this.prepareResult(template.fields, dto);
    return this.prisma.$transaction(async (transaction) => {
      await this.authorizations.consume(
        exam.careAuthorization!.id,
        exam.patientId,
        BillableServiceType.LABORATORY,
        { examRequestId: exam.id },
        transaction,
      );
      const row = await transaction.examRequest.update({
        where: { id },
        data: {
          result: structuredResult.summary,
          resultSchema: this.asJson(template.fields),
          resultData: this.asJson(structuredResult.data),
          reviewComment: null,
          status: ExamStatus.COMPLETED,
          completedAt: new Date(),
          performedByLabTechId: lab.id,
          validatedByLabTechId: null,
          validatedAt: null,
        },
        include: examInclude,
      });
      return this.presentExam(row);
    });
  }

  async validate(id: string, userId: string) {
    const lab = await this.prisma.labTechnicianProfile.findUnique({ where: { userId } });
    if (!lab) throw new ForbiddenException('Profil de biologiste médical requis.');
    const exam = await this.find(id);
    if (exam.status !== ExamStatus.COMPLETED || !exam.result) {
      throw new BadRequestException('Le résultat doit être complété avant validation.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const validated = await transaction.examRequest.update({
        where: { id },
        data: {
          status: ExamStatus.VALIDATED,
          validatedAt: new Date(),
          validatedByLabTechId: lab.id,
          reviewComment: null,
        },
        include: examInclude,
      });
      let allResultsReady = false;
      if (exam.consultationId) {
        const remaining = await transaction.examRequest.count({
          where: {
            consultationId: exam.consultationId,
            status: { notIn: [ExamStatus.VALIDATED, ExamStatus.CANCELLED] },
          },
        });
        if (remaining === 0) {
          const consultation = await transaction.consultation.update({
            where: { id: exam.consultationId },
            data: { status: ConsultationStatus.IN_PROGRESS, completedAt: null },
            select: { appointmentId: true },
          });
          if (consultation.appointmentId) {
            await transaction.appointment.update({
              where: { id: consultation.appointmentId },
              data: {
                status: 'CHECKED_IN',
                journeyStage: PatientJourneyStage.RETURN_TO_DOCTOR,
                journeyUpdatedAt: new Date(),
                doctorAcknowledgedAt: null,
              },
            });
          }
          allResultsReady = true;
        }
      }
      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          OR: [
            { id: exam.requestedByDoctor.userId },
            { role: { in: [Role.RECEPTIONIST, Role.SECRETARY] } },
            { additionalRoles: { hasSome: [Role.RECEPTIONIST, Role.SECRETARY] } },
          ],
        },
        select: { id: true },
      });
      const patientName = [exam.patient.lastName, exam.patient.postName, exam.patient.firstName]
        .filter(Boolean)
        .join(' ');
      const message = allResultsReady
        ? `Retour laboratoire : tous les examens de ${patientName} (${exam.patient.medicalRecordNumber}) sont validés. Le patient réapparaît dans la file de son médecin.`
        : `Résultat prêt : ${exam.type} — ${patientName} (${exam.patient.medicalRecordNumber}). Le résultat validé est disponible dans le dossier patient.`;
      const notifications = recipients
        .filter((recipient) => recipient.id !== userId)
        .map((recipient) => ({ senderId: userId, receiverId: recipient.id, content: message }));
      if (notifications.length) await transaction.message.createMany({ data: notifications });
      return this.presentExam(validated);
    });
  }

  async reject(id: string, comment: string, userId: string) {
    const reviewer = await this.prisma.labTechnicianProfile.findUnique({ where: { userId } });
    if (!reviewer) throw new ForbiddenException('Profil de biologiste médical requis.');
    const exam = await this.find(id);
    if (exam.status !== ExamStatus.COMPLETED) {
      throw new BadRequestException('Seul un résultat en attente de validation peut être renvoyé.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const rejected = await transaction.examRequest.update({
        where: { id },
        data: {
          status: ExamStatus.IN_PROGRESS,
          reviewComment: comment.trim(),
          validatedByLabTechId: null,
          validatedAt: null,
        },
        include: examInclude,
      });
      if (exam.performedByLabTech?.userId && exam.performedByLabTech.userId !== userId) {
        await transaction.message.create({
          data: {
            senderId: userId,
            receiverId: exam.performedByLabTech.userId,
            content: `Résultat à corriger : ${exam.type} — ${exam.patient.medicalRecordNumber}. Motif du biologiste : ${comment.trim()}`,
          },
        });
      }
      return this.presentExam(rejected);
    });
  }

  async uploadDocument(id: string, file: LabDocumentUpload, userId: string) {
    const lab = await this.prisma.labTechnicianProfile.findUnique({ where: { userId } });
    if (!lab) throw new ForbiddenException('Profil de laboratoire requis.');
    await this.find(id);
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Le document doit être un PDF, JPEG, PNG ou WebP.');
    }
    if (!file.size || file.size > 8 * 1024 * 1024) {
      throw new BadRequestException('Le document numérisé ne doit pas dépasser 8 Mo.');
    }
    const binary = Uint8Array.from(file.buffer);
    const document = await this.prisma.labExamDocument.upsert({
      where: { examRequestId: id },
      update: {
        fileName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        data: binary,
        uploadedById: userId,
        uploadedAt: new Date(),
      },
      create: {
        examRequestId: id,
        fileName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        data: binary,
        uploadedById: userId,
      },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
    });
    await this.prisma.examRequest.update({ where: { id }, data: { resultFileKey: document.id } });
    return document;
  }

  async document(id: string) {
    const document = await this.prisma.labExamDocument.findUnique({ where: { examRequestId: id } });
    if (!document) throw new NotFoundException('Document de laboratoire introuvable.');
    return document;
  }

  private async find(id: string) {
    const exam = await this.prisma.examRequest.findUnique({
      where: { id },
      include: {
        careAuthorization: { include: { service: true } },
        patient: true,
        requestedByDoctor: { select: { userId: true } },
        performedByLabTech: { select: { userId: true } },
      },
    });
    if (!exam) throw new NotFoundException('Examen introuvable.');
    return exam;
  }

  private async markLaboratoryStage(
    transaction: Prisma.TransactionClient,
    consultationId?: string,
  ) {
    if (!consultationId) return;
    const consultation = await transaction.consultation.findUnique({
      where: { id: consultationId },
      select: { appointmentId: true },
    });
    if (!consultation?.appointmentId) return;
    await transaction.appointment.update({
      where: { id: consultation.appointmentId },
      data: { journeyStage: PatientJourneyStage.LABORATORY, journeyUpdatedAt: new Date() },
    });
  }

  private prepareResult(schema: LabResultField[], dto: CompleteExamDto) {
    if (!dto.resultValues?.length) {
      const legacy = dto.result?.trim();
      if (!legacy) throw new BadRequestException('Renseignez au moins une rubrique du résultat.');
      return {
        summary: legacy,
        data: {
          values: [{ key: schema[0]?.key ?? 'resultat', value: legacy }],
          ...(dto.conclusion?.trim() ? { conclusion: dto.conclusion.trim() } : {}),
        },
      };
    }
    const schemaByKey = new Map(schema.map((entry) => [entry.key, entry]));
    const submittedKeys = new Set<string>();
    const values = dto.resultValues
      .map((entry) => ({
        key: entry.key.trim().toLowerCase(),
        value: entry.value.trim(),
        ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
      }))
      .filter((entry) => entry.value || entry.note)
      .map((entry) => {
        if (!schemaByKey.has(entry.key)) {
          throw new BadRequestException(`La rubrique « ${entry.key} » ne fait pas partie de cet examen.`);
        }
        if (submittedKeys.has(entry.key)) {
          throw new BadRequestException(`La rubrique « ${entry.key} » est envoyée plusieurs fois.`);
        }
        submittedKeys.add(entry.key);
        return entry;
      });
    const missing = schema.filter((entry) => entry.required && !submittedKeys.has(entry.key));
    if (missing.length) {
      throw new BadRequestException(
        `Complétez les rubriques obligatoires : ${missing.map((entry) => entry.label).join(', ')}.`,
      );
    }
    if (!values.length) throw new BadRequestException('Renseignez au moins une rubrique du résultat.');
    const lines = values.map((entry) => {
      const definition = schemaByKey.get(entry.key)!;
      return `${definition.label} : ${entry.value}${definition.unit ? ` ${definition.unit}` : ''}${entry.note ? ` — ${entry.note}` : ''}`;
    });
    if (dto.conclusion?.trim()) lines.push(`Conclusion : ${dto.conclusion.trim()}`);
    return {
      summary: lines.join('\n'),
      data: { values, ...(dto.conclusion?.trim() ? { conclusion: dto.conclusion.trim() } : {}) },
    };
  }

  private presentExam(row: ExamRow) {
    const service = row.careAuthorization?.service;
    const template = decodeLabTemplate(
      service?.labResultTemplate,
      service?.code,
      service?.category,
    );
    const authorizationStatus = row.careAuthorization?.status;
    const workflowStatus =
      row.status === ExamStatus.CANCELLED
        ? 'CANCELLED'
        : authorizationStatus === 'PENDING'
          ? 'PENDING_PAYMENT'
          : row.status === ExamStatus.REQUESTED
            ? 'PAID'
            : row.status === ExamStatus.IN_PROGRESS
              ? 'IN_PROGRESS'
              : row.status === ExamStatus.COMPLETED
                ? 'RESULT_ENTERED'
                : row.status === ExamStatus.VALIDATED
                  ? 'VALIDATED'
                  : 'IN_PROGRESS';
    return {
      ...row,
      workflowStatus,
      catalogMetadata: {
        specimenType: template.specimenType,
        method: template.method,
      },
    };
  }

  private presentCatalog(row: CatalogRow) {
    const template = decodeLabTemplate(row.labResultTemplate, row.code, row.category);
    return {
      ...row,
      specimenType: template.specimenType,
      method: template.method,
      resultFields: template.fields,
    };
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
