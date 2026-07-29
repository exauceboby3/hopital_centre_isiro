import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillableServiceType,
  CareAuthorizationStatus,
  ClinicalOrderStatus,
  InsuranceCoverageStatus,
  InteractionSeverity,
  InventoryStatus,
  InvoiceStatus,
  JournalEntryStatus,
  PaymentPayer,
  PayrollEntryStatus,
  PayrollPeriodStatus,
  Prisma,
  PrescriptionStatus,
  RadiologyStudyStatus,
  SpecialtyCaseStatus,
  StockMovementType,
  UtilityBillStatus,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AllocateInsuranceDto,
  CreateDrugInteractionDto,
  CreateJournalEntryDto,
  CreateLedgerAccountDto,
  CreateMedicationBatchDto,
  CreatePayrollPeriodDto,
  CreatePrescriptionDto,
  CreateRadiologyStudyDto,
  CreateShiftDto,
  CreateSpecialtyCaseDto,
  CreateUtilityBillDto,
  DispensePrescriptionDto,
  ReconcileInventoryDto,
  RegisterDicomInstanceDto,
  UpdateCoverageDto,
  UpdateJournalEntryDto,
  UpdatePacsConfigurationDto,
  UpdatePayrollEntryDto,
  UpdatePayrollPeriodDto,
  UpdateRadiologyStudyDto,
  UpdateShiftDto,
  UpdateSpecialtyCaseDto,
  UpdateUtilityBillDto,
  UpsertAttendanceDto,
} from './dto/enterprise.dto';
import {
  calculateInsuranceSplit,
  calculateNetSalary,
  canTransitionSpecialtyCase,
  isBalancedJournal,
} from './enterprise.rules';

const prescriptionInclude = {
  patient: true,
  prescribedBy: { select: { id: true, username: true, role: true } },
  consultation: true,
  invoice: {
    include: {
      payments: true,
      insuranceCoverage: { include: { patientInsurance: { include: { provider: true } } } },
    },
  },
  items: { include: { medication: true } },
} satisfies Prisma.PrescriptionInclude;

@Injectable()
export class EnterpriseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
  ) {}

  insuranceCoverages() {
    return this.prisma.insuranceCoverage.findMany({
      include: {
        invoice: { include: { patient: true, payments: true } },
        patientInsurance: { include: { provider: true, patient: true } },
        createdBy: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async insuranceCoverage(id: string) {
    const coverage = await this.prisma.insuranceCoverage.findUnique({
      where: { id },
      include: {
        invoice: { include: { patient: true, payments: true } },
        patientInsurance: { include: { provider: true, patient: true } },
        createdBy: { select: { username: true } },
      },
    });
    if (!coverage) throw new NotFoundException('Répartition assurance introuvable.');
    return coverage;
  }

  async allocateInsurance(dto: AllocateInsuranceDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const [invoice, policy] = await Promise.all([
        transaction.invoice.findUnique({
          where: { id: dto.invoiceId },
          include: { payments: true, insuranceCoverage: true },
        }),
        transaction.patientInsurance.findUnique({
          where: { id: dto.patientInsuranceId },
          include: { provider: true },
        }),
      ]);
      if (!invoice || !policy || !policy.isActive) {
        throw new NotFoundException('Facture ou police active introuvable.');
      }
      if (invoice.insuranceCoverage) {
        throw new BadRequestException('Cette facture possède déjà une répartition assurance.');
      }
      if (invoice.patientId !== policy.patientId) {
        throw new BadRequestException('La police ne correspond pas au patient facturé.');
      }
      const now = new Date();
      if (
        (policy.validFrom && policy.validFrom > now) ||
        (policy.validUntil && policy.validUntil < now)
      ) {
        throw new BadRequestException("La police d'assurance n'est pas valide à cette date.");
      }
      const split = calculateInsuranceSplit(Number(invoice.total), Number(policy.coveragePercent));
      const status = dto.guaranteeReference
        ? InsuranceCoverageStatus.GUARANTEED
        : InsuranceCoverageStatus.DRAFT;
      const coverage = await transaction.insuranceCoverage.create({
        data: {
          invoiceId: invoice.id,
          patientInsuranceId: policy.id,
          createdById: userId,
          status,
          coveragePercent: new Prisma.Decimal(split.coveragePercent),
          grossAmount: invoice.total,
          patientAmount: new Prisma.Decimal(split.patientAmount),
          insurerAmount: new Prisma.Decimal(split.insurerAmount),
          guaranteeReference: dto.guaranteeReference,
          approvedAt: status === InsuranceCoverageStatus.GUARANTEED ? now : undefined,
          notes: dto.notes,
        },
      });
      const patientPaid = invoice.payments
        .filter((payment) => payment.payerType === PaymentPayer.PATIENT)
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      if (status === InsuranceCoverageStatus.GUARANTEED && patientPaid >= split.patientAmount) {
        await transaction.careAuthorization.updateMany({
          where: { invoiceId: invoice.id, status: CareAuthorizationStatus.PENDING },
          data: { status: CareAuthorizationStatus.AUTHORIZED, authorizedAt: now },
        });
      }
      return transaction.insuranceCoverage.findUniqueOrThrow({
        where: { id: coverage.id },
        include: {
          invoice: { include: { patient: true, payments: true } },
          patientInsurance: { include: { provider: true } },
        },
      });
    });
  }

  async updateCoverage(id: string, dto: UpdateCoverageDto) {
    const coverage = await this.prisma.insuranceCoverage.findUnique({
      where: { id },
      include: { invoice: { include: { payments: true } } },
    });
    if (!coverage) throw new NotFoundException('Répartition assurance introuvable.');
    if (
      dto.status === InsuranceCoverageStatus.GUARANTEED &&
      !(dto.guaranteeReference ?? coverage.guaranteeReference)
    ) {
      throw new BadRequestException('Une référence de garantie est obligatoire.');
    }
    if (dto.status === InsuranceCoverageStatus.SETTLED) {
      const insurerPaid = coverage.invoice.payments
        .filter((payment) => payment.payerType === PaymentPayer.INSURER)
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      if (insurerPaid < Number(coverage.insurerAmount)) {
        throw new BadRequestException('La part assureur doit être encaissée avant le règlement.');
      }
    }
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.insuranceCoverage.update({
        where: { id },
        data: {
          status: dto.status,
          guaranteeReference: dto.guaranteeReference,
          notes: dto.notes,
          approvedAt: dto.status === InsuranceCoverageStatus.GUARANTEED ? new Date() : undefined,
          settledAt: dto.status === InsuranceCoverageStatus.SETTLED ? new Date() : undefined,
        },
      });
      const patientPaid = coverage.invoice.payments
        .filter((payment) => payment.payerType === PaymentPayer.PATIENT)
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      if (
        dto.status === InsuranceCoverageStatus.GUARANTEED &&
        patientPaid >= Number(coverage.patientAmount)
      ) {
        await transaction.careAuthorization.updateMany({
          where: { invoiceId: coverage.invoiceId, status: CareAuthorizationStatus.PENDING },
          data: { status: CareAuthorizationStatus.AUTHORIZED, authorizedAt: new Date() },
        });
      }
      if (
        dto.status === InsuranceCoverageStatus.REJECTED ||
        dto.status === InsuranceCoverageStatus.CANCELLED
      ) {
        await transaction.careAuthorization.updateMany({
          where: { invoiceId: coverage.invoiceId, status: CareAuthorizationStatus.AUTHORIZED },
          data: { status: CareAuthorizationStatus.PENDING, authorizedAt: null },
        });
      }
      return updated;
    });
  }

  prescriptions() {
    return this.prisma.prescription.findMany({
      include: prescriptionInclude,
      orderBy: { prescribedAt: 'desc' },
      take: 300,
    });
  }

  async prescription(id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: prescriptionInclude,
    });
    if (!prescription) throw new NotFoundException('Ordonnance introuvable.');
    return prescription;
  }

  drugInteractions() {
    return this.prisma.drugInteraction.findMany({
      where: { isActive: true },
      include: { medicationA: true, medicationB: true },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createDrugInteraction(dto: CreateDrugInteractionDto) {
    if (dto.medicationAId === dto.medicationBId) {
      throw new BadRequestException('Sélectionnez deux médicaments différents.');
    }
    const medicationAId =
      dto.medicationAId < dto.medicationBId ? dto.medicationAId : dto.medicationBId;
    const medicationBId =
      dto.medicationAId < dto.medicationBId ? dto.medicationBId : dto.medicationAId;
    return this.prisma.drugInteraction.create({
      data: { ...dto, medicationAId, medicationBId },
      include: { medicationA: true, medicationB: true },
    });
  }

  async createPrescription(dto: CreatePrescriptionDto, userId: string) {
    const medicationIds = [...new Set(dto.items.map((item) => item.medicationId))];
    if (medicationIds.length !== dto.items.length) {
      throw new BadRequestException('Un médicament ne peut apparaître qu’une fois par ordonnance.');
    }
    const [patient, consultation, medications, interactions] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: dto.patientId } }),
      dto.consultationId
        ? this.prisma.consultation.findUnique({ where: { id: dto.consultationId } })
        : null,
      this.prisma.medication.findMany({ where: { id: { in: medicationIds }, isActive: true } }),
      this.prisma.drugInteraction.findMany({
        where: {
          isActive: true,
          medicationAId: { in: medicationIds },
          medicationBId: { in: medicationIds },
        },
        include: { medicationA: true, medicationB: true },
      }),
    ]);
    if (!patient || medications.length !== medicationIds.length) {
      throw new NotFoundException('Patient ou médicament introuvable.');
    }
    if (consultation && consultation.patientId !== dto.patientId) {
      throw new BadRequestException('La consultation appartient à un autre patient.');
    }
    const blockers = interactions.filter(
      (interaction) => interaction.severity === InteractionSeverity.CONTRAINDICATED,
    );
    if (blockers.length && !dto.interactionOverrideReason) {
      throw new BadRequestException(
        `Interaction contre-indiquée : ${blockers.map((item) => `${item.medicationA.name} + ${item.medicationB.name}`).join(', ')}. Un motif médical est obligatoire.`,
      );
    }
    const byId = new Map(medications.map((medication) => [medication.id, medication]));
    const unavailable = dto.items.filter((item) => {
      const medication = byId.get(item.medicationId)!;
      return medication.stockQuantity < item.quantity || medication.unitPrice.lessThanOrEqualTo(0);
    });
    if (unavailable.length) {
      throw new BadRequestException(
        `Médicament non disponible ou non tarifé à la pharmacie : ${unavailable
          .map((item) => byId.get(item.medicationId)!.name)
          .join(
            ', ',
          )}. Inscrivez-le dans les médicaments externes de la consultation afin que le patient puisse l’acheter ailleurs.`,
      );
    }
    const total = dto.items.reduce(
      (sum, item) => sum + Number(byId.get(item.medicationId)!.unitPrice) * item.quantity,
      0,
    );
    return this.prisma.$transaction(async (transaction) => {
      const invoice = await transaction.invoice.create({
        data: {
          number: this.number('FAC'),
          patientId: dto.patientId,
          issuedById: userId,
          status: total > 0 ? InvoiceStatus.PENDING : InvoiceStatus.PAID,
          total: new Prisma.Decimal(total),
          notes: 'Ordonnance structurée — paiement avant délivrance',
          items: {
            create: dto.items.map((item) => {
              const medication = byId.get(item.medicationId)!;
              const lineTotal = Number(medication.unitPrice) * item.quantity;
              return {
                description: `${medication.name} ${medication.strength ?? ''}`.trim(),
                quantity: item.quantity,
                unitPrice: medication.unitPrice,
                total: new Prisma.Decimal(lineTotal),
              };
            }),
          },
        },
      });
      return transaction.prescription.create({
        data: {
          number: this.number('ORD'),
          patientId: dto.patientId,
          consultationId: dto.consultationId,
          invoiceId: invoice.id,
          prescribedById: userId,
          diagnosis: dto.diagnosis,
          generalInstructions: dto.generalInstructions,
          interactionWarnings: {
            interactions: interactions.map((item) => ({
              severity: item.severity,
              medicines: [item.medicationA.name, item.medicationB.name],
              description: item.description,
              recommendation: item.recommendation,
            })),
            overrideReason: dto.interactionOverrideReason,
          },
          items: { create: dto.items },
        },
        include: prescriptionInclude,
      });
    });
  }

  async dispensePrescription(id: string, dto: DispensePrescriptionDto, userId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: prescriptionInclude,
    });
    if (!prescription) throw new NotFoundException('Ordonnance introuvable.');
    if (
      prescription.status !== PrescriptionStatus.ACTIVE &&
      prescription.status !== PrescriptionStatus.PARTIALLY_DISPENSED
    ) {
      throw new BadRequestException('Cette ordonnance ne peut plus être délivrée.');
    }
    if (!this.invoiceIsCleared(prescription.invoice)) {
      throw new BadRequestException(
        'La part patient doit être payée et la garantie assureur validée avant délivrance.',
      );
    }
    return this.prisma.$transaction(
      async (transaction) => {
        for (const item of prescription.items) {
          let remaining = item.quantity - item.dispensedQuantity;
          if (remaining <= 0) continue;
          const batches = await transaction.medicationBatch.findMany({
            where: {
              medicationId: item.medicationId,
              quantity: { gt: 0 },
              expiresAt: { gt: new Date() },
              isQuarantined: false,
            },
            orderBy: { expiresAt: 'asc' },
          });
          if (batches.reduce((sum, batch) => sum + batch.quantity, 0) < remaining) {
            throw new BadRequestException(
              `Lots valides insuffisants pour ${item.medication.name} (${remaining} requis).`,
            );
          }
          for (const batch of batches) {
            if (!remaining) break;
            const quantity = Math.min(batch.quantity, remaining);
            await transaction.medicationBatch.update({
              where: { id: batch.id },
              data: { quantity: { decrement: quantity } },
            });
            await transaction.stockMovement.create({
              data: {
                medicationId: item.medicationId,
                batchId: batch.id,
                userId,
                type: StockMovementType.EXIT,
                quantity,
                reason: `Ordonnance ${prescription.number}${dto.notes ? ` — ${dto.notes}` : ''}`,
                reference: prescription.invoice.number,
              },
            });
            remaining -= quantity;
          }
          await transaction.medication.update({
            where: { id: item.medicationId },
            data: { stockQuantity: { decrement: item.quantity - item.dispensedQuantity } },
          });
          await transaction.prescriptionItem.update({
            where: { id: item.id },
            data: { dispensedQuantity: item.quantity },
          });
        }
        return transaction.prescription.update({
          where: { id },
          data: { status: PrescriptionStatus.DISPENSED, dispensedAt: new Date() },
          include: prescriptionInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async medicationBatches() {
    await this.prisma.medicationBatch.updateMany({
      where: { expiresAt: { lte: new Date() }, isQuarantined: false },
      data: { isQuarantined: true },
    });
    return this.prisma.medicationBatch.findMany({
      include: { medication: true },
      orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'desc' }],
      take: 1000,
    });
  }

  createMedicationBatch(dto: CreateMedicationBatchDto, userId: string) {
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date()) throw new BadRequestException('Le lot est déjà expiré.');
    if (dto.manufacturedAt && new Date(dto.manufacturedAt) >= expiresAt) {
      throw new BadRequestException("La fabrication doit précéder l'expiration.");
    }
    return this.prisma.$transaction(async (transaction) => {
      const medication = await transaction.medication.findUnique({
        where: { id: dto.medicationId },
      });
      if (!medication) throw new NotFoundException('Médicament introuvable.');
      const batch = await transaction.medicationBatch.create({
        data: {
          ...dto,
          lotNumber: dto.lotNumber.trim().toUpperCase(),
          initialQuantity: dto.quantity,
          unitCost: dto.unitCost === undefined ? undefined : new Prisma.Decimal(dto.unitCost),
          manufacturedAt: dto.manufacturedAt ? new Date(dto.manufacturedAt) : undefined,
          expiresAt,
        },
        include: { medication: true },
      });
      await transaction.medication.update({
        where: { id: dto.medicationId },
        data: { stockQuantity: { increment: dto.quantity } },
      });
      await transaction.stockMovement.create({
        data: {
          medicationId: dto.medicationId,
          batchId: batch.id,
          userId,
          type: StockMovementType.ENTRY,
          quantity: dto.quantity,
          reason: `Réception lot ${batch.lotNumber}`,
          reference: batch.lotNumber,
        },
      });
      return batch;
    });
  }

  inventories() {
    return this.prisma.inventoryCount.findMany({
      include: { lines: { include: { medication: true } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  async inventory(id: string) {
    const inventory = await this.prisma.inventoryCount.findUnique({
      where: { id },
      include: {
        countedBy: { select: { username: true, role: true } },
        lines: { include: { medication: true } },
      },
    });
    if (!inventory) throw new NotFoundException('Inventaire physique introuvable.');
    return inventory;
  }

  reconcileInventory(dto: ReconcileInventoryDto, userId: string) {
    const ids = [...new Set(dto.lines.map((line) => line.medicationId))];
    if (ids.length !== dto.lines.length) throw new BadRequestException('Lignes en double.');
    return this.prisma.$transaction(
      async (transaction) => {
        const medications = await transaction.medication.findMany({ where: { id: { in: ids } } });
        if (medications.length !== ids.length)
          throw new NotFoundException('Médicament introuvable.');
        const byId = new Map(medications.map((item) => [item.id, item]));
        const inventory = await transaction.inventoryCount.create({
          data: {
            reference: this.number('INV'),
            countedById: userId,
            status: InventoryStatus.RECONCILED,
            notes: dto.notes,
            reconciledAt: new Date(),
            lines: {
              create: dto.lines.map((line) => {
                const expected = byId.get(line.medicationId)!.stockQuantity;
                return {
                  medicationId: line.medicationId,
                  expectedQuantity: expected,
                  countedQuantity: line.countedQuantity,
                  difference: line.countedQuantity - expected,
                };
              }),
            },
          },
        });
        for (const line of dto.lines) {
          const expected = byId.get(line.medicationId)!.stockQuantity;
          const difference = line.countedQuantity - expected;
          if (difference) {
            let batchDifference = difference;
            const candidateBatches = await transaction.medicationBatch.findMany({
              where: {
                medicationId: line.medicationId,
                ...(difference < 0 ? { quantity: { gt: 0 } } : {}),
              },
              orderBy: difference < 0 ? { expiresAt: 'asc' } : { expiresAt: 'desc' },
            });
            if (!candidateBatches.length) {
              throw new BadRequestException(
                'Aucun lot ne permet cet ajustement. Enregistrez d’abord un lot traçable.',
              );
            }
            for (const batch of candidateBatches) {
              if (!batchDifference) break;
              if (batchDifference > 0) {
                await transaction.medicationBatch.update({
                  where: { id: batch.id },
                  data: { quantity: { increment: batchDifference } },
                });
                batchDifference = 0;
              } else {
                const removed = Math.min(batch.quantity, Math.abs(batchDifference));
                await transaction.medicationBatch.update({
                  where: { id: batch.id },
                  data: { quantity: { decrement: removed } },
                });
                batchDifference += removed;
              }
            }
            if (batchDifference) {
              throw new BadRequestException(
                'Les lots enregistrés ne couvrent pas l’écart constaté.',
              );
            }
          }
          await transaction.medication.update({
            where: { id: line.medicationId },
            data: { stockQuantity: line.countedQuantity },
          });
          if (difference) {
            await transaction.stockMovement.create({
              data: {
                medicationId: line.medicationId,
                userId,
                type: StockMovementType.ADJUSTMENT,
                quantity: difference,
                reason: `Inventaire physique ${inventory.reference}`,
                reference: inventory.reference,
              },
            });
          }
        }
        return transaction.inventoryCount.findUniqueOrThrow({
          where: { id: inventory.id },
          include: { lines: { include: { medication: true } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  specialtyCases() {
    return this.prisma.specialtyCase.findMany({
      include: {
        patient: true,
        responsible: { select: { username: true, role: true } },
        clinicalOrder: {
          include: { service: true, careAuthorization: { include: { invoice: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async specialtyCase(id: string) {
    const specialty = await this.prisma.specialtyCase.findUnique({
      where: { id },
      include: {
        patient: true,
        responsible: { select: { username: true, role: true } },
        clinicalOrder: { include: { service: true } },
      },
    });
    if (!specialty) throw new NotFoundException('Dossier spécialisé introuvable.');
    return specialty;
  }

  async createSpecialtyCase(dto: CreateSpecialtyCaseDto, userId: string) {
    const specialty = dto.specialty as BillableServiceType;
    const order = await this.prisma.clinicalOrder.findUnique({
      where: { id: dto.clinicalOrderId },
      include: { careAuthorization: true, specialtyCase: true },
    });
    if (
      !order ||
      order.patientId !== dto.patientId ||
      order.type !== specialty ||
      order.specialtyCase ||
      !order.careAuthorization
    ) {
      throw new BadRequestException('L’acte tarifé ne correspond pas au dossier spécialisé.');
    }
    return this.prisma.specialtyCase.create({
      data: {
        ...dto,
        specialty,
        responsibleId: userId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        structuredData: dto.structuredData as Prisma.InputJsonValue,
        checklist: dto.checklist as Prisma.InputJsonValue | undefined,
      },
      include: { patient: true, clinicalOrder: { include: { service: true } } },
    });
  }

  async updateSpecialtyCase(id: string, dto: UpdateSpecialtyCaseDto, userId: string) {
    const current = await this.prisma.specialtyCase.findUnique({
      where: { id },
      include: { clinicalOrder: { include: { careAuthorization: true } } },
    });
    if (!current) throw new NotFoundException('Dossier spécialisé introuvable.');
    if (!canTransitionSpecialtyCase(current.status, dto.status)) {
      throw new BadRequestException(`Transition ${current.status} → ${dto.status} interdite.`);
    }
    if (
      (dto.status === SpecialtyCaseStatus.COMPLETED ||
        dto.status === SpecialtyCaseStatus.VALIDATED) &&
      !(dto.report ?? current.report)
    ) {
      throw new BadRequestException('Un compte rendu est obligatoire.');
    }
    return this.prisma.$transaction(async (transaction) => {
      if (dto.status === SpecialtyCaseStatus.IN_PROGRESS && current.clinicalOrder) {
        if (!current.clinicalOrder.careAuthorization) {
          throw new NotFoundException('Autorisation financière introuvable.');
        }
        await this.authorizations.consume(
          current.clinicalOrder.careAuthorization.id,
          current.patientId,
          current.specialty,
          { clinicalOrderId: current.clinicalOrder.id },
          transaction,
        );
      }
      if (current.clinicalOrder) {
        const mappedStatus: Partial<Record<SpecialtyCaseStatus, ClinicalOrderStatus>> = {
          IN_PROGRESS: ClinicalOrderStatus.IN_PROGRESS,
          COMPLETED: ClinicalOrderStatus.COMPLETED,
          VALIDATED: ClinicalOrderStatus.VALIDATED,
          CANCELLED: ClinicalOrderStatus.CANCELLED,
        };
        const orderStatus = mappedStatus[dto.status];
        if (orderStatus) {
          await transaction.clinicalOrder.update({
            where: { id: current.clinicalOrder.id },
            data: {
              status: orderStatus,
              performedById: userId,
              startedAt: dto.status === SpecialtyCaseStatus.IN_PROGRESS ? new Date() : undefined,
              completedAt: dto.status === SpecialtyCaseStatus.COMPLETED ? new Date() : undefined,
              validatedAt: dto.status === SpecialtyCaseStatus.VALIDATED ? new Date() : undefined,
              result: dto.report,
            },
          });
        }
      }
      return transaction.specialtyCase.update({
        where: { id },
        data: {
          status: dto.status,
          report: dto.report,
          structuredData: dto.structuredData as Prisma.InputJsonValue | undefined,
          checklist: dto.checklist as Prisma.InputJsonValue | undefined,
          startedAt: dto.status === SpecialtyCaseStatus.IN_PROGRESS ? new Date() : undefined,
          completedAt: dto.status === SpecialtyCaseStatus.COMPLETED ? new Date() : undefined,
        },
        include: { patient: true, clinicalOrder: { include: { service: true } } },
      });
    });
  }

  pacsConfiguration() {
    return this.prisma.pacsConfiguration.findUnique({ where: { id: 'main' } });
  }

  updatePacsConfiguration(dto: UpdatePacsConfigurationDto) {
    return this.prisma.pacsConfiguration.upsert({
      where: { id: 'main' },
      update: dto,
      create: { id: 'main', ...dto },
    });
  }

  radiologyStudies() {
    return this.prisma.radiologyStudy.findMany({
      include: {
        patient: true,
        performedBy: { select: { username: true } },
        clinicalOrder: {
          include: { service: true, careAuthorization: { include: { invoice: true } } },
        },
        instances: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async radiologyStudy(id: string) {
    const study = await this.prisma.radiologyStudy.findUnique({
      where: { id },
      include: {
        patient: true,
        performedBy: { select: { username: true } },
        clinicalOrder: { include: { service: true } },
        instances: true,
      },
    });
    if (!study) throw new NotFoundException('Étude radiologique introuvable.');
    return study;
  }

  async createRadiologyStudy(dto: CreateRadiologyStudyDto) {
    const order = await this.prisma.clinicalOrder.findUnique({
      where: { id: dto.clinicalOrderId },
      include: { radiologyStudy: true, careAuthorization: true },
    });
    if (
      !order ||
      order.patientId !== dto.patientId ||
      order.type !== BillableServiceType.RADIOLOGY ||
      order.radiologyStudy ||
      !order.careAuthorization
    ) {
      throw new BadRequestException('Un acte de radiologie facturé et disponible est obligatoire.');
    }
    return this.prisma.radiologyStudy.create({
      data: {
        ...dto,
        accessionNumber: this.number('RAD'),
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.scheduledAt ? RadiologyStudyStatus.SCHEDULED : RadiologyStudyStatus.ORDERED,
      },
      include: { patient: true, clinicalOrder: { include: { service: true } } },
    });
  }

  async updateRadiologyStudy(id: string, dto: UpdateRadiologyStudyDto, userId: string) {
    const study = await this.prisma.radiologyStudy.findUnique({
      where: { id },
      include: { clinicalOrder: { include: { careAuthorization: true } } },
    });
    if (!study) throw new NotFoundException('Étude radiologique introuvable.');
    if (dto.status === RadiologyStudyStatus.ACQUIRED) {
      if (!dto.studyInstanceUid) throw new BadRequestException('Study Instance UID obligatoire.');
      if (!study.clinicalOrder?.careAuthorization) {
        throw new NotFoundException('Autorisation financière introuvable.');
      }
    }
    if (
      (dto.status === RadiologyStudyStatus.REPORTED ||
        dto.status === RadiologyStudyStatus.VALIDATED) &&
      !(dto.report ?? study.report)
    ) {
      throw new BadRequestException('Le compte rendu radiologique est obligatoire.');
    }
    return this.prisma.$transaction(async (transaction) => {
      if (dto.status === RadiologyStudyStatus.ACQUIRED && study.clinicalOrder?.careAuthorization) {
        await this.authorizations.consume(
          study.clinicalOrder.careAuthorization.id,
          study.patientId,
          BillableServiceType.RADIOLOGY,
          { clinicalOrderId: study.clinicalOrder.id },
          transaction,
        );
        await transaction.clinicalOrder.update({
          where: { id: study.clinicalOrder.id },
          data: {
            status: ClinicalOrderStatus.IN_PROGRESS,
            performedById: userId,
            startedAt: new Date(),
          },
        });
      }
      if (study.clinicalOrder && dto.status === RadiologyStudyStatus.REPORTED) {
        await transaction.clinicalOrder.update({
          where: { id: study.clinicalOrder.id },
          data: {
            status: ClinicalOrderStatus.COMPLETED,
            performedById: userId,
            completedAt: new Date(),
            result: dto.report,
          },
        });
      }
      if (study.clinicalOrder && dto.status === RadiologyStudyStatus.VALIDATED) {
        await transaction.clinicalOrder.update({
          where: { id: study.clinicalOrder.id },
          data: {
            status: ClinicalOrderStatus.VALIDATED,
            validatedAt: new Date(),
            result: dto.report,
          },
        });
      }
      const pacs = await transaction.pacsConfiguration.findUnique({ where: { id: 'main' } });
      const studyUid = dto.studyInstanceUid ?? study.studyInstanceUid;
      return transaction.radiologyStudy.update({
        where: { id },
        data: {
          status: dto.status,
          studyInstanceUid: dto.studyInstanceUid,
          report: dto.report,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
          performedById:
            dto.status === RadiologyStudyStatus.ACQUIRED ||
            dto.status === RadiologyStudyStatus.REPORTED ||
            dto.status === RadiologyStudyStatus.VALIDATED
              ? userId
              : undefined,
          acquiredAt: dto.status === RadiologyStudyStatus.ACQUIRED ? new Date() : undefined,
          reportedAt: dto.status === RadiologyStudyStatus.REPORTED ? new Date() : undefined,
          validatedAt: dto.status === RadiologyStudyStatus.VALIDATED ? new Date() : undefined,
          pacsViewerUrl:
            pacs?.viewerUrl && studyUid
              ? `${pacs.viewerUrl.replace(/\/$/, '')}?StudyInstanceUIDs=${encodeURIComponent(studyUid)}`
              : undefined,
        },
        include: { patient: true, instances: true },
      });
    });
  }

  async registerDicomInstance(studyId: string, dto: RegisterDicomInstanceDto) {
    if (!(await this.prisma.radiologyStudy.count({ where: { id: studyId } }))) {
      throw new NotFoundException('Étude radiologique introuvable.');
    }
    return this.prisma.dicomInstance.create({
      data: {
        ...dto,
        studyId,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  shifts() {
    return this.prisma.staffShift.findMany({
      include: {
        employee: {
          select: {
            id: true,
            username: true,
            role: true,
            additionalRoles: true,
            staffProfile: true,
            doctorProfile: true,
          },
        },
      },
      orderBy: { startsAt: 'desc' },
      take: 500,
    });
  }

  async shift(id: string) {
    const shift = await this.prisma.staffShift.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            username: true,
            role: true,
            additionalRoles: true,
            staffProfile: true,
            doctorProfile: true,
          },
        },
      },
    });
    if (!shift) throw new NotFoundException('Garde introuvable.');
    return shift;
  }

  employees() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        role: true,
        staffProfile: true,
        doctorProfile: true,
        nurseProfile: true,
      },
      orderBy: { username: 'asc' },
    });
  }

  createShift(dto: CreateShiftDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('La fin doit suivre le début de garde.');
    return this.prisma.$transaction(async (transaction) => {
      const overlap = await transaction.staffShift.count({
        where: {
          employeeId: dto.employeeId,
          status: { not: 'CANCELLED' },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (overlap) throw new BadRequestException('Cette garde chevauche un planning existant.');
      return transaction.staffShift.create({
        data: { ...dto, startsAt, endsAt },
        include: { employee: { select: { username: true, role: true } } },
      });
    });
  }

  updateShift(id: string, dto: UpdateShiftDto) {
    return this.prisma.staffShift.update({ where: { id }, data: { status: dto.status } });
  }

  attendance(from?: string, to?: string) {
    return this.prisma.attendanceRecord.findMany({
      where:
        from || to
          ? {
              date: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {},
      include: {
        employee: { select: { id: true, username: true, role: true, staffProfile: true } },
      },
      orderBy: { date: 'desc' },
      take: 1000,
    });
  }

  async attendanceRecord(id: string) {
    const attendance = await this.prisma.attendanceRecord.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, username: true, role: true, staffProfile: true } },
      },
    });
    if (!attendance) throw new NotFoundException('Présence introuvable.');
    return attendance;
  }

  upsertAttendance(dto: UpsertAttendanceDto) {
    const date = new Date(dto.date);
    date.setUTCHours(0, 0, 0, 0);
    return this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
      update: {
        status: dto.status,
        clockIn: dto.clockIn ? new Date(dto.clockIn) : undefined,
        clockOut: dto.clockOut ? new Date(dto.clockOut) : undefined,
        minutesLate: dto.minutesLate ?? 0,
        notes: dto.notes,
      },
      create: {
        employeeId: dto.employeeId,
        date,
        status: dto.status,
        clockIn: dto.clockIn ? new Date(dto.clockIn) : undefined,
        clockOut: dto.clockOut ? new Date(dto.clockOut) : undefined,
        minutesLate: dto.minutesLate ?? 0,
        notes: dto.notes,
      },
      include: { employee: { select: { username: true, role: true } } },
    });
  }

  payrollPeriods() {
    return this.prisma.payrollPeriod.findMany({
      include: { entries: { include: { employee: { select: { username: true, role: true } } } } },
      orderBy: { startsOn: 'desc' },
      take: 100,
    });
  }

  async payrollPeriod(id: string) {
    const payroll = await this.prisma.payrollPeriod.findUnique({
      where: { id },
      include: { entries: { include: { employee: { select: { username: true, role: true } } } } },
    });
    if (!payroll) throw new NotFoundException('Période de paie introuvable.');
    return payroll;
  }

  createPayrollPeriod(dto: CreatePayrollPeriodDto) {
    const startsOn = new Date(dto.startsOn);
    const endsOn = new Date(dto.endsOn);
    if (endsOn < startsOn) throw new BadRequestException('Période de paie invalide.');
    const employees = new Set(dto.entries.map((entry) => entry.employeeId));
    if (employees.size !== dto.entries.length) throw new BadRequestException('Employé en double.');
    return this.prisma.payrollPeriod.create({
      data: {
        label: dto.label,
        startsOn,
        endsOn,
        status: PayrollPeriodStatus.CALCULATED,
        entries: {
          create: dto.entries.map((entry) => ({
            employeeId: entry.employeeId,
            baseSalary: new Prisma.Decimal(entry.baseSalary),
            allowances: new Prisma.Decimal(entry.allowances ?? 0),
            overtime: new Prisma.Decimal(entry.overtime ?? 0),
            deductions: new Prisma.Decimal(entry.deductions ?? 0),
            taxes: new Prisma.Decimal(entry.taxes ?? 0),
            netSalary: new Prisma.Decimal(calculateNetSalary(entry)),
          })),
        },
      },
      include: { entries: { include: { employee: { select: { username: true, role: true } } } } },
    });
  }

  async updatePayrollPeriod(id: string, dto: UpdatePayrollPeriodDto) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Période de paie introuvable.');
    const allowed: Partial<Record<PayrollPeriodStatus, PayrollPeriodStatus[]>> = {
      DRAFT: [PayrollPeriodStatus.CALCULATED, PayrollPeriodStatus.CANCELLED],
      CALCULATED: [PayrollPeriodStatus.APPROVED, PayrollPeriodStatus.CANCELLED],
      APPROVED: [PayrollPeriodStatus.PAID, PayrollPeriodStatus.CANCELLED],
    };
    if (period.status !== dto.status && !allowed[period.status]?.includes(dto.status)) {
      throw new BadRequestException(
        `Transition de paie ${period.status} → ${dto.status} interdite.`,
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      if (dto.status === PayrollPeriodStatus.APPROVED) {
        await transaction.payrollEntry.updateMany({
          where: { periodId: id, status: PayrollEntryStatus.DRAFT },
          data: { status: PayrollEntryStatus.APPROVED },
        });
      }
      if (dto.status === PayrollPeriodStatus.PAID) {
        await transaction.payrollEntry.updateMany({
          where: { periodId: id, status: PayrollEntryStatus.APPROVED },
          data: { status: PayrollEntryStatus.PAID, paidAt: new Date() },
        });
      }
      return transaction.payrollPeriod.update({
        where: { id },
        data: {
          status: dto.status,
          approvedAt: dto.status === PayrollPeriodStatus.APPROVED ? new Date() : undefined,
          paidAt: dto.status === PayrollPeriodStatus.PAID ? new Date() : undefined,
        },
        include: { entries: true },
      });
    });
  }

  updatePayrollEntry(id: string, dto: UpdatePayrollEntryDto) {
    return this.prisma.payrollEntry.update({
      where: { id },
      data: {
        status: dto.status,
        paymentReference: dto.paymentReference,
        paidAt: dto.status === PayrollEntryStatus.PAID ? new Date() : undefined,
      },
    });
  }

  ledgerAccounts() {
    return this.prisma.ledgerAccount.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  createLedgerAccount(dto: CreateLedgerAccountDto) {
    return this.prisma.ledgerAccount.create({
      data: { ...dto, code: dto.code.trim().toUpperCase(), name: dto.name.trim() },
    });
  }

  utilityBills() {
    return this.prisma.utilityBill.findMany({
      include: { createdBy: { select: { username: true } } },
      orderBy: [{ periodStart: 'desc' }, { type: 'asc' }],
      take: 240,
    });
  }

  async createUtilityBill(dto: CreateUtilityBillDto, userId: string) {
    try {
      return await this.prisma.utilityBill.create({
        data: {
          type: dto.type,
          periodStart: new Date(dto.periodStart),
          provider: dto.provider.trim(),
          reference: dto.reference?.trim(),
          amount: new Prisma.Decimal(dto.amount),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          notes: dto.notes?.trim(),
          createdById: userId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(
          'Cette charge existe déjà pour ce mois. Modifiez la ligne existante.',
        );
      }
      throw error;
    }
  }

  async updateUtilityBill(id: string, dto: UpdateUtilityBillDto) {
    const exists = await this.prisma.utilityBill.count({ where: { id } });
    if (!exists) throw new NotFoundException('Facture mensuelle introuvable.');
    return this.prisma.utilityBill.update({
      where: { id },
      data: {
        status: dto.status,
        paidAt: dto.status === UtilityBillStatus.PAID ? new Date() : null,
      },
    });
  }

  journalEntries() {
    return this.prisma.journalEntry.findMany({
      include: {
        createdBy: { select: { username: true } },
        lines: { include: { account: true } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  async journalEntry(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        createdBy: { select: { username: true } },
        lines: { include: { account: true } },
      },
    });
    if (!entry) throw new NotFoundException('Écriture comptable introuvable.');
    return entry;
  }

  createJournalEntry(dto: CreateJournalEntryDto, userId: string) {
    if (!isBalancedJournal(dto.lines)) {
      throw new BadRequestException(
        'Les débits et crédits doivent être égaux et supérieurs à zéro.',
      );
    }
    if (
      dto.lines.some((line) => (line.debit > 0 && line.credit > 0) || (!line.debit && !line.credit))
    ) {
      throw new BadRequestException('Chaque ligne doit contenir soit un débit, soit un crédit.');
    }
    return this.prisma.journalEntry.create({
      data: {
        number: this.number('ECR'),
        date: new Date(dto.date),
        description: dto.description,
        reference: dto.reference,
        createdById: userId,
        lines: {
          create: dto.lines.map((line) => ({
            accountId: line.accountId,
            description: line.description,
            debit: new Prisma.Decimal(line.debit),
            credit: new Prisma.Decimal(line.credit),
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
  }

  async updateJournalEntry(id: string, dto: UpdateJournalEntryDto) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Écriture comptable introuvable.');
    if (entry.status !== JournalEntryStatus.DRAFT || dto.status !== JournalEntryStatus.POSTED) {
      throw new BadRequestException('Seule une écriture brouillon peut être comptabilisée.');
    }
    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: JournalEntryStatus.POSTED, postedAt: new Date() },
    });
  }

  async enterpriseReport(from?: string, to?: string) {
    const range =
      from || to
        ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }
        : undefined;
    const [coverages, prescriptions, expiredBatches, specialties, radiology, attendance, payroll] =
      await Promise.all([
        this.prisma.insuranceCoverage.aggregate({
          where: range ? { createdAt: range } : {},
          _sum: { insurerAmount: true, patientAmount: true },
          _count: true,
        }),
        this.prisma.prescription.count({ where: range ? { prescribedAt: range } : {} }),
        this.prisma.medicationBatch.count({
          where: { expiresAt: { lte: new Date() }, quantity: { gt: 0 } },
        }),
        this.prisma.specialtyCase.count({ where: range ? { createdAt: range } : {} }),
        this.prisma.radiologyStudy.count({ where: range ? { createdAt: range } : {} }),
        this.prisma.attendanceRecord.groupBy({
          by: ['status'],
          where: range ? { date: range } : {},
          _count: true,
        }),
        this.prisma.payrollEntry.aggregate({
          where: { period: range ? { startsOn: range } : {} },
          _sum: { netSalary: true },
          _count: true,
        }),
      ]);
    const trialBalance = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { status: JournalEntryStatus.POSTED, ...(range ? { date: range } : {}) } },
      _sum: { debit: true, credit: true },
    });
    return {
      insurance: {
        count: coverages._count,
        insurerAmount: Number(coverages._sum.insurerAmount ?? 0),
        patientAmount: Number(coverages._sum.patientAmount ?? 0),
      },
      prescriptions,
      expiredBatches,
      specialtyCases: specialties,
      radiologyStudies: radiology,
      attendance,
      payroll: { entries: payroll._count, netTotal: Number(payroll._sum.netSalary ?? 0) },
      accounting: {
        debit: trialBalance.reduce((sum, row) => sum + Number(row._sum.debit ?? 0), 0),
        credit: trialBalance.reduce((sum, row) => sum + Number(row._sum.credit ?? 0), 0),
      },
    };
  }

  private invoiceIsCleared(invoice: {
    status: InvoiceStatus;
    payments: Array<{ amount: Prisma.Decimal; payerType: PaymentPayer }>;
    insuranceCoverage: {
      status: InsuranceCoverageStatus;
      patientAmount: Prisma.Decimal;
    } | null;
  }) {
    if (invoice.status === InvoiceStatus.PAID) return true;
    const coverage = invoice.insuranceCoverage;
    if (
      !coverage ||
      (coverage.status !== InsuranceCoverageStatus.GUARANTEED &&
        coverage.status !== InsuranceCoverageStatus.SETTLED)
    ) {
      return false;
    }
    const patientPaid = invoice.payments
      .filter((payment) => payment.payerType === PaymentPayer.PATIENT)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    return patientPaid >= Number(coverage.patientAmount);
  }

  private number(prefix: string) {
    return `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
