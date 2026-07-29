import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BillableServiceType,
  InsuranceCoverageStatus,
  InvoiceStatus,
  PaymentPayer,
  Prisma,
  PrescriptionStatus,
  StockMovementType,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PatientFinancialAccessService } from '../billing/patient-financial-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { DispensePrescriptionDto } from './dto/enterprise.dto';
import { EnterpriseService } from './enterprise.service';

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
export class GraceAwareEnterpriseService extends EnterpriseService {
  constructor(
    private readonly database: PrismaService,
    authorizations: FinancialAuthorizationService,
    private readonly patientAccess: PatientFinancialAccessService,
  ) {
    super(database, authorizations);
  }

  override async dispensePrescription(id: string, dto: DispensePrescriptionDto, userId: string) {
    const prescription = await this.database.prescription.findUnique({
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

    const grace = await this.patientAccess.activeGrace(
      prescription.patientId,
      BillableServiceType.PHARMACY,
    );
    if (!grace) {
      await this.patientAccess.assertCareAccess(
        prescription.patientId,
        BillableServiceType.PHARMACY,
        prescription.invoiceId,
      );
      if (!this.isInvoiceClearedForDispensing(prescription.invoice)) {
        throw new BadRequestException(
          'La part patient doit être payée et la garantie assureur validée avant délivrance.',
        );
      }
    }

    return this.database.$transaction(
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
                reason: `Ordonnance ${prescription.number}${dto.notes ? ` — ${dto.notes}` : ''}${grace ? ` — mesure de grâce ${grace.number}` : ''}`,
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
        const updated = await transaction.prescription.update({
          where: { id },
          data: { status: PrescriptionStatus.DISPENSED, dispensedAt: new Date() },
          include: prescriptionInclude,
        });
        if (grace) {
          await transaction.auditLog.create({
            data: {
              userId,
              action: 'PRESCRIPTION_DISPENSED_UNDER_GRACE',
              entity: 'Prescription',
              entityId: id,
              metadata: {
                patientId: prescription.patientId,
                invoiceId: prescription.invoiceId,
                graceId: grace.id,
                graceNumber: grace.number,
                graceExpiresAt: grace.validUntil,
              },
            },
          });
        }
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private isInvoiceClearedForDispensing(invoice: {
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
}
