import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillableServiceType, Prisma, Role, StockMovementType } from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { DispenseMedicationDto } from './dto/dispense-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { stockDelta } from './stock.calculations';

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
  ) {}

  async list(lowStock = false, user?: AuthenticatedUser) {
    const medications = await this.prisma.medication.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const rows = lowStock
      ? medications.filter((medication) => medication.stockQuantity <= medication.minimumStock)
      : medications;
    const canViewPrices = Boolean(
      user &&
      hasAnyRole(user, [
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.CASHIER,
        Role.ACCOUNTANT,
        Role.PHARMACIST,
        Role.STOREKEEPER,
      ]),
    );
    if (canViewPrices) return rows;
    return rows.map((medication) => {
      const { unitPrice, ...clinicalMedication } = medication;
      void unitPrice;
      return clinicalMedication;
    });
  }

  create(dto: CreateMedicationDto, userId: string) {
    const { initialStock, ...medicationData } = dto;
    return this.prisma.$transaction(async (transaction) => {
      const medication = await transaction.medication.create({
        data: {
          ...medicationData,
          code: dto.code.trim().toUpperCase(),
          stockQuantity: initialStock,
          unitPrice: new Prisma.Decimal(dto.unitPrice),
        },
      });
      if (initialStock > 0) {
        await transaction.stockMovement.create({
          data: {
            medicationId: medication.id,
            userId,
            type: StockMovementType.ENTRY,
            quantity: initialStock,
            reason: 'Stock initial à la création du médicament',
          },
        });
      }
      return medication;
    });
  }

  async update(id: string, dto: UpdateMedicationDto) {
    await this.ensureExists(id);
    return this.prisma.medication.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code?.trim().toUpperCase(),
        unitPrice: dto.unitPrice === undefined ? undefined : new Prisma.Decimal(dto.unitPrice),
      },
    });
  }

  async deactivate(id: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const medication = await transaction.medication.findFirst({
        where: { id, isActive: true },
        select: { id: true, code: true, name: true, stockQuantity: true },
      });
      if (!medication) throw new NotFoundException('Médicament introuvable ou déjà supprimé.');

      await transaction.medication.update({
        where: { id },
        data: { isActive: false },
      });
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'MEDICATION_DEACTIVATED',
          entity: 'Medication',
          entityId: id,
          metadata: {
            code: medication.code,
            name: medication.name,
            stockQuantity: medication.stockQuantity,
          },
        },
      });
      return { id, isActive: false };
    });
  }

  async moveStock(id: string, dto: CreateStockMovementDto, userId: string) {
    await this.ensureExists(id);
    if (dto.type !== StockMovementType.ADJUSTMENT && dto.quantity < 0) {
      throw new BadRequestException(
        'La quantité doit être positive pour une entrée ou une sortie.',
      );
    }
    if (dto.type === StockMovementType.EXIT) {
      throw new BadRequestException(
        'Une délivrance au patient doit utiliser une autorisation de pharmacie payée.',
      );
    }
    const delta = stockDelta(dto.type, dto.quantity);

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.medication.updateMany({
        where: {
          id,
          isActive: true,
          ...(delta < 0 ? { stockQuantity: { gte: Math.abs(delta) } } : {}),
        },
        data: { stockQuantity: { increment: delta } },
      });
      if (!updated.count) throw new BadRequestException('Stock insuffisant pour cette sortie.');

      await transaction.stockMovement.create({
        data: {
          medicationId: id,
          userId,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason,
          reference: dto.reference,
        },
      });
      return transaction.medication.findUniqueOrThrow({ where: { id } });
    });
  }

  async dispense(id: string, dto: DispenseMedicationDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const authorization = await transaction.careAuthorization.findUnique({
        where: { id: dto.authorizationId },
        include: { invoice: true },
      });
      if (!authorization) throw new NotFoundException('Autorisation de pharmacie introuvable.');
      if (authorization.medicationId !== id || authorization.quantity !== dto.quantity) {
        throw new BadRequestException(
          'Le médicament ou la quantité ne correspond pas à la facture payée.',
        );
      }
      await this.authorizations.consume(
        authorization.id,
        dto.patientId,
        BillableServiceType.PHARMACY,
        {},
        transaction,
      );

      const updated = await transaction.medication.updateMany({
        where: { id, isActive: true, stockQuantity: { gte: dto.quantity } },
        data: { stockQuantity: { decrement: dto.quantity } },
      });
      if (!updated.count) throw new BadRequestException('Stock insuffisant pour cette délivrance.');
      await transaction.stockMovement.create({
        data: {
          medicationId: id,
          userId,
          type: StockMovementType.EXIT,
          quantity: dto.quantity,
          reason: `Délivrance payée au patient ${dto.patientId}`,
          reference: dto.reference ?? authorization.invoice.number,
        },
      });
      return transaction.medication.findUniqueOrThrow({ where: { id } });
    });
  }

  private async ensureExists(id: string): Promise<void> {
    if (!(await this.prisma.medication.count({ where: { id, isActive: true } }))) {
      throw new NotFoundException('Médicament introuvable.');
    }
  }
}
