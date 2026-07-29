import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillableServiceType, ExamStatus, Prisma, Role } from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { ClinicalGovernanceService } from '../clinical-governance/clinical-governance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddBiologistExamDto } from './dto/additional-exam.dto';
import { decodeLabTemplate } from './lab-template-envelope';

@Injectable()
export class BiologistAdditionalExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
    private readonly governance: ClinicalGovernanceService,
  ) {}

  async add(requestGroupId: string, dto: AddBiologistExamDto, userId: string) {
    const [group, service] = await Promise.all([
      this.prisma.examRequest.findMany({
        where: { requestGroupId },
        include: {
          patient: true,
          consultation: { select: { id: true, appointmentId: true } },
          requestedByDoctor: { select: { id: true, userId: true } },
          careAuthorization: { select: { serviceId: true } },
        },
        orderBy: { requestedAt: 'asc' },
      }),
      this.prisma.billableService.findUnique({ where: { id: dto.serviceId } }),
    ]);
    if (!group.length) throw new NotFoundException('Demande groupée de laboratoire introuvable.');
    if (!service || !service.isActive || service.type !== BillableServiceType.LABORATORY) {
      throw new NotFoundException('Examen complémentaire introuvable, inactif ou non facturable.');
    }
    if (group.some((exam) => exam.status === ExamStatus.CANCELLED)) {
      throw new BadRequestException(
        'Ajoutez l’examen sur une demande active qui n’est pas en cours d’annulation.',
      );
    }
    if (group.some((exam) => exam.careAuthorization?.serviceId === service.id)) {
      throw new ConflictException('Cet examen figure déjà dans la demande du patient.');
    }

    const first = group[0]!;
    const template = decodeLabTemplate(
      service.labResultTemplate,
      service.code,
      service.category,
    );
    return this.prisma.$transaction(async (transaction) => {
      const exam = await transaction.examRequest.create({
        data: {
          requestGroupId,
          patientId: first.patientId,
          consultationId: first.consultationId,
          requestedByDoctorId: first.requestedByDoctorId,
          type: service.name,
          observations: `Examen complémentaire ajouté par le biologiste (${dto.urgency}) : ${dto.reason.trim()}`,
          resultSchema: template.fields as unknown as Prisma.InputJsonValue,
          status: ExamStatus.REQUESTED,
        },
      });
      const authorization = await this.authorizations.createFromService(
        {
          patientId: first.patientId,
          serviceId: service.id,
          createdById: userId,
          expectedType: BillableServiceType.LABORATORY,
          examRequestId: exam.id,
        },
        transaction,
      );
      const decision = await this.governance.registerAdditionalExamDecision(transaction, {
        examRequestId: exam.id,
        requestGroupId,
        patientId: first.patientId,
        requestedById: userId,
        doctorUserId: first.requestedByDoctor.userId,
        price: Number(service.price),
        urgency: dto.urgency,
        reason: dto.reason.trim(),
      });

      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          id: { not: userId },
          OR: [
            { id: first.requestedByDoctor.userId },
            { role: { in: [Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.CASHIER] } },
            {
              additionalRoles: {
                hasSome: [Role.ADMIN, Role.RECEPTIONIST, Role.SECRETARY, Role.CASHIER],
              },
            },
          ],
        },
        select: { id: true },
      });
      const name = [first.patient.lastName, first.patient.postName, first.patient.firstName]
        .filter(Boolean)
        .join(' ');
      const decisionMessage =
        decision.status === 'PENDING_DOCTOR'
          ? 'L’examen est coûteux et attend la confirmation du médecin avant exécution.'
          : dto.urgency === 'ROUTINE'
            ? 'Le coût est inférieur au seuil de validation médicale : l’examen est autorisé après paiement.'
            : 'L’urgence biologique justifiée autorise l’examen après paiement, sans attendre une validation supplémentaire.';
      if (recipients.length) {
        await transaction.message.createMany({
          data: recipients.map((recipient) => ({
            senderId: userId,
            receiverId: recipient.id,
            content: `Examen complémentaire demandé par le biologiste : ${service.name} pour ${name} (${first.patient.medicalRecordNumber}). Urgence : ${dto.urgency}. Motif : ${dto.reason.trim()}. Facture ${authorization.invoice.number} créée. ${decisionMessage}`,
          })),
        });
      }

      await transaction.auditLog.create({
        data: {
          userId,
          action: 'LAB_ADDITIONAL_EXAM_REQUESTED',
          entity: 'ExamRequest',
          entityId: exam.id,
          metadata: {
            requestGroupId,
            serviceId: service.id,
            serviceName: service.name,
            patientId: first.patientId,
            reason: dto.reason.trim(),
            urgency: dto.urgency,
            price: Number(service.price),
            invoiceId: authorization.invoiceId,
            decisionId: decision.id,
            decisionStatus: decision.status,
            doctorApprovalThresholdCdf: decision.thresholdCdf,
          },
        },
      });

      const created = await transaction.examRequest.findUniqueOrThrow({
        where: { id: exam.id },
        include: {
          patient: true,
          requestedByDoctor: true,
          careAuthorization: { include: { service: true, invoice: true } },
        },
      });
      return { ...created, additionalExamDecision: decision };
    });
  }
}
