import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  CareAuthorizationStatus,
  ConsultationStatus,
  PatientJourneyStage,
  Role,
} from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

@Injectable()
export class AppointmentAcknowledgementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
  ) {}

  async acknowledge(id: string, user: AuthenticatedUser) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        patientId: true,
        journeyStage: true,
        doctor: { select: { userId: true } },
        careAuthorization: { select: { status: true } },
        consultation: { select: { id: true, startedAt: true } },
      },
    });

    if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');

    const isLaboratoryReturn =
      appointment.journeyStage === PatientJourneyStage.RETURN_TO_DOCTOR &&
      appointment.careAuthorization?.status === CareAuthorizationStatus.CONSUMED;

    if (!isLaboratoryReturn) {
      return this.appointments.acknowledge(id, user);
    }

    const clinician = hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]);
    if (!clinician || appointment.doctor?.userId !== user.id) {
      throw new ForbiddenException('Ce patient est attribué à un autre médecin.');
    }
    if (appointment.status !== AppointmentStatus.CHECKED_IN) {
      throw new ForbiddenException("Ce patient n'est plus dans la file de retour médical.");
    }
    if (!appointment.consultation) {
      throw new ConflictException('La consultation liée au retour du laboratoire est introuvable.');
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.consultation.update({
        where: { id: appointment.consultation!.id },
        data: {
          status: ConsultationStatus.IN_PROGRESS,
          startedAt: appointment.consultation!.startedAt ?? new Date(),
          completedAt: null,
        },
      });

      const updated = await transaction.appointment.update({
        where: { id },
        data: {
          doctorAcknowledgedAt: new Date(),
          journeyStage: PatientJourneyStage.IN_CONSULTATION,
          journeyUpdatedAt: new Date(),
        },
        include: {
          patient: true,
          doctor: true,
          careAuthorization: { select: { status: true } },
          consultation: true,
        },
      });
      const authorizationStatus = updated.careAuthorization?.status;
      const inOrder =
        authorizationStatus === CareAuthorizationStatus.AUTHORIZED ||
        authorizationStatus === CareAuthorizationStatus.WAIVED ||
        authorizationStatus === CareAuthorizationStatus.CONSUMED;
      return {
        ...updated,
        careAuthorization: updated.careAuthorization
          ? {
              ...updated.careAuthorization,
              paymentClearance: {
                inOrder,
                status: inOrder ? 'IN_ORDER' : 'TO_REGULARIZE',
              },
            }
          : null,
      };
    });
  }
}
