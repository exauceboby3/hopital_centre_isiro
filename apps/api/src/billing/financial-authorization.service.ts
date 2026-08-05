import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillableServiceType,
  CareAuthorizationStatus,
  InsuranceCoverageStatus,
  InvoiceStatus,
  PaymentPayer,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBillableServiceDto,
  CreateCareAuthorizationDto,
  CreatePharmacyAuthorizationDto,
  ListCareAuthorizationsDto,
  UpdateBillableServiceDto,
} from './dto/financial-authorization.dto';
import { PatientFinancialAccessService } from './patient-financial-access.service';
import { canStartCare } from './payment-gate';

type DatabaseClient = Prisma.TransactionClient | PrismaService;

type ServiceAuthorizationInput = {
  patientId: string;
  serviceId: string;
  createdById: string;
  expectedType?: BillableServiceType;
  appointmentId?: string;
  examRequestId?: string;
  clinicalOrderId?: string;
};

type ConsumptionTarget = {
  appointmentId?: string;
  consultationId?: string;
  examRequestId?: string;
  hospitalizationId?: string;
  clinicalOrderId?: string;
};

const authorizationInclude = {
  patient: true,
  service: true,
  medication: true,
  invoice: {
    include: {
      items: true,
      payments: { orderBy: { paidAt: 'desc' } },
    },
  },
  createdBy: { select: { id: true, username: true } },
  waivedBy: { select: { id: true, username: true } },
  appointment: true,
  examRequest: true,
  hospitalization: true,
  clinicalOrder: true,
} satisfies Prisma.CareAuthorizationInclude;

@Injectable()
export class FinancialAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientAccess: PatientFinancialAccessService,
  ) {}

  async listServices(
    type?: BillableServiceType,
    includeInactive = false,
    user?: AuthenticatedUser,
  ) {
    const canViewPrices = Boolean(
      user && hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT]),
    );
    const rows = await this.prisma.billableService.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(!includeInactive || !canViewPrices ? { isActive: true } : {}),
      },
      orderBy: [{ type: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
    if (canViewPrices) return rows;
    return rows.map((row) => {
      const { price, ...clinicalService } = row;
      void price;
      return clinicalService;
    });
  }

  createService(dto: CreateBillableServiceDto) {
    return this.prisma.billableService.create({
      data: {
        ...dto,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        category: dto.category?.trim() || undefined,
        price: new Prisma.Decimal(dto.price),
      },
    });
  }

  async updateService(id: string, dto: UpdateBillableServiceDto) {
    await this.findService(id);
    return this.prisma.billableService.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code?.trim().toUpperCase(),
        name: dto.name?.trim(),
        category: dto.category?.trim() || undefined,
        price: dto.price === undefined ? undefined : new Prisma.Decimal(dto.price),
      },
    });
  }

  async removeService(id: string) {
    await this.findService(id);
    const usage = await this.prisma.careAuthorization.count({ where: { serviceId: id } });
    if (usage) {
      const service = await this.prisma.billableService.update({
        where: { id },
        data: { isActive: false },
      });
      return { deleted: false, deactivated: true, service };
    }
    await this.prisma.billableService.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  async listAuthorizations(filters: ListCareAuthorizationsDto, user: AuthenticatedUser) {
    const rows = await this.prisma.careAuthorization.findMany({
      where: {
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.patientId ? { patientId: filters.patientId } : {}),
      },
      include: authorizationInclude,
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT])) {
      return rows;
    }
    return rows.map((row) => {
      const {
        amount: _amount,
        invoiceId: _invoiceId,
        invoice: _invoice,
        medication: _medication,
        service: _service,
        createdBy: _createdBy,
        waivedBy: _waivedBy,
        ...authorization
      } = row;
      void _amount;
      void _invoiceId;
      void _invoice;
      void _medication;
      void _service;
      void _createdBy;
      void _waivedBy;
      return {
        ...authorization,
        paymentClearance: {
          inOrder:
            row.status === CareAuthorizationStatus.AUTHORIZED ||
            row.status === CareAuthorizationStatus.WAIVED,
          status:
            row.status === CareAuthorizationStatus.AUTHORIZED ||
            row.status === CareAuthorizationStatus.WAIVED
              ? 'IN_ORDER'
              : 'TO_REGULARIZE',
        },
      };
    });
  }

  createAuthorization(dto: CreateCareAuthorizationDto, createdById: string) {
    return this.prisma.$transaction((transaction) =>
      this.createFromService({ ...dto, createdById }, transaction),
    );
  }

  async createFromService(input: ServiceAuthorizationInput, db: DatabaseClient) {
    const service = await db.billableService.findUnique({ where: { id: input.serviceId } });
    if (!service || !service.isActive)
      throw new NotFoundException('Acte facturable introuvable ou inactif.');
    if (input.expectedType && service.type !== input.expectedType) {
      throw new BadRequestException("Le tarif choisi ne correspond pas au type d'acte demandé.");
    }

    const requiresPayment = service.requiresPrepayment && service.price.greaterThan(0);
    const invoice = await db.invoice.create({
      data: {
        number: this.invoiceNumber(),
        patientId: input.patientId,
        issuedById: input.createdById,
        status: requiresPayment ? InvoiceStatus.PENDING : InvoiceStatus.PAID,
        total: service.price,
        notes: `Paiement préalable — ${service.name}`,
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

    return db.careAuthorization.create({
      data: {
        patientId: input.patientId,
        invoiceId: invoice.id,
        serviceId: service.id,
        appointmentId: input.appointmentId,
        examRequestId: input.examRequestId,
        clinicalOrderId: input.clinicalOrderId,
        createdById: input.createdById,
        type: service.type,
        description: service.name,
        amount: service.price,
        status: requiresPayment
          ? CareAuthorizationStatus.PENDING
          : CareAuthorizationStatus.AUTHORIZED,
        authorizedAt: requiresPayment ? undefined : new Date(),
      },
      include: authorizationInclude,
    });
  }

  createPharmacyAuthorization(dto: CreatePharmacyAuthorizationDto, createdById: string) {
    return this.prisma.$transaction(async (transaction) => {
      const medication = await transaction.medication.findUnique({
        where: { id: dto.medicationId },
      });
      if (!medication || !medication.isActive) {
        throw new NotFoundException('Médicament introuvable ou inactif.');
      }
      if (medication.stockQuantity < dto.quantity) {
        throw new BadRequestException('Stock insuffisant pour préparer cette vente.');
      }
      if (medication.unitPrice.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Le prix de ce médicament doit être configuré avant la facturation.',
        );
      }

      const total = medication.unitPrice.mul(dto.quantity);
      const invoice = await transaction.invoice.create({
        data: {
          number: this.invoiceNumber(),
          patientId: dto.patientId,
          issuedById: createdById,
          status: InvoiceStatus.PENDING,
          total,
          notes: `Paiement préalable — pharmacie (${medication.name})`,
          items: {
            create: {
              description: medication.name,
              quantity: dto.quantity,
              unitPrice: medication.unitPrice,
              total,
            },
          },
        },
      });

      return transaction.careAuthorization.create({
        data: {
          patientId: dto.patientId,
          invoiceId: invoice.id,
          medicationId: medication.id,
          createdById,
          type: BillableServiceType.PHARMACY,
          description: medication.name,
          amount: total,
          quantity: dto.quantity,
        },
        include: authorizationInclude,
      });
    });
  }

  async assertAuthorized(
    id: string,
    patientId: string,
    expectedType: BillableServiceType,
    db: DatabaseClient,
  ) {
    const authorization = await db.careAuthorization.findUnique({
      where: { id },
      include: {
        invoice: { include: { payments: true, insuranceCoverage: true } },
      },
    });
    if (!authorization) throw new NotFoundException('Autorisation financière introuvable.');
    if (authorization.patientId !== patientId || authorization.type !== expectedType) {
      throw new BadRequestException("Cette autorisation ne correspond pas au patient ou à l'acte.");
    }
    if (authorization.status === CareAuthorizationStatus.CONSUMED) {
      throw new BadRequestException('Cette autorisation a déjà été utilisée.');
    }

    const patientPaid = authorization.invoice.payments
      .filter((payment) => payment.payerType === PaymentPayer.PATIENT)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const coverageCleared =
      authorization.invoice.insuranceCoverage &&
      (authorization.invoice.insuranceCoverage.status === InsuranceCoverageStatus.GUARANTEED ||
        authorization.invoice.insuranceCoverage.status === InsuranceCoverageStatus.SETTLED) &&
      patientPaid >= Number(authorization.invoice.insuranceCoverage.patientAmount);
    if (
      authorization.status === CareAuthorizationStatus.PENDING &&
      (authorization.invoice.status === InvoiceStatus.PAID || coverageCleared)
    ) {
      const gate = await this.patientAccess.assertCareAccess(
        patientId,
        expectedType,
        authorization.invoiceId,
        db,
      );
      if (gate.grace) {
        return db.careAuthorization.update({
          where: { id },
          data: {
            status: CareAuthorizationStatus.WAIVED,
            waivedAt: new Date(),
            waivedById: gate.grace.createdById,
            waiverReason: `Mesure de grâce ${gate.grace.number} — ${gate.grace.reason}`,
          },
        });
      }
      return db.careAuthorization.update({
        where: { id },
        data: { status: CareAuthorizationStatus.AUTHORIZED, authorizedAt: new Date() },
      });
    }

    const gate = await this.patientAccess.assertCareAccess(
      patientId,
      expectedType,
      authorization.invoiceId,
      db,
    );
    if (gate.grace && authorization.status === CareAuthorizationStatus.PENDING) {
      return db.careAuthorization.update({
        where: { id },
        data: {
          status: CareAuthorizationStatus.WAIVED,
          waivedAt: new Date(),
          waivedById: gate.grace.createdById,
          waiverReason: `Mesure de grâce ${gate.grace.number} — ${gate.grace.reason}`,
        },
      });
    }

    if (!canStartCare(authorization.status)) {
      throw new BadRequestException(
        "Paiement intégral requis avant cet acte. Le patient doit d'abord passer à la caisse ou recevoir une mesure de grâce active.",
      );
    }
    return authorization;
  }

  async consume(
    id: string,
    patientId: string,
    expectedType: BillableServiceType,
    target: ConsumptionTarget,
    db: DatabaseClient,
  ) {
    await this.assertAuthorized(id, patientId, expectedType, db);
    const claimed = await db.careAuthorization.updateMany({
      where: {
        id,
        status: { in: [CareAuthorizationStatus.AUTHORIZED, CareAuthorizationStatus.WAIVED] },
      },
      data: {
        status: CareAuthorizationStatus.CONSUMED,
        consumedAt: new Date(),
        ...target,
      },
    });
    if (!claimed.count) {
      throw new BadRequestException('Cette autorisation vient déjà d’être utilisée.');
    }
    return db.careAuthorization.findUniqueOrThrow({ where: { id } });
  }

  async waive(id: string, reason: string, waivedById: string) {
    const authorization = await this.prisma.careAuthorization.findUnique({ where: { id } });
    if (!authorization) throw new NotFoundException('Autorisation financière introuvable.');
    if (authorization.status !== CareAuthorizationStatus.PENDING) {
      throw new BadRequestException(
        'Seule une autorisation en attente peut recevoir une dérogation.',
      );
    }
    const claimed = await this.prisma.careAuthorization.updateMany({
      where: { id, status: CareAuthorizationStatus.PENDING },
      data: {
        status: CareAuthorizationStatus.WAIVED,
        waivedAt: new Date(),
        waivedById,
        waiverReason: reason.trim(),
      },
    });
    if (!claimed.count) {
      throw new BadRequestException('Le statut de cette autorisation vient de changer.');
    }
    return this.prisma.careAuthorization.findUniqueOrThrow({
      where: { id },
      include: authorizationInclude,
    });
  }

  private async findService(id: string) {
    const service = await this.prisma.billableService.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Acte facturable introuvable.');
    return service;
  }

  private invoiceNumber() {
    return `FAC-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
