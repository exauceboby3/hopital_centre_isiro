import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillableServiceType,
  BloodUnitStatus,
  CareAuthorizationStatus,
  ClinicalOrderStatus,
  InsuranceClaimStatus,
  InvoiceStatus,
  Prisma,
  PurchaseOrderStatus,
  StockMovementType,
  TransfusionStatus,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBloodUnitDto,
  CreateClinicalOrderDto,
  CreateInsuranceClaimDto,
  CreateInsuranceProviderDto,
  CreatePatientInsuranceDto,
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  CreateTransfusionDto,
  ListBloodUnitsDto,
  ListOperationsDto,
  UpdateClinicalOrderDto,
  UpdateInsuranceClaimDto,
  UpdateTransfusionDto,
} from './dto/operations.dto';
import {
  canTransitionClinicalOrder,
  canTransitionTransfusion,
  isConfigurableClinicalType,
} from './operations.rules';

const clinicalOrderInclude = {
  patient: true,
  service: true,
  requestedBy: { select: { id: true, username: true, role: true } },
  performedBy: { select: { id: true, username: true, role: true } },
  careAuthorization: { include: { invoice: { include: { payments: true } } } },
  bloodTransfusion: { select: { id: true } },
} satisfies Prisma.ClinicalOrderInclude;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
  ) {}

  clinicalOrders(filters: ListOperationsDto) {
    return this.prisma.clinicalOrder.findMany({
      where: {
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: clinicalOrderInclude,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async clinicalOrder(id: string) {
    const order = await this.prisma.clinicalOrder.findUnique({
      where: { id },
      include: clinicalOrderInclude,
    });
    if (!order) throw new NotFoundException('Acte clinique introuvable.');
    return order;
  }

  createClinicalOrder(dto: CreateClinicalOrderDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const service = await transaction.billableService.findUnique({
        where: { id: dto.serviceId },
      });
      if (!service || !service.isActive || !isConfigurableClinicalType(service.type)) {
        throw new BadRequestException(
          'Le service sélectionné ne correspond pas à un acte clinique configurable.',
        );
      }
      const order = await transaction.clinicalOrder.create({
        data: {
          patientId: dto.patientId,
          serviceId: dto.serviceId,
          requestedById: userId,
          type: service.type,
          priority: dto.priority ?? 'ROUTINE',
          clinicalIndication: dto.clinicalIndication,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          notes: dto.notes,
          status: dto.scheduledAt ? ClinicalOrderStatus.SCHEDULED : ClinicalOrderStatus.REQUESTED,
        },
      });
      await this.authorizations.createFromService(
        {
          patientId: dto.patientId,
          serviceId: dto.serviceId,
          createdById: userId,
          expectedType: service.type,
          clinicalOrderId: order.id,
        },
        transaction,
      );
      return transaction.clinicalOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: clinicalOrderInclude,
      });
    });
  }

  async updateClinicalOrder(id: string, dto: UpdateClinicalOrderDto, userId: string) {
    const current = await this.clinicalOrder(id);
    if (!canTransitionClinicalOrder(current.status, dto.status)) {
      throw new BadRequestException(`Transition ${current.status} → ${dto.status} interdite.`);
    }
    if (
      (dto.status === ClinicalOrderStatus.COMPLETED ||
        dto.status === ClinicalOrderStatus.VALIDATED) &&
      !(dto.result ?? current.result)
    ) {
      throw new BadRequestException('Un résultat ou compte rendu est obligatoire.');
    }
    return this.prisma.$transaction(async (transaction) => {
      if (dto.status === ClinicalOrderStatus.IN_PROGRESS) {
        if (!current.careAuthorization)
          throw new NotFoundException('Autorisation financière introuvable.');
        await this.authorizations.consume(
          current.careAuthorization.id,
          current.patientId,
          current.type,
          { clinicalOrderId: id },
          transaction,
        );
      }
      return transaction.clinicalOrder.update({
        where: { id },
        data: {
          status: dto.status,
          result: dto.result,
          notes: dto.notes,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          performedById:
            dto.status === ClinicalOrderStatus.IN_PROGRESS ||
            dto.status === ClinicalOrderStatus.COMPLETED ||
            dto.status === ClinicalOrderStatus.VALIDATED
              ? userId
              : undefined,
          startedAt: dto.status === ClinicalOrderStatus.IN_PROGRESS ? new Date() : undefined,
          completedAt: dto.status === ClinicalOrderStatus.COMPLETED ? new Date() : undefined,
          validatedAt: dto.status === ClinicalOrderStatus.VALIDATED ? new Date() : undefined,
        },
        include: clinicalOrderInclude,
      });
    });
  }

  async bloodUnits(filters: ListBloodUnitsDto) {
    await this.prisma.bloodUnit.updateMany({
      where: { expiresAt: { lt: new Date() }, status: BloodUnitStatus.AVAILABLE },
      data: { status: BloodUnitStatus.EXPIRED },
    });
    return this.prisma.bloodUnit.findMany({
      where: filters.status ? { status: filters.status } : {},
      orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
      take: 500,
    });
  }

  createBloodUnit(dto: CreateBloodUnitDto) {
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date(dto.collectedAt)) {
      throw new BadRequestException("La date d'expiration doit suivre le prélèvement.");
    }
    return this.prisma.bloodUnit.create({
      data: {
        ...dto,
        code: dto.code.trim().toUpperCase(),
        collectedAt: new Date(dto.collectedAt),
        expiresAt,
      },
    });
  }

  transfusions() {
    return this.prisma.bloodTransfusion.findMany({
      include: {
        patient: true,
        bloodUnit: true,
        clinicalOrder: {
          include: { careAuthorization: { include: { invoice: { include: { payments: true } } } } },
        },
        prescribedBy: { select: { username: true } },
        administeredBy: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async transfusion(id: string) {
    const transfusion = await this.prisma.bloodTransfusion.findUnique({
      where: { id },
      include: {
        patient: true,
        bloodUnit: true,
        clinicalOrder: {
          include: { careAuthorization: { include: { invoice: { include: { payments: true } } } } },
        },
        prescribedBy: { select: { username: true } },
        administeredBy: { select: { username: true } },
      },
    });
    if (!transfusion) throw new NotFoundException('Transfusion introuvable.');
    return transfusion;
  }

  createTransfusion(dto: CreateTransfusionDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const [patient, unit, clinicalOrder] = await Promise.all([
        transaction.patient.findUnique({ where: { id: dto.patientId } }),
        transaction.bloodUnit.findUnique({ where: { id: dto.bloodUnitId } }),
        transaction.clinicalOrder.findUnique({
          where: { id: dto.clinicalOrderId },
          include: { careAuthorization: true, bloodTransfusion: true },
        }),
      ]);
      if (!patient) throw new NotFoundException('Patient introuvable.');
      if (!unit || unit.status !== BloodUnitStatus.AVAILABLE || unit.expiresAt <= new Date()) {
        throw new BadRequestException('Cette poche de sang est indisponible ou expirée.');
      }
      if (
        !clinicalOrder ||
        clinicalOrder.patientId !== dto.patientId ||
        clinicalOrder.type !== BillableServiceType.BLOOD_BANK ||
        clinicalOrder.bloodTransfusion ||
        !clinicalOrder.careAuthorization ||
        (clinicalOrder.status !== ClinicalOrderStatus.REQUESTED &&
          clinicalOrder.status !== ClinicalOrderStatus.SCHEDULED &&
          clinicalOrder.status !== ClinicalOrderStatus.IN_PROGRESS)
      ) {
        throw new BadRequestException(
          'Un acte de transfusion facturé et disponible est obligatoire pour cette transfusion.',
        );
      }
      await transaction.bloodUnit.update({
        where: { id: unit.id },
        data: { status: BloodUnitStatus.RESERVED },
      });
      return transaction.bloodTransfusion.create({
        data: {
          ...dto,
          prescribedById: userId,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        },
        include: {
          patient: true,
          bloodUnit: true,
          clinicalOrder: { include: { careAuthorization: { include: { invoice: true } } } },
        },
      });
    });
  }

  async updateTransfusion(id: string, dto: UpdateTransfusionDto, userId: string) {
    const current = await this.prisma.bloodTransfusion.findUnique({
      where: { id },
      include: { clinicalOrder: { include: { careAuthorization: true } } },
    });
    if (!current) throw new NotFoundException('Transfusion introuvable.');
    if (!canTransitionTransfusion(current.status, dto.status)) {
      throw new BadRequestException(`Transition ${current.status} → ${dto.status} interdite.`);
    }
    return this.prisma.$transaction(async (transaction) => {
      if (dto.status === TransfusionStatus.IN_PROGRESS) {
        if (!current.clinicalOrder.careAuthorization) {
          throw new NotFoundException('Autorisation financière de transfusion introuvable.');
        }
        if (
          current.clinicalOrder.status === ClinicalOrderStatus.REQUESTED ||
          current.clinicalOrder.status === ClinicalOrderStatus.SCHEDULED
        ) {
          await this.authorizations.consume(
            current.clinicalOrder.careAuthorization.id,
            current.patientId,
            BillableServiceType.BLOOD_BANK,
            { clinicalOrderId: current.clinicalOrderId },
            transaction,
          );
          await transaction.clinicalOrder.update({
            where: { id: current.clinicalOrderId },
            data: {
              status: ClinicalOrderStatus.IN_PROGRESS,
              performedById: userId,
              startedAt: new Date(),
            },
          });
        } else if (
          current.clinicalOrder.status !== ClinicalOrderStatus.IN_PROGRESS ||
          current.clinicalOrder.careAuthorization.status !== CareAuthorizationStatus.CONSUMED
        ) {
          throw new BadRequestException(
            "L'acte de transfusion n'a pas d'autorisation financière consommée.",
          );
        }
      }
      if (dto.status === TransfusionStatus.CANCELLED) {
        await transaction.bloodUnit.update({
          where: { id: current.bloodUnitId },
          data: { status: BloodUnitStatus.AVAILABLE },
        });
        if (
          current.clinicalOrder.status !== ClinicalOrderStatus.COMPLETED &&
          current.clinicalOrder.status !== ClinicalOrderStatus.VALIDATED &&
          current.clinicalOrder.status !== ClinicalOrderStatus.CANCELLED
        ) {
          await transaction.clinicalOrder.update({
            where: { id: current.clinicalOrderId },
            data: { status: ClinicalOrderStatus.CANCELLED },
          });
        }
      }
      if (dto.status === TransfusionStatus.COMPLETED) {
        if (current.clinicalOrder.status !== ClinicalOrderStatus.IN_PROGRESS) {
          throw new BadRequestException("L'acte de transfusion doit être en cours.");
        }
        await transaction.bloodUnit.update({
          where: { id: current.bloodUnitId },
          data: { status: BloodUnitStatus.TRANSFUSED },
        });
        await transaction.clinicalOrder.update({
          where: { id: current.clinicalOrderId },
          data: {
            status: ClinicalOrderStatus.COMPLETED,
            performedById: userId,
            completedAt: new Date(),
            result: dto.reactionNotes?.trim()
              ? `Transfusion terminée. Observations : ${dto.reactionNotes.trim()}`
              : 'Transfusion terminée sans réaction documentée.',
          },
        });
      }
      return transaction.bloodTransfusion.update({
        where: { id },
        data: {
          status: dto.status,
          reactionNotes: dto.reactionNotes,
          administeredById:
            dto.status === TransfusionStatus.IN_PROGRESS ||
            dto.status === TransfusionStatus.COMPLETED
              ? userId
              : undefined,
          startedAt: dto.status === TransfusionStatus.IN_PROGRESS ? new Date() : undefined,
          completedAt: dto.status === TransfusionStatus.COMPLETED ? new Date() : undefined,
        },
        include: {
          patient: true,
          bloodUnit: true,
          clinicalOrder: { include: { careAuthorization: { include: { invoice: true } } } },
        },
      });
    });
  }

  insuranceProviders() {
    return this.prisma.insuranceProvider.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  createInsuranceProvider(dto: CreateInsuranceProviderDto) {
    return this.prisma.insuranceProvider.create({
      data: { ...dto, code: dto.code.trim().toUpperCase(), name: dto.name.trim() },
    });
  }

  insurancePolicies() {
    return this.prisma.patientInsurance.findMany({
      include: { patient: true, provider: true },
      orderBy: { id: 'desc' },
      take: 300,
    });
  }

  createPatientInsurance(dto: CreatePatientInsuranceDto) {
    return this.prisma.patientInsurance.create({
      data: {
        ...dto,
        coveragePercent: new Prisma.Decimal(dto.coveragePercent),
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
      include: { patient: true, provider: true },
    });
  }

  insuranceClaims() {
    return this.prisma.insuranceClaim.findMany({
      include: { patientInsurance: { include: { patient: true, provider: true } }, invoice: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async createInsuranceClaim(dto: CreateInsuranceClaimDto) {
    const [policy, invoice] = await Promise.all([
      this.prisma.patientInsurance.findUnique({ where: { id: dto.patientInsuranceId } }),
      this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } }),
    ]);
    if (!policy || !policy.isActive) throw new NotFoundException('Police active introuvable.');
    if (!invoice || invoice.patientId !== policy.patientId)
      throw new BadRequestException('La facture ne correspond pas au patient assuré.');
    if (dto.claimedAmount > Number(invoice.total))
      throw new BadRequestException('Le montant réclamé dépasse la facture.');
    return this.prisma.insuranceClaim.create({
      data: {
        ...dto,
        reference: `SIN-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        claimedAmount: new Prisma.Decimal(dto.claimedAmount),
      },
      include: { patientInsurance: { include: { patient: true, provider: true } }, invoice: true },
    });
  }

  async updateInsuranceClaim(id: string, dto: UpdateInsuranceClaimDto) {
    const claim = await this.prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException('Dossier assurance introuvable.');
    if (dto.approvedAmount !== undefined && dto.approvedAmount > Number(claim.claimedAmount)) {
      throw new BadRequestException('Le montant approuvé dépasse le montant réclamé.');
    }
    return this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        status: dto.status,
        approvedAmount:
          dto.approvedAmount === undefined ? undefined : new Prisma.Decimal(dto.approvedAmount),
        notes: dto.notes,
        submittedAt: dto.status === InsuranceClaimStatus.SUBMITTED ? new Date() : undefined,
        resolvedAt:
          dto.status === InsuranceClaimStatus.APPROVED ||
          dto.status === InsuranceClaimStatus.PARTIALLY_APPROVED ||
          dto.status === InsuranceClaimStatus.REJECTED ||
          dto.status === InsuranceClaimStatus.PAID
            ? new Date()
            : undefined,
      },
    });
  }

  suppliers() {
    return this.prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  createSupplier(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: { ...dto, code: dto.code.trim().toUpperCase(), name: dto.name.trim() },
    });
  }

  purchaseOrders() {
    return this.prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: { include: { medication: true } },
        createdBy: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async purchaseOrder(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { medication: true } },
        createdBy: { select: { username: true } },
      },
    });
    if (!order) throw new NotFoundException('Bon de commande introuvable.');
    return order;
  }

  createPurchaseOrder(dto: CreatePurchaseOrderDto, userId: string) {
    if (!dto.items.length)
      throw new BadRequestException('La commande doit contenir au moins une ligne.');
    const total = dto.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    return this.prisma.purchaseOrder.create({
      data: {
        number: `CMD-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        supplierId: dto.supplierId,
        createdById: userId,
        total: new Prisma.Decimal(total),
        notes: dto.notes,
        items: {
          create: dto.items.map((item) => ({
            ...item,
            unitCost: new Prisma.Decimal(item.unitCost),
            total: new Prisma.Decimal(item.quantity * item.unitCost),
          })),
        },
      },
      include: { supplier: true, items: true },
    });
  }

  async orderPurchase(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Bon de commande introuvable.');
    if (order.status !== PurchaseOrderStatus.DRAFT)
      throw new BadRequestException('Seule une commande brouillon peut être envoyée.');
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.ORDERED, orderedAt: new Date() },
    });
  }

  async receivePurchase(id: string, userId: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Bon de commande introuvable.');
    if (
      order.status !== PurchaseOrderStatus.ORDERED &&
      order.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestException('Cette commande ne peut pas être réceptionnée.');
    }
    return this.prisma.$transaction(async (transaction) => {
      for (const item of order.items) {
        if (item.medicationId && item.receivedQuantity < item.quantity) {
          const quantity = item.quantity - item.receivedQuantity;
          await transaction.medication.update({
            where: { id: item.medicationId },
            data: { stockQuantity: { increment: quantity } },
          });
          await transaction.stockMovement.create({
            data: {
              medicationId: item.medicationId,
              userId,
              type: StockMovementType.ENTRY,
              quantity,
              reason: `Réception ${order.number}`,
              reference: order.number,
            },
          });
        }
        await transaction.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.quantity },
        });
      }
      return transaction.purchaseOrder.update({
        where: { id },
        data: { status: PurchaseOrderStatus.RECEIVED, receivedAt: new Date() },
        include: { supplier: true, items: true },
      });
    });
  }

  async reports(from?: string, to?: string) {
    const range =
      from || to
        ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }
        : undefined;
    const [
      patients,
      invoices,
      payments,
      revenue,
      exams,
      orders,
      blood,
      claims,
      purchases,
      lowStock,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { archivedAt: null } }),
      this.prisma.invoice.count({ where: range ? { issuedAt: range } : {} }),
      this.prisma.payment.count({ where: range ? { paidAt: range } : {} }),
      this.prisma.payment.aggregate({
        where: range ? { paidAt: range } : {},
        _sum: { amount: true },
      }),
      this.prisma.examRequest.count({ where: range ? { requestedAt: range } : {} }),
      this.prisma.clinicalOrder.count({ where: range ? { createdAt: range } : {} }),
      this.prisma.bloodUnit.count({ where: { status: BloodUnitStatus.AVAILABLE } }),
      this.prisma.insuranceClaim.count({
        where: { status: { in: [InsuranceClaimStatus.DRAFT, InsuranceClaimStatus.SUBMITTED] } },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          status: {
            in: [
              PurchaseOrderStatus.DRAFT,
              PurchaseOrderStatus.ORDERED,
              PurchaseOrderStatus.PARTIALLY_RECEIVED,
            ],
          },
        },
      }),
      this.prisma.medication.findMany({
        where: { isActive: true },
        select: { stockQuantity: true, minimumStock: true },
      }),
    ]);
    return {
      patients,
      invoices,
      payments,
      revenue: Number(revenue._sum.amount ?? 0),
      laboratoryExams: exams,
      clinicalOrders: orders,
      availableBloodUnits: blood,
      pendingInsuranceClaims: claims,
      openPurchaseOrders: purchases,
      lowStockMedications: lowStock.filter((item) => item.stockQuantity <= item.minimumStock)
        .length,
      paidInvoices: await this.prisma.invoice.count({
        where: { status: InvoiceStatus.PAID, ...(range ? { issuedAt: range } : {}) },
      }),
    };
  }
}
