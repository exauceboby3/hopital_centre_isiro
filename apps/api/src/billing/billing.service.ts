import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  BillableServiceType,
  CareAuthorizationStatus,
  ConsultationStatus,
  InsuranceCoverageStatus,
  InvoiceStatus,
  PatientJourneyStage,
  PaymentPayer,
  Prisma,
  VoucherCoverageStatus,
} from '@prisma/client';
import { mergeClinicalReport } from '../consultations/clinical-report';
import { PrismaService } from '../prisma/prisma.service';
import { calculateInvoiceTotal, paymentStatus } from './billing.calculations';
import { CreateBatchPaymentDto } from './dto/create-batch-payment.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';

const invoiceInclude = {
  patient: true,
  issuedBy: { select: { id: true, username: true } },
  items: true,
  payments: {
    orderBy: { paidAt: 'desc' },
    include: { receivedBy: { select: { username: true } } },
  },
  careAuthorization: { include: { service: true, medication: true } },
  insuranceCoverage: { include: { patientInsurance: { include: { provider: true } } } },
  voucherCoverage: { include: { careVoucher: true } },
} satisfies Prisma.InvoiceInclude;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: InvoiceStatus, patientId?: string) {
    return this.prisma.invoice.findMany({
      where: { ...(status ? { status } : {}), ...(patientId ? { patientId } : {}) },
      include: invoiceInclude,
      orderBy: { issuedAt: 'desc' },
      take: 250,
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    return invoice;
  }

  async groupedDocument(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length || uniqueIds.length > 100) {
      throw new BadRequestException('Sélectionnez entre 1 et 100 factures.');
    }
    if (uniqueIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))) {
      throw new BadRequestException('Une référence de facture est invalide.');
    }
    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: uniqueIds }, status: { not: InvoiceStatus.CANCELLED } },
      include: invoiceInclude,
      orderBy: { issuedAt: 'asc' },
    });
    if (invoices.length !== uniqueIds.length) {
      throw new NotFoundException('Une ou plusieurs factures sont introuvables ou annulées.');
    }
    if (new Set(invoices.map((invoice) => invoice.patientId)).size !== 1) {
      throw new BadRequestException(
        'Un document groupé ne peut contenir que les factures d’un même patient.',
      );
    }
    const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const paid = invoices.reduce(
      (sum, invoice) =>
        sum +
        invoice.payments.reduce((invoiceSum, payment) => invoiceSum + Number(payment.amount), 0),
      0,
    );
    return {
      patient: invoices[0]!.patient,
      invoices,
      total,
      paid,
      balance: Math.max(0, total - paid),
      generatedAt: new Date(),
    };
  }

  create(dto: CreateInvoiceDto, userId: string) {
    const total = calculateInvoiceTotal(dto.items);
    return this.prisma.invoice.create({
      data: {
        number: `FAC-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        patientId: dto.patientId,
        issuedById: userId,
        status: InvoiceStatus.PENDING,
        total: new Prisma.Decimal(total),
        notes: dto.notes,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        items: {
          create: dto.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            total: new Prisma.Decimal(item.quantity * item.unitPrice),
          })),
        },
      },
      include: invoiceInclude,
    });
  }

  async addPayment(invoiceId: string, dto: CreatePaymentDto, userId: string) {
    return this.prisma.$transaction(
      (transaction) => this.applyPayment(transaction, invoiceId, dto, userId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async addBatchPayments(dto: CreateBatchPaymentDto, userId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        const invoices = [];
        for (const invoiceId of dto.invoiceIds) {
          invoices.push(
            await this.applyPayment(
              transaction,
              invoiceId,
              {
                method: dto.method,
                payerType: dto.payerType,
                reference: dto.reference,
              },
              userId,
            ),
          );
        }
        return { count: invoices.length, invoices };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async applyPayment(
    transaction: Prisma.TransactionClient,
    invoiceId: string,
    dto: Omit<CreatePaymentDto, 'amount'> & { amount?: number },
    userId: string,
  ) {
    const invoice = await transaction.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true, insuranceCoverage: true, voucherCoverage: true },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    if (invoice.status === InvoiceStatus.CANCELLED || invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException("Cette facture n'accepte plus de paiement.");
    }

    const alreadyPaid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const paidByPayer = invoice.payments
      .filter((payment) => payment.payerType === dto.payerType)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const payerLimit = invoice.insuranceCoverage
      ? dto.payerType === PaymentPayer.INSURER
        ? Number(invoice.insuranceCoverage.insurerAmount)
        : Number(invoice.insuranceCoverage.patientAmount)
      : invoice.voucherCoverage
        ? dto.payerType === PaymentPayer.SPONSOR
          ? Number(invoice.voucherCoverage.sponsorAmount)
          : Number(invoice.voucherCoverage.patientAmount)
        : Number(invoice.total);
    const amount =
      dto.amount ?? Math.min(Number(invoice.total) - alreadyPaid, payerLimit - paidByPayer);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Aucun solde payable pour le payeur sélectionné.');
    }
    const newTotalPaid = alreadyPaid + amount;
    if (newTotalPaid > Number(invoice.total)) {
      throw new BadRequestException('Le paiement dépasse le solde de la facture.');
    }
    const status = paymentStatus(Number(invoice.total), newTotalPaid);

    if (!invoice.insuranceCoverage && dto.payerType === PaymentPayer.INSURER) {
      throw new BadRequestException(
        "Aucune prise en charge d'assurance n'est liée à cette facture.",
      );
    }
    if (!invoice.voucherCoverage && dto.payerType === PaymentPayer.SPONSOR) {
      throw new BadRequestException('Aucun bon de soins n’est lié à cette facture.');
    }

    if (invoice.insuranceCoverage) {
      if (dto.payerType === PaymentPayer.SPONSOR) {
        throw new BadRequestException('Cette facture attend un paiement assureur, pas un bon.');
      }
      const coverageLimit =
        dto.payerType === PaymentPayer.INSURER
          ? Number(invoice.insuranceCoverage.insurerAmount)
          : Number(invoice.insuranceCoverage.patientAmount);
      if (paidByPayer + amount > coverageLimit) {
        throw new BadRequestException(
          `Le paiement dépasse la part ${dto.payerType === PaymentPayer.INSURER ? 'assureur' : 'patient'}.`,
        );
      }
    }

    if (invoice.voucherCoverage) {
      if (dto.payerType === PaymentPayer.INSURER) {
        throw new BadRequestException('Cette facture attend un paiement organisme, pas assureur.');
      }
      const coverageLimit =
        dto.payerType === PaymentPayer.SPONSOR
          ? Number(invoice.voucherCoverage.sponsorAmount)
          : Number(invoice.voucherCoverage.patientAmount);
      if (paidByPayer + amount > coverageLimit) {
        throw new BadRequestException(
          `Le paiement dépasse la part ${dto.payerType === PaymentPayer.SPONSOR ? 'organisme' : 'patient'}.`,
        );
      }
    }

    await transaction.payment.create({
      data: {
        invoiceId,
        receivedById: userId,
        amount: new Prisma.Decimal(amount),
        method: dto.method,
        payerType: dto.payerType,
        reference: dto.reference,
      },
    });
    const patientPaid =
      invoice.payments
        .filter((payment) => payment.payerType === PaymentPayer.PATIENT)
        .reduce((sum, payment) => sum + Number(payment.amount), 0) +
      (dto.payerType === PaymentPayer.PATIENT ? amount : 0);
    const coverageCleared =
      invoice.insuranceCoverage &&
      (invoice.insuranceCoverage.status === InsuranceCoverageStatus.GUARANTEED ||
        invoice.insuranceCoverage.status === InsuranceCoverageStatus.SETTLED) &&
      patientPaid >= Number(invoice.insuranceCoverage.patientAmount);
    const voucherCleared =
      invoice.voucherCoverage?.status === VoucherCoverageStatus.GUARANTEED &&
      patientPaid >= Number(invoice.voucherCoverage.patientAmount);
    const financiallyCleared = status === InvoiceStatus.PAID || coverageCleared || voucherCleared;

    if (financiallyCleared) {
      const authorized = await transaction.careAuthorization.updateMany({
        where: { invoiceId, status: CareAuthorizationStatus.PENDING },
        data: { status: CareAuthorizationStatus.AUTHORIZED, authorizedAt: new Date() },
      });
      if (authorized.count > 0) {
        await this.checkInAppointmentAfterPayment(transaction, invoiceId, userId);
      }
    }
    if (status === InvoiceStatus.PAID && invoice.insuranceCoverage) {
      await transaction.insuranceCoverage.update({
        where: { invoiceId },
        data: { status: InsuranceCoverageStatus.SETTLED, settledAt: new Date() },
      });
    }
    if (status === InvoiceStatus.PAID && invoice.voucherCoverage) {
      await transaction.voucherCoverage.update({
        where: { invoiceId },
        data: { status: VoucherCoverageStatus.SETTLED, settledAt: new Date() },
      });
    }
    return transaction.invoice.update({
      where: { id: invoiceId },
      data: { status },
      include: invoiceInclude,
    });
  }

  private async checkInAppointmentAfterPayment(
    transaction: Prisma.TransactionClient,
    invoiceId: string,
    senderId: string,
  ) {
    const authorization = await transaction.careAuthorization.findUnique({
      where: { invoiceId },
      include: {
        appointment: {
          include: {
            patient: true,
            doctor: true,
            consultation: true,
          },
        },
      },
    });
    const appointment = authorization?.appointment;
    if (
      authorization?.type !== BillableServiceType.CONSULTATION ||
      !appointment ||
      appointment.status === AppointmentStatus.CHECKED_IN ||
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      return;
    }

    const now = new Date();
    await transaction.appointment.update({
      where: { id: appointment.id },
      data: {
        status: AppointmentStatus.CHECKED_IN,
        journeyStage: PatientJourneyStage.WAITING_DOCTOR,
        journeyUpdatedAt: now,
        doctorAcknowledgedAt: null,
      },
    });

    if (appointment.doctorId && !appointment.consultation) {
      await transaction.consultation.create({
        data: {
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
          appointmentId: appointment.id,
          reason: appointment.reason?.trim() || appointment.service,
          report: mergeClinicalReport(null, {
            chiefComplaint: appointment.reason?.trim() || appointment.service,
          }),
          status: ConsultationStatus.WAITING,
        },
      });
    }

    if (appointment.doctor?.userId && appointment.doctor.userId !== senderId) {
      const name = [
        appointment.patient.lastName,
        appointment.patient.postName,
        appointment.patient.firstName,
      ]
        .filter(Boolean)
        .join(' ');
      await transaction.message.create({
        data: {
          senderId,
          receiverId: appointment.doctor.userId,
          content: `Paiement confirmé : ${name} (${appointment.patient.medicalRecordNumber}) a été automatiquement marqué arrivé et placé dans votre salle d’attente.`,
        },
      });
    }
  }
}
