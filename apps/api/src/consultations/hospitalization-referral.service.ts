import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillableServiceType,
  CareAuthorizationStatus,
  ConsultationStatus,
  InvoiceStatus,
  NursingCareStatus,
  NursingCareType,
  PatientJourneyStage,
  Role,
} from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { assertLaboratoryResultsComplete } from './consultation-finalization.service';

@Injectable()
export class HospitalizationReferralService {
  constructor(private readonly prisma: PrismaService) {}

  async request(consultationId: string, serviceId: string, user: AuthenticatedUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: true,
        patient: true,
        appointment: true,
        examRequests: { select: { status: true } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    if (
      !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN]) &&
      consultation.doctor.userId !== user.id
    ) {
      throw new ForbiddenException('Cette consultation appartient à un autre médecin.');
    }

    assertLaboratoryResultsComplete(
      consultation.examRequests,
      'Hospitalisation indisponible',
    );

    const service = await this.prisma.billableService.findUnique({ where: { id: serviceId } });
    if (!service || !service.isActive || service.type !== BillableServiceType.HOSPITALIZATION) {
      throw new BadRequestException(
        "Le service d'hospitalisation choisi est introuvable ou inactif.",
      );
    }

    const referralMarker = `Consultation ${consultationId}`;
    const existing = await this.prisma.careAuthorization.findFirst({
      where: {
        patientId: consultation.patientId,
        serviceId,
        type: BillableServiceType.HOSPITALIZATION,
        hospitalizationId: null,
        status: {
          in: [
            CareAuthorizationStatus.PENDING,
            CareAuthorizationStatus.AUTHORIZED,
            CareAuthorizationStatus.WAIVED,
          ],
        },
        invoice: { notes: { contains: referralMarker } },
      },
      include: { patient: true, service: true, invoice: { include: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      const now = new Date();
      await this.finalizeMedicalReferral(consultationId, consultation.appointmentId, now);
      return existing;
    }

    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const currentExams = await transaction.examRequest.findMany({
        where: { consultationId },
        select: { status: true },
      });
      assertLaboratoryResultsComplete(currentExams, 'Hospitalisation indisponible');

      const invoice = await transaction.invoice.create({
        data: {
          number: this.invoiceNumber(),
          patientId: consultation.patientId,
          issuedById: user.id,
          status: InvoiceStatus.DRAFT,
          total: service.price,
          notes: `${referralMarker} — hospitalisation demandée. Admission sans paiement préalable; facture à finaliser et régler à la sortie.`,
          items: {
            create: {
              description: service.name,
              quantity: 1,
              unitPrice: service.price,
              total: service.price,
            },
          },
        },
      });

      const authorization = await transaction.careAuthorization.create({
        data: {
          patientId: consultation.patientId,
          invoiceId: invoice.id,
          serviceId: service.id,
          createdById: user.id,
          type: BillableServiceType.HOSPITALIZATION,
          description: `${service.name} — admission demandée par le médecin`,
          amount: service.price,
          status: CareAuthorizationStatus.AUTHORIZED,
          authorizedAt: now,
        },
        include: { patient: true, service: true, invoice: { include: { items: true } } },
      });

      await transaction.consultation.update({
        where: { id: consultationId },
        data: {
          status: ConsultationStatus.COMPLETED,
          completedAt: now,
          orientation:
            'Hospitalisation demandée — admission à organiser par la réception et les infirmiers; facture à régler à la sortie',
        },
      });

      if (consultation.appointmentId) {
        await transaction.appointment.update({
          where: { id: consultation.appointmentId },
          data: {
            journeyStage: PatientJourneyStage.HOSPITALIZATION,
            journeyUpdatedAt: now,
          },
        });
      }

      await transaction.nursingCare.create({
        data: {
          patientId: consultation.patientId,
          consultationId,
          orderedById: user.id,
          type: NursingCareType.OTHER,
          status: NursingCareStatus.ORDERED,
          label: "Préparer l'admission en hospitalisation",
          instructions:
            "Contacter la réception, préparer le patient, vérifier les constantes et accompagner l'affectation en chambre.",
          scheduledAt: now,
        },
      });

      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          id: { not: user.id },
          OR: [
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
      const patientName = [
        consultation.patient.lastName,
        consultation.patient.postName,
        consultation.patient.firstName,
      ]
        .filter(Boolean)
        .join(' ');
      if (recipients.length) {
        await transaction.message.createMany({
          data: recipients.map((recipient) => ({
            senderId: user.id,
            receiverId: recipient.id,
            content: `Hospitalisation demandée : ${patientName} (${consultation.patient.medicalRecordNumber}). La réception et l'équipe infirmière doivent attribuer un lit et organiser l'admission. Aucun paiement préalable : la facture du séjour sera finalisée à la sortie. Le médecin demandeur est maintenant disponible pour un autre patient.`,
          })),
        });
      }

      return authorization;
    });
  }

  private async finalizeMedicalReferral(
    consultationId: string,
    appointmentId: string | null,
    now: Date,
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const currentExams = await transaction.examRequest.findMany({
        where: { consultationId },
        select: { status: true },
      });
      assertLaboratoryResultsComplete(currentExams, 'Hospitalisation indisponible');

      await transaction.consultation.update({
        where: { id: consultationId },
        data: {
          status: ConsultationStatus.COMPLETED,
          completedAt: now,
          orientation:
            'Hospitalisation demandée — admission à organiser par la réception et les infirmiers; facture à régler à la sortie',
        },
      });
      if (appointmentId) {
        await transaction.appointment.update({
          where: { id: appointmentId },
          data: {
            journeyStage: PatientJourneyStage.HOSPITALIZATION,
            journeyUpdatedAt: now,
          },
        });
      }
    });
  }

  private invoiceNumber() {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    return `FAC-${new Date().getFullYear()}-${suffix}`;
  }
}
