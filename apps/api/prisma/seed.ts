import {
  BillableServiceType,
  CareAuthorizationStatus,
  CustomFieldEntity,
  CustomFieldType,
  InvoiceStatus,
  LedgerAccountType,
  PrismaClient,
  Role,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { laboratoryCatalog } from './laboratory-catalog';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const username = (
    process.env.SEED_SUPER_ADMIN_USERNAME ?? process.env.SEED_ADMIN_USERNAME
  )?.trim();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;

  if (!username || !password || password.length < 12 || password.startsWith('replace-with-')) {
    throw new Error(
      'SEED_SUPER_ADMIN_USERNAME et SEED_SUPER_ADMIN_PASSWORD (12 caractères minimum) doivent être configurés.',
    );
  }

  const passwordHash = await argon2.hash(password);
  const superAdmin = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, role: Role.SUPER_ADMIN, isActive: true },
    create: { username, passwordHash, role: Role.SUPER_ADMIN },
  });

  const patientIdentityFields = [
    {
      key: 'education_level',
      label: "Niveau d'études",
      type: CustomFieldType.SELECT,
      options: ['Aucun', 'Primaire', 'Secondaire', 'Supérieur', 'Universitaire', 'Autre'],
      displayOrder: 10,
    },
    {
      key: 'profession',
      label: 'Profession',
      type: CustomFieldType.TEXT,
      displayOrder: 20,
    },
    {
      key: 'religion',
      label: 'Religion',
      type: CustomFieldType.TEXT,
      displayOrder: 30,
    },
    {
      key: 'marital_status',
      label: 'État civil',
      type: CustomFieldType.SELECT,
      options: ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf/Veuve', 'Union libre'],
      displayOrder: 40,
    },
    {
      key: 'email',
      label: 'Adresse e-mail',
      type: CustomFieldType.TEXT,
      displayOrder: 50,
    },
    {
      key: 'guardian_name',
      label: 'Responsable légal / accompagnant',
      type: CustomFieldType.TEXT,
      helpText: 'À compléter pour un mineur ou un patient dépendant.',
      displayOrder: 60,
    },
    {
      key: 'guardian_phone',
      label: 'Téléphone du responsable légal',
      type: CustomFieldType.TEXT,
      displayOrder: 70,
    },
  ];
  for (const field of patientIdentityFields) {
    await prisma.customFieldDefinition.upsert({
      where: { entity_key: { entity: CustomFieldEntity.PATIENT, key: field.key } },
      update: {
        label: field.label,
        type: field.type,
        options: field.options ?? undefined,
        helpText: field.helpText,
        displayOrder: field.displayOrder,
        isActive: true,
      },
      create: {
        entity: CustomFieldEntity.PATIENT,
        key: field.key,
        label: field.label,
        type: field.type,
        options: field.options ?? undefined,
        helpText: field.helpText,
        displayOrder: field.displayOrder,
        isActive: true,
        createdById: superAdmin.id,
      },
    });
  }

  const routineLabFee = Number(process.env.DEFAULT_LAB_FEE_CDF ?? 15000);
  const specializedLabFee = Number(process.env.DEFAULT_SPECIALIZED_LAB_FEE_CDF ?? 25000);
  const tariffs = [
    {
      code: 'PAT-FILE-MONTHLY',
      name: 'Fiche patient mensuelle',
      category: 'Dossier patient',
      type: BillableServiceType.OTHER,
      price: Number(process.env.DEFAULT_PATIENT_FILE_FEE_CDF ?? 5000),
      requiresPrepayment: true,
    },
    {
      code: 'CONS-GEN',
      name: 'Consultation générale',
      category: 'Consultation',
      type: BillableServiceType.CONSULTATION,
      price: 0,
      requiresPrepayment: false,
    },
    ...laboratoryCatalog.map((exam) => ({
      code: exam.code,
      name: exam.name,
      category: exam.category,
      type: BillableServiceType.LABORATORY,
      price: exam.priceTier === 'SPECIALIZED' ? specializedLabFee : routineLabFee,
      requiresPrepayment: true,
    })),
    {
      code: 'HOSP-DEP',
      name: "Frais préalables d'hospitalisation",
      category: 'Hospitalisation',
      type: BillableServiceType.HOSPITALIZATION,
      price: Number(process.env.DEFAULT_HOSPITALIZATION_FEE_CDF ?? 50000),
      requiresPrepayment: false,
    },
    {
      code: 'RAD-ECHO',
      name: 'Échographie standard',
      category: 'Imagerie',
      type: BillableServiceType.RADIOLOGY,
      price: 30000,
      requiresPrepayment: true,
    },
    {
      code: 'PROC-CHIR',
      name: 'Acte chirurgical — tarif à préciser',
      category: 'Chirurgie',
      type: BillableServiceType.SURGERY,
      price: 0,
      requiresPrepayment: true,
    },
    {
      code: 'MAT-ACC',
      name: 'Prise en charge accouchement',
      category: 'Maternité',
      type: BillableServiceType.MATERNITY,
      price: 75000,
      requiresPrepayment: true,
    },
    {
      code: 'PED-CONS',
      name: 'Consultation pédiatrique',
      category: 'Consultation',
      type: BillableServiceType.PEDIATRICS,
      price: 0,
      requiresPrepayment: false,
    },
    {
      code: 'SANG-TRANS',
      name: 'Service de transfusion sanguine',
      category: 'Transfusion sanguine',
      type: BillableServiceType.BLOOD_BANK,
      price: 25000,
      requiresPrepayment: true,
    },
  ];
  for (const tariff of tariffs) {
    await prisma.billableService.upsert({
      where: { code: tariff.code },
      update: {
        name: tariff.name,
        category: tariff.category,
        type: tariff.type,
        price: tariff.price,
        requiresPrepayment: tariff.requiresPrepayment,
        isActive: true,
      },
      create: tariff,
    });
  }

  const includedConsultationServices = await prisma.billableService.findMany({
    where: { code: { in: ['CONS-GEN', 'PED-CONS'] } },
    select: { id: true },
  });
  const includedConsultationServiceIds = includedConsultationServices.map((service) => service.id);
  if (includedConsultationServiceIds.length > 0) {
    await prisma.$transaction([
      prisma.careAuthorization.updateMany({
        where: {
          serviceId: { in: includedConsultationServiceIds },
          status: CareAuthorizationStatus.PENDING,
          invoice: { status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.PENDING] } },
        },
        data: { status: CareAuthorizationStatus.CANCELLED },
      }),
      prisma.invoice.updateMany({
        where: {
          careAuthorization: { serviceId: { in: includedConsultationServiceIds } },
          status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.PENDING] },
        },
        data: {
          status: InvoiceStatus.CANCELLED,
          notes: 'Ancien frais de consultation annulé : l’accès est désormais contrôlé par la fiche patient active.',
        },
      }),
    ]);
  }

  await prisma.hospitalProfile.upsert({
    where: { id: 'main' },
    update: {},
    create: {
      id: 'main',
      name: "Centre Hospitalier d'Isiro",
      currency: 'CDF',
      invoiceFooter: 'Merci pour votre confiance. Conservez ce document.',
    },
  });

  const ledgerAccounts = [
    { code: '1000', name: 'Caisse', type: LedgerAccountType.ASSET },
    { code: '1100', name: 'Banque', type: LedgerAccountType.ASSET },
    { code: '1200', name: 'Créances assureurs', type: LedgerAccountType.ASSET },
    { code: '2000', name: 'Dettes fournisseurs', type: LedgerAccountType.LIABILITY },
    { code: '3000', name: 'Fonds propres', type: LedgerAccountType.EQUITY },
    { code: '4000', name: 'Revenus des soins', type: LedgerAccountType.REVENUE },
    { code: '5000', name: 'Achats de pharmacie', type: LedgerAccountType.EXPENSE },
    { code: '6000', name: 'Salaires et charges', type: LedgerAccountType.EXPENSE },
    { code: '6100', name: 'Courant et électricité', type: LedgerAccountType.EXPENSE },
    { code: '6110', name: 'Eau', type: LedgerAccountType.EXPENSE },
    { code: '6120', name: 'Connexion Internet', type: LedgerAccountType.EXPENSE },
  ];
  for (const account of ledgerAccounts) {
    await prisma.ledgerAccount.upsert({
      where: { code: account.code },
      update: {},
      create: account,
    });
  }

  console.info(
    `Compte super-administrateur « ${username} », fiche patient mensuelle, tarifs et plan comptable initialisés.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
