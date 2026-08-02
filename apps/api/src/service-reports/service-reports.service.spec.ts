import { BadRequestException } from '@nestjs/common';
import { DepartmentReportStatus, Prisma, RequisitionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceReportsService } from './service-reports.service';

describe('ServiceReportsService', () => {
  it('calcule le reste selon le modèle papier et normalise une garde vide', async () => {
    type CreateInput = { data: { shift: string; serviceTotal: number; items: { create: Array<{ closingStock: number; pendingOrder: number }> } } };
    const create = jest.fn<Promise<unknown>, [CreateInput]>().mockResolvedValue({ id: 'report-1' });
    const service = new ServiceReportsService({
      departmentDailyReport: { create },
    } as unknown as PrismaService);

    await service.createReport(
      {
        department: ' nursing ',
        businessDate: '2026-08-02',
        shift: ' ',
        newAdmissions: 3,
        hospitalized: 4,
        ambulatory: 5,
        metrics: { MIH: 1, MIF: 2, PED: 1, GO: 0, MATERNITE: 0, CHIRURGIE: 0 },
        items: [
          {
            itemName: 'Ceftriaxone inj',
            unit: 'ampoule',
            openingStock: 23,
            receivedQuantity: 15,
            pendingOrder: 20,
            usedQuantity: 24,
            returnedQuantity: 2,
            lostQuantity: 1,
            unitCost: 1000,
          },
        ],
      },
      'nurse-1',
    );

    const input = create.mock.calls[0]?.[0];
    if (!input) throw new Error('Le rapport n’a pas été créé.');
    expect(input.data.shift).toBe('NON_PRECISEE');
    expect(input.data.serviceTotal).toBe(12);
    expect(input.data.items.create[0]).toMatchObject({
      closingStock: 15,
      pendingOrder: 20,
    });
  });

  it('refuse un stock final négatif', async () => {
    const service = new ServiceReportsService({} as PrismaService);
    await expect(
      service.createReport(
        {
          department: 'LABORATOIRE',
          businessDate: '2026-08-02',
          newAdmissions: 0,
          hospitalized: 0,
          ambulatory: 0,
          items: [
            {
              itemName: 'Réactif',
              openingStock: 1,
              receivedQuantity: 0,
              pendingOrder: 10,
              usedQuantity: 2,
              returnedQuantity: 0,
              lostQuantity: 0,
            },
          ],
        },
        'lab-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('inclut les retours dans la valeur théorique du tableau comptable', async () => {
    const service = new ServiceReportsService({
      departmentDailyReport: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'report-1',
            reference: 'RAP-1',
            businessDate: new Date('2026-08-02'),
            department: 'NURSING',
            shift: 'JOUR',
            status: DepartmentReportStatus.CLOSED,
            serviceTotal: 4,
            createdBy: { username: 'nurse' },
            items: [
              {
                openingStock: 10,
                receivedQuantity: 2,
                returnedQuantity: 1,
                usedQuantity: 4,
                lostQuantity: 1,
                closingStock: 8,
                unitCost: new Prisma.Decimal(100),
              },
            ],
          },
        ]),
      },
    } as unknown as PrismaService);

    const result = await service.accountingSummary({});
    expect(result.rows[0]).toMatchObject({
      openingValue: 1000,
      receivedValue: 200,
      returnedValue: 100,
      usedValue: 400,
      lostValue: 100,
      theoreticalClosing: 800,
      closingValue: 800,
      variance: 0,
    });
  });

  it('refuse une approbation supérieure à la quantité demandée', async () => {
    const service = new ServiceReportsService({
      internalRequisition: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'req-1',
          status: RequisitionStatus.SUBMITTED,
          items: [{ id: 'item-1', itemName: 'Gants', quantityRequested: 10 }],
        }),
      },
    } as unknown as PrismaService);

    await expect(
      service.approveRequisition(
        'req-1',
        { items: [{ itemId: 'item-1', quantityApproved: 11 }] },
        'accountant-1',
      ),
    ).rejects.toThrow('dépasse la quantité demandée');
  });

  it('reprend le nom et le coût du catalogue pour le tableau comptable', async () => {
    type CreateInput = {
      data: {
        items: {
          create: Array<{
            medicationId: string | null;
            itemName: string;
            unitCost: Prisma.Decimal | null;
          }>;
        };
      };
    };
    const create = jest.fn<Promise<unknown>, [CreateInput]>().mockResolvedValue({ id: 'report-2' });
    const service = new ServiceReportsService({
      medication: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Ceftriaxone injection',
            unitPrice: new Prisma.Decimal(2500),
          },
        ]),
      },
      departmentDailyReport: { create },
    } as unknown as PrismaService);

    await service.createReport(
      {
        department: 'NURSING',
        businessDate: '2026-08-02',
        shift: 'NUIT',
        newAdmissions: 0,
        hospitalized: 1,
        ambulatory: 0,
        items: [
          {
            medicationId: '11111111-1111-4111-8111-111111111111',
            itemName: 'Nom saisi manuellement',
            unit: 'ampoule',
            openingStock: 10,
            receivedQuantity: 0,
            pendingOrder: 0,
            usedQuantity: 2,
            returnedQuantity: 0,
            lostQuantity: 0,
            unitCost: 1,
          },
        ],
      },
      'nurse-1',
    );

    const payload = create.mock.calls[0]?.[0];
    if (!payload) throw new Error('Le rapport catalogue n’a pas été créé.');
    expect(payload.data.items.create[0]?.itemName).toBe('Ceftriaxone injection');
    expect(Number(payload.data.items.create[0]?.unitCost)).toBe(2500);
  });

});
