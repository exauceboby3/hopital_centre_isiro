import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentPayer, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { businessDayRange } from './cash-closure.rules';
import { CreateCashClosureDto } from './dto/cash-closure.dto';

const closureInclude = {
  closedBy: { select: { id: true, username: true } },
} satisfies Prisma.CashClosureInclude;

@Injectable()
export class CashClosureService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.cashClosure.findMany({
      include: closureInclude,
      orderBy: { businessDate: 'desc' },
      take: 90,
    });
  }

  async findOne(id: string) {
    const closure = await this.prisma.cashClosure.findUnique({
      where: { id },
      include: closureInclude,
    });
    if (!closure) throw new NotFoundException('Clôture de caisse introuvable.');
    return closure;
  }

  async close(dto: CreateCashClosureDto, userId: string) {
    const range = businessDayRange(dto.businessDate);
    if (!range) throw new BadRequestException('La date de clôture est invalide.');
    const today = businessDayRange(new Date(Date.now() + 7_200_000).toISOString().slice(0, 10));
    if (today && range.businessDate > today.businessDate) {
      throw new BadRequestException('Une journée future ne peut pas être clôturée.');
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const [invoices, payments] = await Promise.all([
            transaction.invoice.aggregate({
              where: { issuedAt: { gte: range.start, lt: range.end } },
              _count: { _all: true },
              _sum: { total: true },
            }),
            transaction.payment.findMany({
              where: { paidAt: { gte: range.start, lt: range.end } },
              select: { amount: true, method: true, payerType: true },
            }),
          ]);
          const sum = (predicate: (payment: (typeof payments)[number]) => boolean = () => true) =>
            payments
              .filter(predicate)
              .reduce((total, payment) => total + Number(payment.amount), 0);
          return transaction.cashClosure.create({
            data: {
              businessDate: range.businessDate,
              closedById: userId,
              invoiceCount: invoices._count._all,
              paymentCount: payments.length,
              totalBilled: new Prisma.Decimal(Number(invoices._sum.total ?? 0)),
              totalCollected: new Prisma.Decimal(sum()),
              cashTotal: new Prisma.Decimal(
                sum((payment) => payment.method === PaymentMethod.CASH),
              ),
              mobileTotal: new Prisma.Decimal(
                sum((payment) => payment.method === PaymentMethod.MOBILE_MONEY),
              ),
              bankTotal: new Prisma.Decimal(
                sum((payment) => payment.method === PaymentMethod.BANK_TRANSFER),
              ),
              cardTotal: new Prisma.Decimal(
                sum((payment) => payment.method === PaymentMethod.CARD),
              ),
              patientTotal: new Prisma.Decimal(
                sum((payment) => payment.payerType === PaymentPayer.PATIENT),
              ),
              insurerTotal: new Prisma.Decimal(
                sum((payment) => payment.payerType === PaymentPayer.INSURER),
              ),
              sponsorTotal: new Prisma.Decimal(
                sum((payment) => payment.payerType === PaymentPayer.SPONSOR),
              ),
              notes: dto.notes?.trim() || undefined,
            },
            include: closureInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Cette journée de caisse est déjà clôturée.');
      }
      throw error;
    }
  }
}
