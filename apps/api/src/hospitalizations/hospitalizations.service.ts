import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BedStatus,
  BillableServiceType,
  ConsultationStatus,
  HospitalizationStatus,
  InvoiceStatus,
  NursingCareStatus,
  PatientJourneyStage,
  Prisma,
  Role,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { AdmitPatientDto } from './dto/admit-patient.dto';
import { CreateRoomDto } from './dto/create-room.dto';

const hospitalizationInclude = {
  patient: true,
  doctor: { include: { user: { select: { id: true, username: true } } } },
  bed: { include: { room: true } },
  careAuthorization: {
    include: {
      service: true,
      invoice: { include: { items: true, payments: true } },
    },
  },
} satisfies Prisma.HospitalizationInclude;

@Injectable()
export class HospitalizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
  ) {}

  list(status?: HospitalizationStatus) {
    return this.prisma.hospitalization.findMany({
      where: status ? { status } : undefined,
      include: hospitalizationInclude,
      orderBy: { admittedAt: 'desc' },
      take: 250,
    });
  }

  rooms() {
    return this.prisma.room.findMany({
      include: {
        beds: {
          orderBy: { code: 'asc' },
          include: {
            hospitalizations: {
              where: { status: HospitalizationStatus.ACTIVE },
              include: { patient: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  createRoom(dto: CreateRoomDto) {
    return this.prisma.room.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        service: dto.service,
        beds: {
          create: dto.bedCodes.map((code) => ({ code: code.trim().toUpperCase() })),
        },
      },
      include: { beds: true },
    });
  }

  async admit(dto: AdmitPatientDto, user: AuthenticatedUser) {
    let doctorId = dto.doctorId;
    if (hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE])) {
      doctorId = (await this.prisma.doctorProfile.findUnique({ where: { userId: user.id } }))?.id;
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.authorizations.assertAuthorized(
        dto.authorizationId,
        dto.patientId,
        BillableServiceType.HOSPITALIZATION,
        transaction,
      );

      const referralConsultation = await transaction.consultation.findFirst({
        where: {
          patientId: dto.patientId,
          status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },
          appointment: { journeyStage: PatientJourneyStage.HOSPITALIZATION },
        },
        select: {
          id: true,
          doctorId: true,
          appointmentId: true,
          doctor: { select: { userId: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      doctorId ??= referralConsultation?.doctorId;

      const claimed = await transaction.bed.updateMany({
        where: { id: dto.bedId, status: BedStatus.AVAILABLE },
        data: { status: BedStatus.OCCUPIED },
      });
      if (!claimed.count) throw new ConflictException("Ce lit n'est plus disponible.");

      const hospitalization = await transaction.hospitalization.create({
        data: {
          patientId: dto.patientId,
          bedId: dto.bedId,
          doctorId,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim(),
          expectedDischargeAt: dto.expectedDischargeAt
            ? new Date(dto.expectedDischargeAt)
            : undefined,
        },
      });
      await this.authorizations.consume(
        dto.authorizationId,
        dto.patientId,
        BillableServiceType.HOSPITALIZATION,
        { hospitalizationId: hospitalization.id },
        transaction,
      );

      await transaction.nursingCare.updateMany({
        where: {
          patientId: dto.patientId,
          ...(referralConsultation?.id ? { consultationId: referralConsultation.id } : {}),
          hospitalizationId: null,
          label: "Préparer l'admission en hospitalisation",
          status: {
            in: [
              NursingCareStatus.ORDERED,
              NursingCareStatus.SCHEDULED,
              NursingCareStatus.IN_PROGRESS,
            ],
          },
        },
        data: { hospitalizationId: hospitalization.id },
      });

      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          id: { not: user.id },
          OR: [
            ...(referralConsultation?.doctor.userId
              ? [{ id: referralConsultation.doctor.userId }]
              : []),
            { role: { in: [Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.NURSE] } },
            {
              additionalRoles: {
                hasSome: [Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.NURSE],
              },
            },
          ],
        },
        select: { id: true },
      });
      const patient = await transaction.patient.findUniqueOrThrow({
        where: { id: dto.patientId },
        select: { medicalRecordNumber: true, lastName: true, postName: true, firstName: true },
      });
      const bed = await transaction.bed.findUniqueOrThrow({
        where: { id: dto.bedId },
        include: { room: true },
      });
      const name = [patient.lastName, patient.postName, patient.firstName]
        .filter(Boolean)
        .join(' ');
      if (recipients.length) {
        await transaction.message.createMany({
          data: recipients.map((recipient) => ({
            senderId: user.id,
            receiverId: recipient.id,
            content: `Admission hospitalière enregistrée : ${name} (${patient.medicalRecordNumber}), chambre ${bed.room.code}, lit ${bed.code}. Le séjour sera facturé à la sortie.`,
          })),
        });
      }

      return transaction.hospitalization.findUniqueOrThrow({
        where: { id: hospitalization.id },
        include: hospitalizationInclude,
      });
    });
  }

  async discharge(id: string, userId?: string) {
    const hospitalization = await this.prisma.hospitalization.findUnique({
      where: { id },
      include: hospitalizationInclude,
    });
    if (!hospitalization) throw new NotFoundException('Hospitalisation introuvable.');
    if (hospitalization.status !== HospitalizationStatus.ACTIVE) {
      throw new ConflictException('Cette hospitalisation est déjà clôturée.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const dischargedAt = new Date();
      const updated = await transaction.hospitalization.update({
        where: { id },
        data: { status: HospitalizationStatus.DISCHARGED, dischargedAt },
      });
      // Le trigger de gouvernance place automatiquement le lit en maintenance et crée
      // une demande de nettoyage. Le lit ne redevient disponible qu'après validation.

      const authorization = hospitalization.careAuthorization;
      const invoice = authorization?.invoice;
      if (authorization && invoice) {
        const elapsed = dischargedAt.getTime() - hospitalization.admittedAt.getTime();
        const billedDays = Math.max(1, Math.ceil(elapsed / 86_400_000));
        const unitPrice = authorization.service?.price ?? authorization.amount;
        const total = unitPrice.mul(billedDays);
        const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const invoiceStatus =
          paid >= Number(total)
            ? InvoiceStatus.PAID
            : paid > 0
              ? InvoiceStatus.PARTIALLY_PAID
              : InvoiceStatus.PENDING;

        const firstItem = invoice.items[0];
        if (firstItem) {
          await transaction.invoiceItem.update({
            where: { id: firstItem.id },
            data: {
              description: `${authorization.service?.name ?? authorization.description} — ${billedDays} jour(s)`,
              quantity: billedDays,
              unitPrice,
              total,
            },
          });
        }
        await transaction.invoice.update({
          where: { id: invoice.id },
          data: {
            status: invoiceStatus,
            total,
            dueAt: dischargedAt,
            notes: `Facture de sortie — ${billedDays} jour(s) d'hospitalisation. Paiement à effectuer à la caisse.`,
          },
        });
        await transaction.careAuthorization.update({
          where: { id: authorization.id },
          data: { amount: total, quantity: billedDays },
        });
      }

      await transaction.nursingCare.updateMany({
        where: {
          hospitalizationId: id,
          status: { in: [NursingCareStatus.ORDERED, NursingCareStatus.SCHEDULED] },
        },
        data: { status: NursingCareStatus.CANCELLED },
      });

      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          ...(userId ? { id: { not: userId } } : {}),
          OR: [
            { role: { in: [Role.CASHIER, Role.ACCOUNTANT, Role.RECEPTIONIST, Role.SECRETARY] } },
            {
              additionalRoles: {
                hasSome: [Role.CASHIER, Role.ACCOUNTANT, Role.RECEPTIONIST, Role.SECRETARY],
              },
            },
          ],
        },
        select: { id: true },
      });
      if (recipients.length && userId) {
        const name = [
          hospitalization.patient.lastName,
          hospitalization.patient.postName,
          hospitalization.patient.firstName,
        ]
          .filter(Boolean)
          .join(' ');
        await transaction.message.createMany({
          data: recipients.map((recipient) => ({
            senderId: userId,
            receiverId: recipient.id,
            content: `Sortie d'hospitalisation : ${name} (${hospitalization.patient.medicalRecordNumber}). La facture ${invoice?.number ?? 'de sortie'} est prête pour encaissement. Le lit est en attente de nettoyage.`,
          })),
        });
      }

      return transaction.hospitalization.findUniqueOrThrow({
        where: { id: updated.id },
        include: hospitalizationInclude,
      });
    });
  }

  async transfer(id: string, bedId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const hospitalization = await transaction.hospitalization.findUnique({ where: { id } });
      if (!hospitalization) throw new NotFoundException('Hospitalisation introuvable.');
      if (hospitalization.status !== HospitalizationStatus.ACTIVE) {
        throw new ConflictException('Seule une hospitalisation active peut être déplacée.');
      }
      if (hospitalization.bedId === bedId) {
        throw new ConflictException('Le patient occupe déjà ce lit.');
      }
      const claimed = await transaction.bed.updateMany({
        where: { id: bedId, status: BedStatus.AVAILABLE },
        data: { status: BedStatus.OCCUPIED },
      });
      if (!claimed.count) throw new ConflictException("Le nouveau lit n'est plus disponible.");

      const moved = await transaction.hospitalization.updateMany({
        where: { id, status: HospitalizationStatus.ACTIVE, bedId: hospitalization.bedId },
        data: { bedId },
      });
      if (!moved.count) throw new ConflictException("L'hospitalisation vient d'être modifiée.");

      await transaction.bed.update({
        where: { id: hospitalization.bedId },
        data: { status: BedStatus.MAINTENANCE },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "BedTurnover" ("id", "bedId", "hospitalizationId", "status", "requestedAt")
        VALUES (${randomUUID()}, ${hospitalization.bedId}, ${id}, 'PENDING_CLEANING', CURRENT_TIMESTAMP)
      `);

      return transaction.hospitalization.findUniqueOrThrow({
        where: { id },
        include: hospitalizationInclude,
      });
    });
  }
}
