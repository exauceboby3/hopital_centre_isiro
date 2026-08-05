import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DepartmentReportStatus, Prisma, RequisitionStatus, Role } from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApproveRequisitionDto,
  CreateDepartmentReportDto,
  CreateInternalRequisitionDto,
  FulfillRequisitionDto,
  ListRequisitionsQueryDto,
  ListServiceReportsQueryDto,
  UpdateDepartmentReportStatusDto,
} from './dto/service-report.dto';

const reportInclude = {
  createdBy: { select: { id: true, username: true, role: true } },
  approvedBy: { select: { id: true, username: true, role: true } },
  items: { include: { medication: true }, orderBy: { itemName: 'asc' as const } },
} satisfies Prisma.DepartmentDailyReportInclude;

const requisitionInclude = {
  requestedBy: { select: { id: true, username: true, role: true } },
  approvedBy: { select: { id: true, username: true, role: true } },
  fulfilledBy: { select: { id: true, username: true, role: true } },
  items: { include: { medication: true }, orderBy: { itemName: 'asc' as const } },
} satisfies Prisma.InternalRequisitionInclude;

@Injectable()
export class ServiceReportsService {
  constructor(private readonly prisma: PrismaService) {}

  presentReport<
    T extends {
      items: Array<{ unitCost: unknown; medication?: { unitPrice: unknown } | null }>;
    },
  >(report: T, user: AuthenticatedUser) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT])) {
      return report;
    }
    return {
      ...report,
      items: report.items.map((item) => {
        const { unitCost, ...operationalItem } = item;
        void unitCost;
        if (!item.medication) return operationalItem;
        const { unitPrice, ...operationalMedication } = item.medication;
        void unitPrice;
        return { ...operationalItem, medication: operationalMedication };
      }),
    };
  }

  presentRequisition<T extends { items: Array<{ medication?: { unitPrice: unknown } | null }> }>(
    requisition: T,
    user: AuthenticatedUser,
  ) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT])) {
      return requisition;
    }
    return {
      ...requisition,
      items: requisition.items.map((item) => {
        if (!item.medication) return item;
        const { unitPrice, ...operationalMedication } = item.medication;
        void unitPrice;
        return { ...item, medication: operationalMedication };
      }),
    };
  }

  listReports(query: ListServiceReportsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (to) to.setUTCHours(23, 59, 59, 999);
    return this.prisma.departmentDailyReport.findMany({
      where: {
        department: query.department
          ? { equals: query.department.trim(), mode: 'insensitive' }
          : undefined,
        status: query.status,
        businessDate: from || to ? { gte: from, lte: to } : undefined,
      },
      include: reportInclude,
      orderBy: [{ businessDate: 'desc' }, { department: 'asc' }],
      take: 500,
    });
  }

  async createReport(dto: CreateDepartmentReportDto, userId: string, canSetManualUnitCost = false) {
    const businessDate = new Date(dto.businessDate);
    const department = dto.department.trim().toUpperCase();
    const shift = dto.shift?.trim().toUpperCase() || 'NON_PRECISEE';
    const serviceTotal = dto.newAdmissions + dto.hospitalized + dto.ambulatory;
    const medicationIds = [
      ...new Set(dto.items.flatMap((item) => (item.medicationId ? [item.medicationId] : []))),
    ];
    const medications = medicationIds.length
      ? await this.prisma.medication.findMany({
          where: { id: { in: medicationIds }, isActive: true },
          select: { id: true, name: true, unitPrice: true },
        })
      : [];
    const medicationById = new Map(medications.map((medication) => [medication.id, medication]));
    if (medications.length !== medicationIds.length) {
      throw new BadRequestException(
        'Un médicament lié au rapport est introuvable ou inactif. Rechargez le catalogue.',
      );
    }

    const items = dto.items.map((item) => {
      const medication = item.medicationId ? medicationById.get(item.medicationId) : undefined;
      const closingStock =
        item.openingStock +
        item.receivedQuantity +
        item.returnedQuantity -
        item.usedQuantity -
        item.lostQuantity;
      if (closingStock < 0) {
        throw new BadRequestException(
          `Stock final négatif pour ${item.itemName}. Vérifiez les quantités utilisées ou perdues.`,
        );
      }
      return {
        medicationId: item.medicationId ?? null,
        itemName: medication?.name ?? item.itemName.trim(),
        unit: item.unit?.trim() || null,
        openingStock: item.openingStock,
        receivedQuantity: item.receivedQuantity,
        pendingOrder: item.pendingOrder,
        usedQuantity: item.usedQuantity,
        returnedQuantity: item.returnedQuantity,
        lostQuantity: item.lostQuantity,
        closingStock,
        unitCost:
          medication?.unitPrice ??
          (!canSetManualUnitCost || item.unitCost === undefined
            ? null
            : new Prisma.Decimal(item.unitCost)),
        observations: item.observations?.trim() || null,
      };
    });

    try {
      return await this.prisma.departmentDailyReport.create({
        data: {
          reference: `RAP-${businessDate.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`,
          department,
          businessDate,
          shift,
          newAdmissions: dto.newAdmissions,
          hospitalized: dto.hospitalized,
          ambulatory: dto.ambulatory,
          serviceTotal,
          metrics: dto.metrics ?? undefined,
          observations: dto.observations?.trim() || null,
          createdById: userId,
          items: { create: items },
        },
        include: reportInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'Un rapport existe déjà pour ce service, cette date et cette garde.',
        );
      }
      throw error;
    }
  }

  async updateReportStatus(
    id: string,
    dto: UpdateDepartmentReportStatusDto,
    user: AuthenticatedUser,
  ) {
    const report = await this.prisma.departmentDailyReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Rapport journalier introuvable.');
    const canApprove = hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT]);
    const creatorCanSubmit =
      report.createdById === user.id &&
      report.status === DepartmentReportStatus.DRAFT &&
      dto.status === DepartmentReportStatus.SUBMITTED;
    if (!canApprove && !creatorCanSubmit) {
      throw new ForbiddenException(
        'Le responsable peut uniquement soumettre son propre brouillon. Les autres transitions sont réservées à la comptabilité.',
      );
    }
    const allowed: Partial<Record<DepartmentReportStatus, DepartmentReportStatus[]>> = {
      DRAFT: [DepartmentReportStatus.SUBMITTED, DepartmentReportStatus.REJECTED],
      SUBMITTED: [DepartmentReportStatus.APPROVED, DepartmentReportStatus.REJECTED],
      APPROVED: [DepartmentReportStatus.CLOSED],
      REJECTED: [DepartmentReportStatus.DRAFT],
    };
    if (!(allowed[report.status] ?? []).includes(dto.status)) {
      throw new ConflictException(
        `Transition de rapport interdite : ${report.status} → ${dto.status}.`,
      );
    }
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.departmentDailyReport.update({
        where: { id },
        data: {
          status: dto.status,
          submittedAt: dto.status === DepartmentReportStatus.SUBMITTED ? now : report.submittedAt,
          approvedAt:
            dto.status === DepartmentReportStatus.APPROVED ||
            dto.status === DepartmentReportStatus.CLOSED
              ? (report.approvedAt ?? now)
              : report.approvedAt,
          approvedById:
            dto.status === DepartmentReportStatus.APPROVED ||
            dto.status === DepartmentReportStatus.CLOSED
              ? user.id
              : report.approvedById,
          observations: dto.note?.trim()
            ? [report.observations, dto.note.trim()].filter(Boolean).join('\n')
            : report.observations,
        },
        include: reportInclude,
      });
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: 'DEPARTMENT_REPORT_STATUS_CHANGED',
          entity: 'DepartmentDailyReport',
          entityId: id,
          metadata: { from: report.status, to: dto.status, note: dto.note ?? null },
        },
      });
      return updated;
    });
  }

  async accountingSummary(query: ListServiceReportsQueryDto) {
    const reports = await this.listReports(query);
    const rows = reports.map((report) => {
      const openingValue = report.items.reduce(
        (sum, item) => sum + item.openingStock * Number(item.unitCost ?? 0),
        0,
      );
      const receivedValue = report.items.reduce(
        (sum, item) => sum + item.receivedQuantity * Number(item.unitCost ?? 0),
        0,
      );
      const returnedValue = report.items.reduce(
        (sum, item) => sum + item.returnedQuantity * Number(item.unitCost ?? 0),
        0,
      );
      const usedValue = report.items.reduce(
        (sum, item) => sum + item.usedQuantity * Number(item.unitCost ?? 0),
        0,
      );
      const lostValue = report.items.reduce(
        (sum, item) => sum + item.lostQuantity * Number(item.unitCost ?? 0),
        0,
      );
      const closingValue = report.items.reduce(
        (sum, item) => sum + item.closingStock * Number(item.unitCost ?? 0),
        0,
      );
      const theoreticalClosing =
        openingValue + receivedValue + returnedValue - usedValue - lostValue;
      return {
        id: report.id,
        reference: report.reference,
        businessDate: report.businessDate,
        department: report.department,
        shift: report.shift,
        status: report.status,
        patientCount: report.serviceTotal,
        openingValue,
        receivedValue,
        returnedValue,
        usedValue,
        lostValue,
        closingValue,
        theoreticalClosing,
        variance: closingValue - theoreticalClosing,
        responsible: report.createdBy,
      };
    });
    return {
      rows,
      totals: rows.reduce(
        (total, row) => ({
          patients: total.patients + row.patientCount,
          openingValue: total.openingValue + row.openingValue,
          receivedValue: total.receivedValue + row.receivedValue,
          returnedValue: total.returnedValue + row.returnedValue,
          usedValue: total.usedValue + row.usedValue,
          lostValue: total.lostValue + row.lostValue,
          closingValue: total.closingValue + row.closingValue,
          variance: total.variance + row.variance,
        }),
        {
          patients: 0,
          openingValue: 0,
          receivedValue: 0,
          returnedValue: 0,
          usedValue: 0,
          lostValue: 0,
          closingValue: 0,
          variance: 0,
        },
      ),
    };
  }

  listRequisitions(query: ListRequisitionsQueryDto) {
    return this.prisma.internalRequisition.findMany({
      where: {
        department: query.department
          ? { equals: query.department.trim(), mode: 'insensitive' }
          : undefined,
        status: query.status,
      },
      include: requisitionInclude,
      orderBy: { requestedAt: 'desc' },
      take: 500,
    });
  }

  createRequisition(dto: CreateInternalRequisitionDto, userId: string) {
    return this.prisma.internalRequisition.create({
      data: {
        reference: `REQ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`,
        department: dto.department.trim().toUpperCase(),
        priority: dto.priority,
        status: RequisitionStatus.SUBMITTED,
        reason: dto.reason.trim(),
        notes: dto.notes?.trim() || null,
        requestedById: userId,
        items: {
          create: dto.items.map((item) => ({
            medicationId: item.medicationId,
            itemName: item.itemName.trim(),
            unit: item.unit?.trim() || null,
            quantityRequested: item.quantityRequested,
            observations: item.observations?.trim() || null,
          })),
        },
      },
      include: requisitionInclude,
    });
  }

  async approveRequisition(id: string, dto: ApproveRequisitionDto, userId: string) {
    const requisition = await this.prisma.internalRequisition.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!requisition) throw new NotFoundException('Réquisition introuvable.');
    if (requisition.status !== RequisitionStatus.SUBMITTED) {
      throw new ConflictException('Seule une réquisition soumise peut être approuvée.');
    }
    const byId = new Map(requisition.items.map((item) => [item.id, item]));
    for (const item of dto.items) {
      const current = byId.get(item.itemId);
      if (!current) throw new BadRequestException('Une ligne ne correspond pas à la réquisition.');
      if (item.quantityApproved > current.quantityRequested) {
        throw new BadRequestException(
          `La quantité approuvée de ${current.itemName} dépasse la quantité demandée.`,
        );
      }
    }
    return this.prisma.$transaction(async (transaction) => {
      for (const item of dto.items) {
        await transaction.internalRequisitionItem.update({
          where: { id: item.itemId },
          data: { quantityApproved: item.quantityApproved },
        });
      }
      return transaction.internalRequisition.update({
        where: { id },
        data: {
          status: RequisitionStatus.APPROVED,
          approvedById: userId,
          approvedAt: new Date(),
          notes: dto.notes?.trim()
            ? [requisition.notes, dto.notes.trim()].filter(Boolean).join('\n')
            : requisition.notes,
        },
        include: requisitionInclude,
      });
    });
  }

  async fulfillRequisition(id: string, dto: FulfillRequisitionDto, userId: string) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const requisition = await transaction.internalRequisition.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!requisition) throw new NotFoundException('Réquisition introuvable.');
          if (
            requisition.status !== RequisitionStatus.APPROVED &&
            requisition.status !== RequisitionStatus.PARTIALLY_FULFILLED
          ) {
            throw new ConflictException('La réquisition doit être approuvée avant la livraison.');
          }
          const byId = new Map(requisition.items.map((item) => [item.id, item]));
          for (const line of dto.items) {
            const item = byId.get(line.itemId);
            if (!item)
              throw new BadRequestException('Une ligne ne correspond pas à la réquisition.');
            const remaining = item.quantityApproved - item.quantityIssued;
            if (line.quantityIssued > remaining) {
              throw new BadRequestException(
                `La quantité livrée de ${item.itemName} dépasse le solde approuvé.`,
              );
            }
            if (!line.quantityIssued) continue;
            if (!item.medicationId) {
              throw new BadRequestException(
                `${item.itemName} n’est pas lié au catalogue de la pharmacie.`,
              );
            }
            const medicationClaim = await transaction.medication.updateMany({
              where: {
                id: item.medicationId,
                isActive: true,
                stockQuantity: { gte: line.quantityIssued },
              },
              data: { stockQuantity: { decrement: line.quantityIssued } },
            });
            if (!medicationClaim.count) {
              throw new BadRequestException(`Stock central insuffisant pour ${item.itemName}.`);
            }

            let remainingBatch = line.quantityIssued;
            const batches = await transaction.medicationBatch.findMany({
              where: {
                medicationId: item.medicationId,
                quantity: { gt: 0 },
                expiresAt: { gt: new Date() },
                isQuarantined: false,
              },
              orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'asc' }],
            });
            if (batches.reduce((sum, batch) => sum + batch.quantity, 0) < remainingBatch) {
              throw new BadRequestException(`Lots valides insuffisants pour ${item.itemName}.`);
            }
            for (const batch of batches) {
              if (!remainingBatch) break;
              const quantity = Math.min(batch.quantity, remainingBatch);
              const claimed = await transaction.medicationBatch.updateMany({
                where: { id: batch.id, quantity: { gte: quantity }, isQuarantined: false },
                data: { quantity: { decrement: quantity } },
              });
              if (!claimed.count) {
                throw new ConflictException(`Le lot ${batch.lotNumber} vient d’être modifié.`);
              }
              remainingBatch -= quantity;
            }
            await transaction.departmentStock.upsert({
              where: {
                department_medicationId: {
                  department: requisition.department,
                  medicationId: item.medicationId,
                },
              },
              create: {
                department: requisition.department,
                medicationId: item.medicationId,
                quantity: line.quantityIssued,
              },
              update: { quantity: { increment: line.quantityIssued } },
            });
            await transaction.departmentStockMovement.create({
              data: {
                medicationId: item.medicationId,
                userId,
                sourceDepartment: 'PHARMACIE_CENTRALE',
                targetDepartment: requisition.department,
                quantity: line.quantityIssued,
                reason: `Livraison de la réquisition ${requisition.reference}`,
                reference: requisition.reference,
              },
            });
            await transaction.internalRequisitionItem.update({
              where: { id: item.id },
              data: { quantityIssued: { increment: line.quantityIssued } },
            });
          }

          const refreshed = await transaction.internalRequisition.findUniqueOrThrow({
            where: { id },
            include: { items: true },
          });
          const complete = refreshed.items.every(
            (item) => item.quantityIssued >= item.quantityApproved,
          );
          return transaction.internalRequisition.update({
            where: { id },
            data: {
              status: complete
                ? RequisitionStatus.FULFILLED
                : RequisitionStatus.PARTIALLY_FULFILLED,
              fulfilledById: userId,
              fulfilledAt: complete ? new Date() : null,
              notes: dto.notes?.trim()
                ? [refreshed.notes, dto.notes.trim()].filter(Boolean).join('\n')
                : refreshed.notes,
            },
            include: requisitionInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException(
          'Le stock a été modifié simultanément. Rechargez la réquisition et recommencez.',
        );
      }
      throw error;
    }
  }

  departmentStocks(department?: string) {
    return this.prisma.departmentStock.findMany({
      where: department
        ? { department: { equals: department.trim(), mode: 'insensitive' } }
        : undefined,
      include: { medication: true },
      orderBy: [{ department: 'asc' }, { medication: { name: 'asc' } }],
    });
  }
}
