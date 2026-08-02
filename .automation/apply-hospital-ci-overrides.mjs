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

updateFile('apps/api/src/hospitalizations/hospitalizations.service.ts', (source) => {
  let text = source;
  text = replaceOne(
    text,
    `import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';`,
    `import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';`,
    'hospitalizations imports',
  );

  text = replaceOne(
    text,
    `    if (hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE])) {
      doctorId = (await this.prisma.doctorProfile.findUnique({ where: { userId: user.id } }))?.id;
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.authorizations.assertAuthorized(`,
    `    if (hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE])) {
      doctorId = (await this.prisma.doctorProfile.findUnique({ where: { userId: user.id } }))?.id;
      if (!doctorId) throw new ForbiddenException('Profil médical requis pour cette admission.');
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const active = await transaction.hospitalization.findFirst({
          where: { patientId: dto.patientId, status: HospitalizationStatus.ACTIVE },
          select: { id: true },
        });
        if (active) {
          throw new ConflictException('Ce patient possède déjà une hospitalisation active.');
        }
        if (doctorId) {
          const activeDoctor = await transaction.doctorProfile.findFirst({
            where: { id: doctorId, user: { isActive: true } },
            select: { id: true },
          });
          if (!activeDoctor) {
            throw new BadRequestException('Le médecin sélectionné est introuvable ou inactif.');
          }
        }

        await this.authorizations.assertAuthorized(`,
    'hospitalizations admit start',
  );

  text = replaceOne(
    text,
    `          status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },`,
    `          status: {
            in: [
              ConsultationStatus.WAITING,
              ConsultationStatus.IN_PROGRESS,
              ConsultationStatus.COMPLETED,
            ],
          },`,
    'hospitalizations referral statuses',
  );

  text = replaceOne(
    text,
    `      return transaction.hospitalization.findUniqueOrThrow({
        where: { id: hospitalization.id },
        include: hospitalizationInclude,
      });
    });
  }

  async medicalDischarge`,
    `      return transaction.hospitalization.findUniqueOrThrow({
        where: { id: hospitalization.id },
        include: hospitalizationInclude,
      });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async medicalDischarge`,
    'hospitalizations admit transaction end',
  );

  text = replaceOne(
    text,
    `      const updated = await transaction.hospitalization.update({
        where: { id },
        data: { status: HospitalizationStatus.DISCHARGED, dischargedAt },
      });`,
    `      const claimed = await transaction.hospitalization.updateMany({
        where: { id, status: HospitalizationStatus.ACTIVE },
        data: { status: HospitalizationStatus.DISCHARGED, dischargedAt },
      });
      if (!claimed.count) {
        throw new ConflictException(
          'Cette hospitalisation vient d’être clôturée par un autre utilisateur.',
        );
      }`,
    'hospitalizations administrative discharge claim',
  );

  text = replaceOne(
    text,
    `      return transaction.hospitalization.findUniqueOrThrow({
        where: { id: updated.id },
        include: hospitalizationInclude,
      });
    });
  }

  async transfer`,
    `      return transaction.hospitalization.findUniqueOrThrow({
        where: { id },
        include: hospitalizationInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async transfer`,
    'hospitalizations administrative discharge transaction',
  );

  text = replaceOne(
    text,
    `  async transfer(id: string, bedId: string) {
    return this.prisma.$transaction(async (transaction) => {`,
    `  async transfer(id: string, bedId: string) {
    return this.prisma.$transaction(
      async (transaction) => {`,
    'hospitalizations transfer start',
  );

  text = replaceOne(
    text,
    `      return transaction.hospitalization.findUniqueOrThrow({
        where: { id },
        include: hospitalizationInclude,
      });
    });
  }

  private billingPreview`,
    `      return transaction.hospitalization.findUniqueOrThrow({
        where: { id },
        include: hospitalizationInclude,
      });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private billingPreview`,
    'hospitalizations transfer transaction end',
  );

  return text;
});

updateFile('.github/workflows/ci.yml', (source) =>
  replaceOne(
    source,
    `      - name: Vérifier le code
        shell: bash`,
    `      - name: Vérifier les invariants sources
        run: npm run check:source

      - name: Vérifier le code
        shell: bash`,
    'ci source check',
  ).replace(
    `      - name: Conserver les diagnostics de compilation
        if: failure()`,
    `      - name: Simuler 20 parcours patients
        run: npm run test:workflows

      - name: Publier le rapport des 20 patients
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: rapport-20-patients
          path: artifacts/20-patient-workflow-report.json
          if-no-files-found: ignore
          retention-days: 7

      - name: Conserver les diagnostics de compilation
        if: failure()`,
  ),
);

console.log('Surcharges Hospitalisation et CI appliquées.');
