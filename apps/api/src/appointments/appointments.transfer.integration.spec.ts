import {
  AppointmentStatus,
  BillableServiceType,
  CareAuthorizationStatus,
  ConsultationStatus,
  InvoiceStatus,
  PatientJourneyStage,
  Role,
  Sex,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { AuthenticatedUser } from '../common/authenticated-user';
import { mergeClinicalReport } from '../consultations/clinical-report';
import { ConsultationsService } from '../consultations/consultations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const authenticatedDoctor = (id: string, username: string): AuthenticatedUser => ({
  id,
  username,
  role: Role.DOCTOR,
  additionalRoles: [],
});

describeWithDatabase('Transferts médicaux sur PostgreSQL', () => {
  jest.setTimeout(45_000);

  const prisma = new PrismaService();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const userIds = [] as string[];
  const patientIds = [] as string[];
  const appointmentIds = [] as string[];
  const consultationIds = [] as string[];
  const doctorProfiles = new Map<string, { id: string; user: AuthenticatedUser }>();
  let creatorId = '';
  let appointments: AppointmentsService;
  let consultations: ConsultationsService;

  const authorizationStub = {
    assertAuthorized: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue(undefined),
  } as unknown as FinancialAuthorizationService;

  async function createDoctor(label: string, active = true) {
    const username = `it-${label.toLowerCase()}-${suffix}`;
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: 'integration-test-only',
        role: Role.DOCTOR,
        isActive: active,
      },
    });
    userIds.push(user.id);
    const profile = await prisma.doctorProfile.create({
      data: {
        userId: user.id,
        lastName: label,
        firstName: 'Test',
        specialty: 'Médecine générale',
      },
    });
    const authenticated = authenticatedDoctor(user.id, username);
    doctorProfiles.set(label, { id: profile.id, user: authenticated });
    return { profile, user: authenticated };
  }

  async function createActiveEpisode(doctorLabel: string, index: number) {
    const doctor = doctorProfiles.get(doctorLabel);
    if (!doctor) throw new Error(`Médecin ${doctorLabel} absent.`);
    const patient = await prisma.patient.create({
      data: {
        medicalRecordNumber: `IT-${suffix}-${String(index).padStart(3, '0')}`,
        lastName: `PATIENT-${index}`,
        firstName: 'Intégration',
        sex: index % 2 === 0 ? Sex.FEMALE : Sex.MALE,
      },
    });
    patientIds.push(patient.id);
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        createdById: creatorId,
        scheduledAt: new Date(Date.now() + index * 60_000),
        service: 'Consultation générale',
        reason: `Cas de test ${index}`,
        status: AppointmentStatus.CHECKED_IN,
        journeyStage: PatientJourneyStage.IN_CONSULTATION,
        doctorAcknowledgedAt: new Date('2026-08-02T08:00:00.000Z'),
      },
    });
    appointmentIds.push(appointment.id);
    const startedAt = new Date(`2026-08-02T08:${String(index % 60).padStart(2, '0')}:00.000Z`);
    const report = mergeClinicalReport(null, {
      chiefComplaint: `Motif ${index}`,
      presentIllnessHistory: 'Traitement déjà commencé avant un éventuel transfert.',
      physicalExamination: 'Patient stable.',
      diagnosis: 'Diagnostic initial.',
      treatmentPlan: 'Traitement initial et surveillance.',
      decision: 'CONTINUE',
    });
    const consultation = await prisma.consultation.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        appointmentId: appointment.id,
        status: ConsultationStatus.IN_PROGRESS,
        reason: `Cas de test ${index}`,
        report,
        startedAt,
      },
    });
    consultationIds.push(consultation.id);
    const invoice = await prisma.invoice.create({
      data: {
        number: `IT-INV-${suffix}-${String(index).padStart(3, '0')}`,
        patientId: patient.id,
        issuedById: creatorId,
        status: InvoiceStatus.PAID,
        total: 0,
      },
    });
    await prisma.careAuthorization.create({
      data: {
        patientId: patient.id,
        invoiceId: invoice.id,
        appointmentId: appointment.id,
        consultationId: consultation.id,
        createdById: creatorId,
        type: BillableServiceType.CONSULTATION,
        description: 'Autorisation de test',
        amount: 0,
        status: CareAuthorizationStatus.CONSUMED,
        authorizedAt: new Date(),
        consumedAt: new Date(),
      },
    });
    return { patient, appointment, consultation, startedAt, report };
  }

  beforeAll(async () => {
    await prisma.$connect();
    const creator = await prisma.user.create({
      data: {
        username: `it-reception-${suffix}`,
        passwordHash: 'integration-test-only',
        role: Role.RECEPTIONIST,
      },
    });
    creatorId = creator.id;
    userIds.push(creator.id);
    await createDoctor('DOC-A');
    await createDoctor('DOC-B');
    await createDoctor('DOC-C');
    await createDoctor('DOC-INACTIVE', false);
    appointments = new AppointmentsService(prisma, authorizationStub);
    consultations = new ConsultationsService(prisma, authorizationStub);
  });

  afterAll(async () => {
    if (userIds.length) {
      await prisma.message.deleteMany({
        where: { OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }] },
      });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    }
    if (patientIds.length) {
      await prisma.careAuthorization.deleteMany({ where: { patientId: { in: patientIds } } });
      await prisma.examRequest.deleteMany({ where: { patientId: { in: patientIds } } });
      await prisma.consultation.deleteMany({ where: { patientId: { in: patientIds } } });
      await prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
      await prisma.invoice.deleteMany({ where: { patientId: { in: patientIds } } });
      await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    }
    if (userIds.length) {
      await prisma.doctorProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it('gère quatre patients par médecin et le transfert d’un traitement déjà commencé', async () => {
    const episodesA = await Promise.all(
      Array.from({ length: 4 }, (_, index) => createActiveEpisode('DOC-A', index + 1)),
    );
    await Promise.all(
      Array.from({ length: 4 }, (_, index) => createActiveEpisode('DOC-B', index + 11)),
    );

    const doctorA = doctorProfiles.get('DOC-A');
    const doctorB = doctorProfiles.get('DOC-B');
    const doctorC = doctorProfiles.get('DOC-C');
    if (!doctorA || !doctorB || !doctorC) throw new Error('Profils médecins absents.');

    await expect(
      prisma.consultation.count({
        where: {
          doctorId: doctorA.id,
          status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },
        },
      }),
    ).resolves.toBe(4);
    await expect(
      prisma.consultation.count({
        where: {
          doctorId: doctorB.id,
          status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },
        },
      }),
    ).resolves.toBe(4);

    const transferred = episodesA[0];
    if (!transferred) throw new Error('Épisode à transférer introuvable.');
    await appointments.transfer(
      transferred.appointment.id,
      doctorB.id,
      'Poursuite du traitement et second avis médical',
      doctorA.user,
    );

    const movedConsultation = await prisma.consultation.findUniqueOrThrow({
      where: { id: transferred.consultation.id },
    });
    expect(movedConsultation.doctorId).toBe(doctorB.id);
    expect(movedConsultation.status).toBe(ConsultationStatus.WAITING);
    expect(movedConsultation.startedAt?.toISOString()).toBe(transferred.startedAt.toISOString());
    expect(movedConsultation.report).toBe(transferred.report);
    await expect(
      prisma.consultation.count({
        where: {
          doctorId: doctorB.id,
          status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },
        },
      }),
    ).resolves.toBe(5);

    await expect(
      consultations.update(
        transferred.consultation.id,
        { diagnosis: 'Modification interdite par ancien médecin' },
        doctorA.user,
      ),
    ).rejects.toThrow('appartient à un autre médecin');

    await appointments.acknowledge(transferred.appointment.id, doctorB.user);
    const resumed = await prisma.consultation.findUniqueOrThrow({
      where: { id: transferred.consultation.id },
    });
    expect(resumed.status).toBe(ConsultationStatus.IN_PROGRESS);
    expect(resumed.startedAt?.toISOString()).toBe(transferred.startedAt.toISOString());

    await consultations.update(
      transferred.consultation.id,
      {
        diagnosis: 'Diagnostic confirmé par le médecin destinataire',
        treatmentPlan: 'Poursuivre le traitement et la surveillance',
        decision: 'CONTINUE',
      },
      doctorB.user,
    );
    await appointments.transfer(
      transferred.appointment.id,
      doctorC.id,
      'Troisième avis après reprise du traitement',
      doctorB.user,
    );

    const chained = await prisma.consultation.findUniqueOrThrow({
      where: { id: transferred.consultation.id },
    });
    expect(chained.id).toBe(transferred.consultation.id);
    expect(chained.doctorId).toBe(doctorC.id);
    expect(chained.startedAt?.toISOString()).toBe(transferred.startedAt.toISOString());
    await expect(
      consultations.update(
        transferred.consultation.id,
        { diagnosis: 'Modification interdite après deuxième transfert' },
        doctorB.user,
      ),
    ).rejects.toThrow('appartient à un autre médecin');
  });

  it('n’autorise qu’un seul gagnant lors de deux transferts simultanés', async () => {
    const episode = await createActiveEpisode('DOC-A', 30);
    const doctorA = doctorProfiles.get('DOC-A');
    const doctorB = doctorProfiles.get('DOC-B');
    const doctorC = doctorProfiles.get('DOC-C');
    if (!doctorA || !doctorB || !doctorC) throw new Error('Profils médecins absents.');

    const outcomes = await Promise.allSettled([
      appointments.transfer(
        episode.appointment.id,
        doctorB.id,
        'Premier transfert concurrent',
        doctorA.user,
      ),
      appointments.transfer(
        episode.appointment.id,
        doctorC.id,
        'Deuxième transfert concurrent',
        doctorA.user,
      ),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: episode.appointment.id } });
    expect([doctorB.id, doctorC.id]).toContain(stored.doctorId);
    await expect(
      prisma.auditLog.count({
        where: { action: 'PATIENT_TRANSFERRED', entityId: episode.appointment.id },
      }),
    ).resolves.toBe(1);
  });

  it('refuse les transferts vers le même médecin, un médecin inactif ou après clôture', async () => {
    const episode = await createActiveEpisode('DOC-A', 40);
    const doctorA = doctorProfiles.get('DOC-A');
    const doctorB = doctorProfiles.get('DOC-B');
    const inactive = doctorProfiles.get('DOC-INACTIVE');
    if (!doctorA || !doctorB || !inactive) throw new Error('Profils médecins absents.');

    await expect(
      appointments.transfer(
        episode.appointment.id,
        doctorA.id,
        'Même médecin non autorisé',
        doctorA.user,
      ),
    ).rejects.toThrow('déjà affecté');
    await expect(
      appointments.transfer(
        episode.appointment.id,
        inactive.id,
        'Médecin inactif non autorisé',
        doctorA.user,
      ),
    ).rejects.toThrow('introuvable ou inactif');

    await prisma.consultation.update({
      where: { id: episode.consultation.id },
      data: {
        status: ConsultationStatus.COMPLETED,
        completedAt: new Date(),
        certificate: '{"signedAt":"2026-08-02T10:00:00.000Z"}',
      },
    });
    await expect(
      appointments.transfer(
        episode.appointment.id,
        doctorB.id,
        'Transfert après signature interdit',
        doctorA.user,
      ),
    ).rejects.toThrow('clôturée ou signée');
  });
});
