import fs from 'node:fs';

function replaceOne(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: motif attendu une fois, trouvé ${count}`);
  }
  return text.replace(before, after);
}

function updateFile(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: aucune modification produite`);
  fs.writeFileSync(path, after);
}

updateFile('apps/api/src/consultations/consultations.service.ts', (source) => {
  let text = source;
  text = replaceOne(
    text,
    `import {
  assertLaboratoryResultsComplete,
  FINAL_CONSULTATION_DECISIONS,
} from './consultation-finalization.service';`,
    `import {
  assertCanSignConsultation,
  assertLaboratoryResultsComplete,
  FINAL_CONSULTATION_DECISIONS,
} from './consultation-finalization.service';`,
    'consultations import',
  );

  text = replaceOne(
    text,
    `  async update(id: string, dto: UpdateConsultationDto, user: AuthenticatedUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: { doctor: true },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    this.assertAssignedDoctor(consultation.doctor.userId, user);

    const signature = decodeMedicalSignature(consultation.certificate);
    if (signature && !dto.amendmentReason) {
      throw new ConflictException(
        'Ce dossier est signé. Une raison d’amendement est obligatoire pour toute correction.',
      );
    }

`,
    `  async update(id: string, dto: UpdateConsultationDto, user: AuthenticatedUser) {
`,
    'consultations update precheck',
  );

  text = replaceOne(text, `      status,
      orientation,`, `      orientation,`, 'consultations status destructure');

  text = replaceOne(
    text,
    `      const current = await transaction.consultation.findUniqueOrThrow({
        where: { id },
        include: {
          examRequests: { select: { status: true } },
          appointment: { select: { journeyStage: true } },
        },
      });
      const currentSections = decodeClinicalReport(current.report).sections;`,
    `      const current = await transaction.consultation.findUnique({
        where: { id },
        include: {
          doctor: { select: { userId: true } },
          examRequests: { select: { status: true } },
          appointment: { select: { journeyStage: true } },
        },
      });
      if (!current) throw new NotFoundException('Consultation introuvable.');
      this.assertAssignedDoctor(current.doctor.userId, user);
      if (decodeMedicalSignature(current.certificate)) {
        throw new ConflictException(
          'Ce dossier est signé et immuable. Créez une note clinique complémentaire au lieu de modifier le document signé.',
        );
      }
      if (current.status === ConsultationStatus.CANCELLED) {
        throw new ConflictException('Une consultation annulée ne peut plus être modifiée.');
      }
      const currentSections = decodeClinicalReport(current.report).sections;`,
    'consultations transactional load',
  );

  text = replaceOne(
    text,
    `      const effectiveStatus = this.resolveStatus(current.status, status, decision);`,
    `      const effectiveStatus = this.resolveStatus(current.status, decision);`,
    'consultations resolved status',
  );

  text = replaceOne(
    text,
    `      const updated = await transaction.consultation.update({
        where: { id },
        data: {
          report: clinicalReport,
          orientation: effectiveOrientation,
          prescription: prescription === undefined ? current.prescription : prescription,
          certificate: signature ? null : undefined,
          status: effectiveStatus,
          completedAt:
            effectiveStatus === ConsultationStatus.COMPLETED
              ? current.completedAt ?? new Date()
              : null,
        },
        include: consultationInclude,
      });`,
    `      const claimed = await transaction.consultation.updateMany({
        where: { id, certificate: null, updatedAt: current.updatedAt },
        data: {
          report: clinicalReport,
          orientation: effectiveOrientation,
          prescription: prescription === undefined ? current.prescription : prescription,
          status: effectiveStatus,
          completedAt:
            effectiveStatus === ConsultationStatus.COMPLETED
              ? current.completedAt ?? new Date()
              : null,
        },
      });
      if (!claimed.count) {
        throw new ConflictException(
          'La consultation a été modifiée ou signée pendant l’enregistrement. Rechargez le dossier.',
        );
      }
      const updated = await transaction.consultation.findUniqueOrThrow({
        where: { id },
        include: consultationInclude,
      });`,
    'consultations atomic update',
  );

  text = replaceOne(text, `      if (consultation.appointmentId) {`, `      if (current.appointmentId) {`, 'consultations appointment guard');
  text = replaceOne(text, `          where: { id: consultation.appointmentId },`, `          where: { id: current.appointmentId },`, 'consultations appointment id');

  text = replaceOne(
    text,
    `          action: signature ? 'CONSULTATION_AMENDED' : 'CONSULTATION_UPDATED',`,
    `          action: 'CONSULTATION_UPDATED',`,
    'consultations audit action',
  );

  text = replaceOne(
    text,
    `            amendmentReason: amendmentReason ?? null,
            ...(signature
              ? {
                  previousSignedReport: current.report,
                  previousSignature: current.certificate,
                }
              : {}),`,
    `            amendmentReason: amendmentReason ?? null,`,
    'consultations signed audit metadata',
  );

  const signStart = text.indexOf('  async sign(id: string, dto: SignConsultationDto, user: AuthenticatedUser) {');
  const vitalStart = text.indexOf('  async addVitalSign(', signStart);
  if (signStart < 0 || vitalStart < 0) throw new Error('consultations sign method boundaries');
  const signMethod = `  async sign(id: string, dto: SignConsultationDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (transaction) => {
        const consultation = await transaction.consultation.findUnique({
          where: { id },
          include: {
            doctor: true,
            examRequests: { select: { status: true } },
            prescriptions: { select: { id: true } },
          },
        });
        if (!consultation) throw new NotFoundException('Consultation introuvable.');
        this.assertAssignedDoctor(consultation.doctor.userId, user);
        if (decodeMedicalSignature(consultation.certificate)) {
          throw new ConflictException('Cette consultation est déjà signée.');
        }

        assertCanSignConsultation(consultation);
        const signedAt = new Date();
        const doctorName = [
          consultation.doctor.lastName,
          consultation.doctor.postName,
          consultation.doctor.firstName,
        ]
          .filter(Boolean)
          .join(' ');
        const signature = createMedicalSignature({
          doctorUserId: user.id,
          doctorName,
          licenseNumber: consultation.doctor.licenseNumber,
          signedAt,
          report: consultation.report ?? '',
        });

        const claimed = await transaction.consultation.updateMany({
          where: { id, certificate: null, updatedAt: consultation.updatedAt },
          data: {
            certificate: JSON.stringify({
              ...signature,
              confirmation: dto.confirmation?.trim() || undefined,
            }),
          },
        });
        if (!claimed.count) {
          throw new ConflictException(
            'La consultation a été modifiée pendant la signature. Rechargez le dossier et recommencez.',
          );
        }
        await transaction.auditLog.create({
          data: {
            userId: user.id,
            action: 'CONSULTATION_SIGNED',
            entity: 'Consultation',
            entityId: id,
            metadata: { signedAt: signature.signedAt, hash: signature.hash },
          },
        });
        const updated = await transaction.consultation.findUniqueOrThrow({
          where: { id },
          include: consultationInclude,
        });
        return this.present(updated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

`;
  text = text.slice(0, signStart) + signMethod + text.slice(vitalStart);

  const vitalEnd = text.indexOf('  private present(', text.indexOf('  async addVitalSign('));
  const vitalStart2 = text.indexOf('  async addVitalSign(');
  if (vitalStart2 < 0 || vitalEnd < 0) throw new Error('consultations vital method boundaries');
  const vitalMethod = `  async addVitalSign(consultationId: string, dto: CreateVitalSignDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const consultation = await transaction.consultation.findUnique({
        where: { id: consultationId },
        select: { patientId: true, status: true, certificate: true },
      });
      if (!consultation) throw new NotFoundException('Consultation introuvable.');
      if (
        consultation.status === ConsultationStatus.COMPLETED ||
        consultation.status === ConsultationStatus.CANCELLED ||
        decodeMedicalSignature(consultation.certificate)
      ) {
        throw new ConflictException(
          'Les constantes ne peuvent plus être ajoutées à une consultation clôturée ou signée.',
        );
      }
      const { respiratoryRate, bloodGlucoseMgDl, notes, ...vitals } = dto;
      const row = await transaction.vitalSign.create({
        data: {
          ...vitals,
          notes: encodeVitalSignMetadata({
            respiratoryRate,
            bloodGlucoseMgDl,
            clinicalNotes: notes,
          }),
          patientId: consultation.patientId,
          consultationId,
          recordedById: userId,
        },
      });
      return presentVitalSign(row);
    });
  }

`;
  text = text.slice(0, vitalStart2) + vitalMethod + text.slice(vitalEnd);

  text = replaceOne(
    text,
    `  private assertAssignedDoctor(assignedUserId: string, user: AuthenticatedUser) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN])) return;
`,
    `  private assertAssignedDoctor(assignedUserId: string, user: AuthenticatedUser) {
`,
    'consultations assigned doctor bypass',
  );

  text = replaceOne(
    text,
    `  private resolveStatus(
    current: ConsultationStatus,
    requested?: ConsultationStatus,
    decision?: ConsultationDecision,
  ) {`,
    `  private resolveStatus(current: ConsultationStatus, decision?: ConsultationDecision) {`,
    'consultations resolve status signature',
  );
  text = replaceOne(text, `    return requested ?? current;`, `    return current;`, 'consultations resolve status result');

  return text;
});

console.log('Surcharges Consultation appliquées.');
