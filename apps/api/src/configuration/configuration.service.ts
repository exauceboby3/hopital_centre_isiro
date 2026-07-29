import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomFieldEntity, CustomFieldType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePrintTemplateDto,
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  UpdateHospitalProfileDto,
  UpdatePrintTemplateDto,
} from './dto/configuration.dto';

type DatabaseClient = Prisma.TransactionClient | PrismaService;

const PRINT_TARGETS: Record<string, { department: string; documentType: string }> = {
  invoice: { department: 'CASHIER', documentType: 'INVOICE' },
  receipt: { department: 'CASHIER', documentType: 'RECEIPT' },
  lab: { department: 'LABORATORY', documentType: 'LAB_RESULT' },
  clinical: { department: 'CLINICAL', documentType: 'CLINICAL_REPORT' },
  transfusion: { department: 'BLOOD_BANK', documentType: 'TRANSFUSION' },
  purchase: { department: 'PROCUREMENT', documentType: 'PURCHASE_ORDER' },
  patient: { department: 'RECORDS', documentType: 'PATIENT_RECORD' },
  prescription: { department: 'PHARMACY', documentType: 'PRESCRIPTION' },
  specialty: { department: 'SPECIALTY', documentType: 'SPECIALTY_REPORT' },
  radiology: { department: 'RADIOLOGY', documentType: 'RADIOLOGY_REPORT' },
  coverage: { department: 'INSURANCE', documentType: 'COVERAGE_CERTIFICATE' },
  inventory: { department: 'PHARMACY', documentType: 'INVENTORY_REPORT' },
  shift: { department: 'HUMAN_RESOURCES', documentType: 'SHIFT_SCHEDULE' },
  attendance: { department: 'HUMAN_RESOURCES', documentType: 'ATTENDANCE_REPORT' },
  payroll: { department: 'HUMAN_RESOURCES', documentType: 'PAYROLL_REPORT' },
  accounting: { department: 'ACCOUNTING', documentType: 'JOURNAL_ENTRY' },
};

@Injectable()
export class ConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  hospitalProfile() {
    return this.prisma.hospitalProfile.upsert({
      where: { id: 'main' },
      update: {},
      create: {
        id: 'main',
        name: "Centre Hospitalier d'Isiro",
        currency: 'CDF',
      },
    });
  }

  updateHospitalProfile(dto: UpdateHospitalProfileDto, userId: string) {
    return this.prisma.hospitalProfile.upsert({
      where: { id: 'main' },
      update: { ...dto, updatedById: userId },
      create: { id: 'main', ...dto, updatedById: userId },
    });
  }

  async printContext(kind: string) {
    const target = PRINT_TARGETS[kind];
    if (!target) throw new BadRequestException('Type de document imprimable inconnu.');
    const [profile, template] = await Promise.all([
      this.hospitalProfile(),
      this.prisma.printTemplate.findUnique({
        where: {
          department_documentType: {
            department: target.department,
            documentType: target.documentType,
          },
        },
      }),
    ]);
    return { profile, template: template?.isActive ? template : null, target };
  }

  printTemplates() {
    return this.prisma.printTemplate.findMany({
      include: {
        createdBy: { select: { username: true } },
        updatedBy: { select: { username: true } },
      },
      orderBy: [{ department: 'asc' }, { documentType: 'asc' }],
    });
  }

  createPrintTemplate(dto: CreatePrintTemplateDto, userId: string) {
    return this.prisma.printTemplate.create({
      data: {
        ...dto,
        department: dto.department.trim().toUpperCase(),
        documentType: dto.documentType.trim().toUpperCase(),
        createdById: userId,
        updatedById: userId,
      },
    });
  }

  async updatePrintTemplate(id: string, dto: UpdatePrintTemplateDto, userId: string) {
    if (!(await this.prisma.printTemplate.count({ where: { id } }))) {
      throw new NotFoundException("Modèle d'impression introuvable.");
    }
    return this.prisma.printTemplate.update({
      where: { id },
      data: {
        ...dto,
        department: dto.department?.trim().toUpperCase(),
        documentType: dto.documentType?.trim().toUpperCase(),
        updatedById: userId,
      },
    });
  }

  async deactivatePrintTemplate(id: string, userId: string) {
    if (!(await this.prisma.printTemplate.count({ where: { id } }))) {
      throw new NotFoundException("Modèle d'impression introuvable.");
    }
    return this.prisma.printTemplate.update({
      where: { id },
      data: { isActive: false, updatedById: userId },
    });
  }

  listFields(entity?: CustomFieldEntity, includeInactive = false) {
    return this.prisma.customFieldDefinition.findMany({
      where: {
        ...(entity ? { entity } : {}),
        ...(!includeInactive ? { isActive: true } : {}),
      },
      orderBy: [{ entity: 'asc' }, { displayOrder: 'asc' }, { label: 'asc' }],
    });
  }

  createField(dto: CreateCustomFieldDto, userId: string) {
    this.assertOptions(dto.type, dto.options);
    return this.prisma.customFieldDefinition.create({
      data: {
        ...dto,
        key: dto.key.trim().toLowerCase(),
        label: dto.label.trim(),
        options: dto.options ?? Prisma.JsonNull,
        createdById: userId,
      },
    });
  }

  async updateField(id: string, dto: UpdateCustomFieldDto) {
    const field = await this.prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('Rubrique personnalisée introuvable.');
    const nextType = dto.type ?? field.type;
    const nextOptions = dto.options ?? this.jsonOptions(field.options);
    this.assertOptions(nextType, nextOptions);
    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...dto,
        key: dto.key?.trim().toLowerCase(),
        label: dto.label?.trim(),
        options: dto.options === undefined ? undefined : dto.options,
      },
    });
  }

  async deactivateField(id: string) {
    const field = await this.prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('Rubrique personnalisée introuvable.');
    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async saveValues(
    entity: CustomFieldEntity,
    entityId: string,
    values: Record<string, unknown> | undefined,
    db: DatabaseClient,
    enforceRequired: boolean,
  ) {
    const definitions = await db.customFieldDefinition.findMany({
      where: { entity, isActive: true },
    });
    const provided = values ?? {};
    const allowedKeys = new Set(definitions.map((field) => field.key));
    const unknown = Object.keys(provided).find((key) => !allowedKeys.has(key));
    if (unknown) throw new BadRequestException(`Rubrique personnalisée inconnue : ${unknown}.`);

    for (const definition of definitions) {
      const value = provided[definition.key];
      if (enforceRequired && definition.required && this.isEmpty(value)) {
        throw new BadRequestException(`La rubrique « ${definition.label} » est obligatoire.`);
      }
      if (value === undefined) continue;
      this.assertValue(definition.type, definition.label, definition.options, value);
      await db.customFieldValue.upsert({
        where: { definitionId_entityId: { definitionId: definition.id, entityId } },
        update: { value: value as Prisma.InputJsonValue },
        create: {
          definitionId: definition.id,
          entityId,
          value: value as Prisma.InputJsonValue,
        },
      });
    }
  }

  async values(entity: CustomFieldEntity, entityId: string) {
    const rows = await this.prisma.customFieldValue.findMany({
      where: { entityId, definition: { entity } },
      include: { definition: true },
      orderBy: { definition: { displayOrder: 'asc' } },
    });
    return rows.map((row) => ({
      definition: row.definition,
      value: row.value,
    }));
  }

  async valuesForUser(
    entity: CustomFieldEntity,
    entityId: string,
    roles: Role[],
    currentUserId?: string,
  ) {
    this.assertFieldAccess(entity, entityId, roles, currentUserId);
    await this.assertEntityExists(entity, entityId);
    return this.values(entity, entityId);
  }

  async updateValues(
    entity: CustomFieldEntity,
    entityId: string,
    values: Record<string, unknown>,
    roles: Role[],
    currentUserId?: string,
  ) {
    this.assertFieldAccess(entity, entityId, roles, currentUserId);
    await this.assertEntityExists(entity, entityId);
    await this.saveValues(entity, entityId, values, this.prisma, false);
    return this.values(entity, entityId);
  }

  private assertFieldAccess(
    entity: CustomFieldEntity,
    entityId: string,
    roles: Role[],
    currentUserId?: string,
  ) {
    if (entity === CustomFieldEntity.STAFF && entityId === currentUserId) return;
    if (roles.some((role) => role === Role.SUPER_ADMIN || role === Role.ADMIN)) return;
    const allowed: Partial<Record<CustomFieldEntity, Role[]>> = {
      PATIENT: [Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST, Role.SECRETARY, Role.MIDWIFE],
      APPOINTMENT: [Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST, Role.SECRETARY],
      CONSULTATION: [Role.DOCTOR, Role.NURSE],
      LABORATORY: [Role.DOCTOR, Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST],
      HOSPITALIZATION: [Role.DOCTOR, Role.NURSE],
      INVOICE: [Role.CASHIER, Role.ACCOUNTANT, Role.RECEPTIONIST, Role.SECRETARY],
      CARE_VOUCHER: [Role.CASHIER, Role.ACCOUNTANT, Role.RECEPTIONIST, Role.SECRETARY],
      NURSING_CARE: [Role.DOCTOR, Role.NURSE, Role.SURGEON, Role.MIDWIFE],
      PRESCRIPTION: [Role.DOCTOR, Role.SURGEON, Role.PHARMACIST],
      PHARMACY_BATCH: [Role.PHARMACIST, Role.STOREKEEPER],
      SURGERY: [Role.DOCTOR, Role.SURGEON, Role.NURSE],
      MATERNITY: [Role.DOCTOR, Role.MIDWIFE, Role.NURSE],
      PEDIATRICS: [Role.DOCTOR, Role.NURSE],
      RADIOLOGY: [Role.DOCTOR, Role.RADIOLOGIST],
      SHIFT: [Role.ACCOUNTANT],
      ATTENDANCE: [Role.ACCOUNTANT],
      PAYROLL: [Role.ACCOUNTANT],
      ACCOUNTING: [Role.ACCOUNTANT],
    };
    if (!roles.some((role) => allowed[entity]?.includes(role))) {
      throw new ForbiddenException('Accès interdit à ces rubriques personnalisées.');
    }
  }

  private async assertEntityExists(entity: CustomFieldEntity, id: string) {
    let found = false;
    switch (entity) {
      case CustomFieldEntity.PATIENT:
        found = Boolean(await this.prisma.patient.count({ where: { id } }));
        break;
      case CustomFieldEntity.STAFF:
        found = Boolean(await this.prisma.user.count({ where: { id } }));
        break;
      case CustomFieldEntity.APPOINTMENT:
        found = Boolean(await this.prisma.appointment.count({ where: { id } }));
        break;
      case CustomFieldEntity.CONSULTATION:
        found = Boolean(await this.prisma.consultation.count({ where: { id } }));
        break;
      case CustomFieldEntity.LABORATORY:
        found = Boolean(await this.prisma.examRequest.count({ where: { id } }));
        break;
      case CustomFieldEntity.HOSPITALIZATION:
        found = Boolean(await this.prisma.hospitalization.count({ where: { id } }));
        break;
      case CustomFieldEntity.INVOICE:
        found = Boolean(await this.prisma.invoice.count({ where: { id } }));
        break;
      case CustomFieldEntity.CARE_VOUCHER:
        found = Boolean(await this.prisma.careVoucher.count({ where: { id } }));
        break;
      case CustomFieldEntity.NURSING_CARE:
        found = Boolean(await this.prisma.nursingCare.count({ where: { id } }));
        break;
      case CustomFieldEntity.PRESCRIPTION:
        found = Boolean(await this.prisma.prescription.count({ where: { id } }));
        break;
      case CustomFieldEntity.PHARMACY_BATCH:
        found = Boolean(await this.prisma.medicationBatch.count({ where: { id } }));
        break;
      case CustomFieldEntity.SURGERY:
      case CustomFieldEntity.MATERNITY:
      case CustomFieldEntity.PEDIATRICS:
        found = Boolean(
          await this.prisma.specialtyCase.count({
            where: { id, specialty: entity },
          }),
        );
        break;
      case CustomFieldEntity.RADIOLOGY:
        found = Boolean(await this.prisma.radiologyStudy.count({ where: { id } }));
        break;
      case CustomFieldEntity.SHIFT:
        found = Boolean(await this.prisma.staffShift.count({ where: { id } }));
        break;
      case CustomFieldEntity.ATTENDANCE:
        found = Boolean(await this.prisma.attendanceRecord.count({ where: { id } }));
        break;
      case CustomFieldEntity.PAYROLL:
        found = Boolean(await this.prisma.payrollPeriod.count({ where: { id } }));
        break;
      case CustomFieldEntity.ACCOUNTING:
        found = Boolean(await this.prisma.journalEntry.count({ where: { id } }));
        break;
    }
    if (!found) throw new NotFoundException('Enregistrement associé introuvable.');
  }

  private assertOptions(type: CustomFieldType, options?: string[]) {
    if (type === CustomFieldType.SELECT && (!options || options.length < 2)) {
      throw new BadRequestException('Une liste doit contenir au moins deux options.');
    }
  }

  private assertValue(
    type: CustomFieldType,
    label: string,
    rawOptions: Prisma.JsonValue,
    value: unknown,
  ) {
    if (this.isEmpty(value)) return;
    if (type === CustomFieldType.NUMBER && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new BadRequestException(`« ${label} » doit être un nombre.`);
    }
    if (type === CustomFieldType.BOOLEAN && typeof value !== 'boolean') {
      throw new BadRequestException(`« ${label} » doit être vrai ou faux.`);
    }
    if (
      type === CustomFieldType.DATE &&
      (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    ) {
      throw new BadRequestException(`« ${label} » doit être une date valide.`);
    }
    const textual =
      type === CustomFieldType.TEXT ||
      type === CustomFieldType.TEXTAREA ||
      type === CustomFieldType.SELECT;
    if (textual && typeof value !== 'string') {
      throw new BadRequestException(`« ${label} » doit être un texte.`);
    }
    if (type === CustomFieldType.SELECT) {
      const options = this.jsonOptions(rawOptions);
      if (typeof value !== 'string' || !options.includes(value)) {
        throw new BadRequestException(`Valeur non autorisée pour « ${label} ».`);
      }
    }
  }

  private jsonOptions(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private isEmpty(value: unknown) {
    return value === undefined || value === null || value === '';
  }
}
