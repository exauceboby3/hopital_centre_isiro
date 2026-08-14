import { AppointmentStatus, ConsultationStatus, PatientJourneyStage, Role } from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { AuthenticatedUser } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppointmentsService,
  canCloseStaleCancelledConsultation,
  canOperationallyReassignBeforeReception,
  parseNewAppointmentDate,
} from './appointments.service';

describe('nettoyage des consultations après annulation', () => {
  it('ferme une consultation non commencée liée à un ancien rendez-vous annulé', () => {
    expect(
      canCloseStaleCancelledConsultation(
        {
          appointmentId: 'appointment-old',
          startedAt: null,
          appointment: { status: AppointmentStatus.CANCELLED },
        },
        'appointment-current',
      ),
    ).toBe(true);
  });

  it('ne ferme ni la consultation courante ni une consultation déjà commencée', () => {
    expect(
      canCloseStaleCancelledConsultation(
        {
          appointmentId: 'appointment-current',
          startedAt: null,
          appointment: { status: AppointmentStatus.CANCELLED },
        },
        'appointment-current',
      ),
    ).toBe(false);
    expect(
      canCloseStaleCancelledConsultation(
        {
          appointmentId: 'appointment-old',
          startedAt: new Date('2026-08-14T10:00:00.000Z'),
          appointment: { status: AppointmentStatus.CANCELLED },
        },
        'appointment-current',
      ),
    ).toBe(false);
  });
});

describe('parseNewAppointmentDate', () => {
  const now = new Date('2026-08-06T08:00:00.000Z');

  it('rejette une date invalide ou passée au-delà de la tolérance réseau', () => {
    expect(() => parseNewAppointmentDate('date-invalide', now)).toThrow(
      'La date du rendez-vous est invalide.',
    );
    expect(() => parseNewAppointmentDate('2026-08-06T07:57:59.999Z', now)).toThrow(
      'Un nouveau rendez-vous ne peut pas être programmé dans le passé.',
    );
  });

  it('accepte l’heure présente, le délai de transmission et une heure future', () => {
    expect(parseNewAppointmentDate(now.toISOString(), now)).toEqual(now);
    expect(parseNewAppointmentDate('2026-08-06T07:59:00.000Z', now)).toEqual(
      new Date('2026-08-06T07:59:00.000Z'),
    );
    expect(parseNewAppointmentDate('2026-08-06T08:15:00.000Z', now)).toEqual(
      new Date('2026-08-06T08:15:00.000Z'),
    );
  });
});

describe('réaffectation avant réception médicale', () => {
  const receptionist: AuthenticatedUser = {
    id: 'reception',
    username: 'reception',
    role: Role.RECEPTIONIST,
    additionalRoles: [],
  };

  it('autorise la réception avant que le médecin commence', () => {
    expect(
      canOperationallyReassignBeforeReception(
        { doctorAcknowledgedAt: null, consultation: { startedAt: null } },
        receptionist,
      ),
    ).toBe(true);
  });

  it('bloque la réception dès que le médecin a reçu le patient', () => {
    expect(
      canOperationallyReassignBeforeReception(
        {
          doctorAcknowledgedAt: new Date('2026-08-06T08:00:00.000Z'),
          consultation: { startedAt: new Date('2026-08-06T08:00:00.000Z') },
        },
        receptionist,
      ),
    ).toBe(false);
  });
});

const doctorUser = (id: string): AuthenticatedUser => ({
  id,
  username: id,
  role: Role.DOCTOR,
  additionalRoles: [],
});

const activeAppointment = (options?: {
  startedAt?: Date;
  doctorProfileId?: string;
  doctorUserId?: string;
  consultationStatus?: ConsultationStatus;
  certificate?: string | null;
}) => {
  const startedAt = options?.startedAt ?? new Date('2026-08-02T08:00:00.000Z');
  const doctorProfileId = options?.doctorProfileId ?? 'doctor-profile-a';
  const doctorUserId = options?.doctorUserId ?? 'doctor-user-a';
  const consultationStatus = options?.consultationStatus ?? ConsultationStatus.IN_PROGRESS;
  const certificate = options?.certificate ?? null;
  return {
    id: 'appointment-1',
    patientId: 'patient-1',
    doctorId: doctorProfileId,
    createdById: 'reception-user',
    scheduledAt: new Date('2026-08-02T07:30:00.000Z'),
    service: 'Consultation générale',
    reason: 'Fièvre',
    status: AppointmentStatus.CHECKED_IN,
    journeyStage: PatientJourneyStage.IN_CONSULTATION,
    journeyUpdatedAt: new Date('2026-08-02T08:00:00.000Z'),
    notes: 'Patient stable',
    createdAt: new Date('2026-08-02T07:00:00.000Z'),
    updatedAt: new Date('2026-08-02T08:00:00.000Z'),
    doctorAcknowledgedAt: startedAt,
    doctor: { id: doctorProfileId, userId: doctorUserId },
    patient: {
      id: 'patient-1',
      medicalRecordNumber: 'CHI-2026-000001',
      lastName: 'MALU',
      postName: null,
      firstName: 'Jean',
      vitalSigns: [],
    },
    consultation: {
      id: 'consultation-1',
      patientId: 'patient-1',
      doctorId: doctorProfileId,
      appointmentId: 'appointment-1',
      status: consultationStatus,
      reason: 'Fièvre',
      report: 'Rapport initial conservé',
      orientation: null,
      prescription: null,
      certificate,
      startedAt,
      completedAt: null,
      createdAt: new Date('2026-08-02T08:00:00.000Z'),
      updatedAt: new Date('2026-08-02T08:00:00.000Z'),
    },
  };
};

function createService(options?: {
  appointment?: ReturnType<typeof activeAppointment>;
  appointmentClaimCount?: number;
  consultationClaimCount?: number;
}) {
  const appointment = options?.appointment ?? activeAppointment();
  const notificationRow = {
    ...appointment,
    doctorId: 'doctor-profile-b',
    doctor: { id: 'doctor-profile-b', userId: 'doctor-user-b', user: { username: 'doctor-b' } },
    patient: { ...appointment.patient, vitalSigns: [] },
    createdBy: { id: 'reception-user', username: 'reception' },
    careAuthorization: null,
  };
  const resultRow = {
    ...notificationRow,
    consultation: appointment.consultation
      ? {
          ...appointment.consultation,
          doctorId: 'doctor-profile-b',
          status: ConsultationStatus.WAITING,
          examRequests: [],
        }
      : null,
  };
  type AppointmentClaimInput = {
    where: {
      id: string;
      doctorId: string;
      status: AppointmentStatus;
      journeyStage: { notIn: PatientJourneyStage[] };
    };
    data: Record<string, unknown>;
  };
  type ConsultationMoveInput = {
    where: Record<string, unknown>;
    data: {
      doctorId: string;
      status: ConsultationStatus;
      completedAt: null;
    };
  };
  type AuditInput = {
    data: {
      metadata: {
        fromDoctorId: string;
        toDoctorId: string;
        consultationId: string | null;
        consultationStartedAt: string | null;
      };
    };
  };
  const captures: {
    appointment?: AppointmentClaimInput;
    consultation?: ConsultationMoveInput;
    audit?: AuditInput;
  } = {};
  const appointmentFindUnique = jest.fn().mockResolvedValue(appointment);
  const appointmentUpdateMany = jest.fn<Promise<{ count: number }>, [AppointmentClaimInput]>(
    (input) => {
      captures.appointment = input;
      return Promise.resolve({ count: options?.appointmentClaimCount ?? 1 });
    },
  );
  const appointmentFindUniqueOrThrow = jest
    .fn()
    .mockResolvedValueOnce(notificationRow)
    .mockResolvedValueOnce(resultRow);
  const consultationUpdateMany = jest.fn<Promise<{ count: number }>, [ConsultationMoveInput]>(
    (input) => {
      captures.consultation = input;
      return Promise.resolve({ count: options?.consultationClaimCount ?? 1 });
    },
  );
  const auditCreate = jest.fn<Promise<{ id: string }>, [AuditInput]>((input) => {
    captures.audit = input;
    return Promise.resolve({ id: 'audit-1' });
  });
  const messageCreate = jest.fn().mockResolvedValue({ id: 'message-1' });
  const doctorFindFirst = jest.fn().mockResolvedValue({ id: 'doctor-profile-b' });
  const transaction = {
    appointment: {
      findUnique: appointmentFindUnique,
      updateMany: appointmentUpdateMany,
      findUniqueOrThrow: appointmentFindUniqueOrThrow,
    },
    consultation: { updateMany: consultationUpdateMany },
    doctorProfile: { findFirst: doctorFindFirst },
    auditLog: { create: auditCreate },
    message: { create: messageCreate },
  };
  const prisma = {
    $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  } as unknown as PrismaService;
  const service = new AppointmentsService(prisma, {} as FinancialAuthorizationService);
  return {
    service,
    appointmentUpdateMany,
    consultationUpdateMany,
    captures,
    messageCreate,
    doctorFindFirst,
  };
}

describe('AppointmentsService.transfer', () => {
  it('conserve le début et l’historique clinique lors d’un transfert après traitement commencé', async () => {
    const startedAt = new Date('2026-08-02T08:00:00.000Z');
    const { service, captures, messageCreate } = createService({
      appointment: activeAppointment({ startedAt }),
    });

    await service.transfer(
      'appointment-1',
      'doctor-profile-b',
      'Poursuite du traitement par un autre médecin',
      doctorUser('doctor-user-a'),
    );

    const appointmentPayload = captures.appointment;
    const consultationPayload = captures.consultation;
    const auditPayload = captures.audit;
    if (!appointmentPayload || !consultationPayload || !auditPayload) {
      throw new Error('Le transfert n’a pas exécuté toutes ses écritures.');
    }

    expect(appointmentPayload.where).toMatchObject({
      id: 'appointment-1',
      doctorId: 'doctor-profile-a',
      status: AppointmentStatus.CHECKED_IN,
    });
    expect(consultationPayload.data).toEqual({
      doctorId: 'doctor-profile-b',
      status: ConsultationStatus.WAITING,
      completedAt: null,
    });
    expect(consultationPayload.data).not.toHaveProperty('startedAt');
    expect(auditPayload.data.metadata).toMatchObject({
      fromDoctorId: 'doctor-profile-a',
      toDoctorId: 'doctor-profile-b',
      consultationId: 'consultation-1',
      consultationStartedAt: startedAt.toISOString(),
    });
    expect(messageCreate).toHaveBeenCalledTimes(1);
  });

  it('rejette un transfert concurrent lorsque l’affectation a déjà changé', async () => {
    const { service, consultationUpdateMany } = createService({ appointmentClaimCount: 0 });

    await expect(
      service.transfer(
        'appointment-1',
        'doctor-profile-b',
        'Transfert simultané vers un autre médecin',
        doctorUser('doctor-user-a'),
      ),
    ).rejects.toThrow('L’affectation du patient a changé');
    expect(consultationUpdateMany).not.toHaveBeenCalled();
  });

  it('rejette une consultation terminée ou signée', async () => {
    const appointment = activeAppointment({
      consultationStatus: ConsultationStatus.COMPLETED,
      certificate: '{"signedAt":"2026-08-02T09:00:00.000Z"}',
    });
    const { service, doctorFindFirst } = createService({ appointment });

    await expect(
      service.transfer(
        'appointment-1',
        'doctor-profile-b',
        'Transfert après clôture interdit',
        doctorUser('doctor-user-a'),
      ),
    ).rejects.toThrow('clôturée ou signée');
    expect(doctorFindFirst).not.toHaveBeenCalled();
  });

  it('rejette l’ancien médecin après une première réaffectation', async () => {
    const appointment = activeAppointment({
      doctorProfileId: 'doctor-profile-b',
      doctorUserId: 'doctor-user-b',
    });
    const { service, doctorFindFirst } = createService({ appointment });

    await expect(
      service.transfer(
        'appointment-1',
        'doctor-profile-a',
        'Tentative de reprise par l’ancien médecin',
        doctorUser('doctor-user-a'),
      ),
    ).rejects.toThrow('attribué à un autre médecin');
    expect(doctorFindFirst).not.toHaveBeenCalled();
  });
});
