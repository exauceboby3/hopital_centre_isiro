'use client';

import {
  Activity,
  BedDouble,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  MessageSquare,
  Pencil,
  Pill,
  Plus,
  Receipt,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Stethoscope,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import NextImage from 'next/image';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Modal } from '@/components/modal';
import { DocumentTemplatePreview } from '@/components/document-template-preview';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { HOSPITAL_PROFILE_UPDATED_EVENT } from '@/lib/branding';
import { currency } from '@/lib/display';
import { assignableAdditionalRoles, hasAnyRole, roleLabels } from '@/lib/roles';
import { Role, User } from '@/lib/types';

interface Overview {
  users: number;
  activeUsers: number;
  services: number;
  activeAlerts: number;
  auditToday: number;
  pendingInvoices: number;
  pendingRevenue: number;
}
interface BillableService {
  id: string;
  code: string;
  name: string;
  category?: string;
  type: string;
  price: string;
  requiresPrepayment: boolean;
  isActive: boolean;
}
interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  ipAddress?: string;
  metadata?: { path?: string; statusCode?: number; role?: string };
  createdAt: string;
  user?: { username: string; role: Role };
}
interface EmergencyAlert {
  id: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  createdAt: string;
  createdBy: { username: string };
}
interface HospitalProfile {
  name: string;
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationNumber?: string;
  currency: string;
  invoiceFooter?: string;
  logoDataUrl?: string | null;
  documentHeader?: string;
  documentAccentColor: string;
  documentPaperSize: string;
  documentOrientation: string;
  documentMarginMm: number;
}
interface PrintTemplate {
  id: string;
  department: string;
  documentType: string;
  title?: string;
  headerText?: string;
  footerText?: string;
  paperSize: string;
  orientation: string;
  marginMm: number;
  accentColor?: string;
  showLogo: boolean;
  isActive: boolean;
}
interface CustomField {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  displayOrder: number;
  isActive: boolean;
}

const initialOverview: Overview = {
  users: 0,
  activeUsers: 0,
  services: 0,
  activeAlerts: 0,
  auditToday: 0,
  pendingInvoices: 0,
  pendingRevenue: 0,
};
const emptyService = {
  code: '',
  name: '',
  category: '',
  type: 'CONSULTATION',
  price: '',
  requiresPrepayment: true,
  isActive: true,
};
const emptyAdmin = {
  username: '',
  password: '',
  role: 'ADMIN' as Role,
  lastName: '',
  postName: '',
  firstName: '',
  specialty: 'Médecine générale',
  grade: '',
  licenseNumber: '',
  phone: '',
  address: '',
};
const sections = ['overview', 'tariffs', 'configuration', 'users', 'audit', 'alerts'] as const;
type Section = (typeof sections)[number];
const emptyProfile: HospitalProfile = {
  name: "Centre Hospitalier d'Isiro",
  legalName: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  registrationNumber: '',
  currency: 'CDF',
  invoiceFooter: '',
  logoDataUrl: null,
  documentHeader: '',
  documentAccentColor: '#167757',
  documentPaperSize: 'A4',
  documentOrientation: 'PORTRAIT',
  documentMarginMm: 12,
};
const emptyPrintTemplate = {
  department: 'CASHIER',
  documentType: 'INVOICE',
  title: 'FACTURE',
  headerText: '',
  footerText: '',
  paperSize: 'A4',
  orientation: 'PORTRAIT',
  marginMm: 12,
  accentColor: '#167757',
  showLogo: true,
  isActive: true,
};
const printTargets = [
  ['CASHIER', 'INVOICE', 'Caisse · Facture'],
  ['CASHIER', 'RECEIPT', 'Caisse · Reçu'],
  ['LABORATORY', 'LAB_RESULT', 'Laboratoire · Résultat'],
  ['CLINICAL', 'CLINICAL_REPORT', 'Soins · Compte rendu'],
  ['BLOOD_BANK', 'TRANSFUSION', 'Transfusion sanguine'],
  ['PROCUREMENT', 'PURCHASE_ORDER', 'Achats · Bon de commande'],
  ['RECORDS', 'PATIENT_RECORD', 'Archives · Dossier patient'],
  ['PHARMACY', 'PRESCRIPTION', 'Pharmacie · Ordonnance'],
  ['SPECIALTY', 'SPECIALTY_REPORT', 'Spécialités · Compte rendu'],
  ['RADIOLOGY', 'RADIOLOGY_REPORT', 'Radiologie · Compte rendu'],
  ['INSURANCE', 'COVERAGE_CERTIFICATE', 'Assurance · Prise en charge'],
  ['PHARMACY', 'INVENTORY_REPORT', 'Pharmacie · Inventaire'],
  ['HUMAN_RESOURCES', 'SHIFT_SCHEDULE', 'RH · Planning de garde'],
  ['HUMAN_RESOURCES', 'ATTENDANCE_REPORT', 'RH · Présence'],
  ['HUMAN_RESOURCES', 'PAYROLL_REPORT', 'RH · Paie'],
  ['ACCOUNTING', 'JOURNAL_ENTRY', 'Comptabilité · Écriture'],
] as const;
const emptyField = {
  entity: 'PATIENT',
  key: '',
  label: '',
  type: 'TEXT',
  required: false,
  options: '',
  displayOrder: '0',
};

export default function AdminPage() {
  const { user, refresh } = useAuth();
  const isAdmin = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']);
  const canViewAudit = user?.role === 'SUPER_ADMIN';
  const [section, setSection] = useState<Section>('overview');
  const [overview, setOverview] = useState(initialOverview);
  const [services, setServices] = useState<BillableService[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [profile, setProfile] = useState<HospitalProfile>(emptyProfile);
  const [printTemplates, setPrintTemplates] = useState<PrintTemplate[]>([]);
  const [printTemplateForm, setPrintTemplateForm] = useState(emptyPrintTemplate);
  const [editingPrintTemplate, setEditingPrintTemplate] = useState<PrintTemplate | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldForm, setFieldForm] = useState(emptyField);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceOpen, setServiceOpen] = useState(false);
  const [editingService, setEditingService] = useState<BillableService | null>(null);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState(emptyAdmin);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    role: 'CASHIER' as Role,
    additionalRoles: [] as Role[],
    isActive: true,
  });
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanup, setCleanup] = useState({ before: '', confirmation: '' });
  const [resetOperationalOpen, setResetOperationalOpen] = useState(false);
  const [resetOperationalConfirmation, setResetOperationalConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        summary,
        serviceRows,
        userRows,
        auditRows,
        alertRows,
        hospital,
        fieldRows,
        templateRows,
      ] = await Promise.all([
        api<Overview>('/admin/overview'),
        api<BillableService[]>('/billing/services?includeInactive=true'),
        api<User[]>('/admin/users'),
        canViewAudit
          ? api<{ items: AuditLog[] }>('/admin/audit-logs?limit=50')
          : Promise.resolve({ items: [] }),
        api<EmergencyAlert[]>('/alerts/history'),
        api<HospitalProfile>('/configuration/hospital-profile'),
        api<CustomField[]>('/configuration/custom-fields?includeInactive=true'),
        api<PrintTemplate[]>('/configuration/print-templates'),
      ]);
      setOverview(summary);
      setServices(serviceRows);
      setUsers(userRows);
      setLogs(auditRows.items);
      setAlerts(alertRows);
      setProfile({ ...emptyProfile, ...hospital });
      setCustomFields(fieldRows);
      setPrintTemplates(templateRows);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, canViewAudit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin) {
    return (
      <section className="panel restricted">
        <ShieldAlert size={36} />
        <h1>Accès réservé</h1>
        <p>Le centre de contrôle est réservé aux administrateurs.</p>
      </section>
    );
  }

  const openService = (service?: BillableService) => {
    setEditingService(service ?? null);
    setServiceForm(
      service
        ? {
            code: service.code,
            name: service.name,
            category: service.category ?? '',
            type: service.type,
            price: service.price,
            requiresPrepayment: service.requiresPrepayment,
            isActive: service.isActive,
          }
        : emptyService,
    );
    setServiceOpen(true);
  };

  const saveService = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        code: serviceForm.code,
        name: serviceForm.name,
        category: serviceForm.category || undefined,
        type: serviceForm.type,
        price: Number(serviceForm.price),
        requiresPrepayment: serviceForm.requiresPrepayment,
        ...(editingService ? { isActive: serviceForm.isActive } : {}),
      };
      await api(editingService ? `/billing/services/${editingService.id}` : '/billing/services', {
        method: editingService ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setServiceOpen(false);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeService = async (service: BillableService) => {
    if (!window.confirm(`Supprimer ou désactiver le tarif « ${service.name} » ?`)) return;
    try {
      await api(`/billing/services/${service.id}`, { method: 'DELETE' });
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Suppression impossible.');
    }
  };

  const updateUser = async (
    target: User,
    patch: { role?: Role; additionalRoles?: Role[]; isActive?: boolean },
  ) => {
    try {
      await api(`/admin/users/${target.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      if (target.id === user?.id) await refresh();
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Mise à jour impossible.');
    }
  };

  const createAdministrator = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api('/admin/users/administrators', {
        method: 'POST',
        body: JSON.stringify(adminForm),
      });
      setAdminOpen(false);
      setAdminForm(emptyAdmin);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Création impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const openUser = (target: User) => {
    setEditingUser(target);
    setUserForm({
      username: target.username,
      password: '',
      role: target.role,
      additionalRoles: target.additionalRoles ?? [],
      isActive: target.isActive,
    });
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    try {
      await api(`/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          username: userForm.username,
          role: userForm.role,
          additionalRoles: userForm.additionalRoles,
          isActive: userForm.isActive,
          password: userForm.password || undefined,
        }),
      });
      if (editingUser.id === user?.id) await refresh();
      setEditingUser(null);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Modification impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const cleanupAudit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api('/admin/audit-logs/cleanup', {
        method: 'POST',
        body: JSON.stringify({ ...cleanup, before: new Date(cleanup.before).toISOString() }),
      });
      setCleanupOpen(false);
      setCleanup({ before: '', confirmation: '' });
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Nettoyage impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetOperationalCycle = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await api('/admin/operational-cycle/reset', {
        method: 'POST',
        body: JSON.stringify({ confirmation: resetOperationalConfirmation }),
      });
      setResetOperationalOpen(false);
      setResetOperationalConfirmation('');
      setNotice(
        'Le nouveau cycle opérationnel a commencé à zéro. Toutes les données précédentes restent conservées dans leurs historiques.',
      );
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Réinitialisation impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const resolveAlert = async (id: string) => {
    await api(`/alerts/${id}/resolve`, { method: 'PATCH' });
    await load();
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const editableProfile = {
        name: profile.name,
        legalName: profile.legalName,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        registrationNumber: profile.registrationNumber,
        currency: profile.currency,
        invoiceFooter: profile.invoiceFooter,
        logoDataUrl: profile.logoDataUrl,
        documentHeader: profile.documentHeader,
        documentAccentColor: profile.documentAccentColor,
        documentPaperSize: profile.documentPaperSize,
        documentOrientation: profile.documentOrientation,
        documentMarginMm: profile.documentMarginMm,
      };
      await api('/configuration/hospital-profile', {
        method: 'PATCH',
        body: JSON.stringify(
          Object.fromEntries(Object.entries(editableProfile).filter(([, value]) => value !== '')),
        ),
      });
      window.dispatchEvent(new CustomEvent(HOSPITAL_PROFILE_UPDATED_EVENT));
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Configuration impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const prepareLogo = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Le logo doit être une image PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > 5_000_000) {
      setError('Le fichier source du logo ne peut pas dépasser 5 Mo.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('Lecture du logo impossible.');
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => setError('Image de logo invalide.');
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL('image/webp', 0.9);
        if (dataUrl.length > 780_000) dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (dataUrl.length > 800_000) {
          setError(
            'Le logo reste trop volumineux après optimisation. Choisissez une image simple.',
          );
          return;
        }
        setError('');
        setProfile((current) => ({ ...current, logoDataUrl: dataUrl }));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const openPrintTemplate = (template?: PrintTemplate) => {
    setEditingPrintTemplate(template ?? null);
    setPrintTemplateForm(
      template
        ? {
            department: template.department,
            documentType: template.documentType,
            title: template.title ?? '',
            headerText: template.headerText ?? '',
            footerText: template.footerText ?? '',
            paperSize: template.paperSize,
            orientation: template.orientation,
            marginMm: template.marginMm,
            accentColor: template.accentColor ?? profile.documentAccentColor,
            showLogo: template.showLogo,
            isActive: template.isActive,
          }
        : { ...emptyPrintTemplate, accentColor: profile.documentAccentColor },
    );
  };

  const savePrintTemplate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api(
        editingPrintTemplate
          ? `/configuration/print-templates/${editingPrintTemplate.id}`
          : '/configuration/print-templates',
        {
          method: editingPrintTemplate ? 'PATCH' : 'POST',
          body: JSON.stringify(
            Object.fromEntries(
              Object.entries(printTemplateForm).filter(([, value]) => value !== ''),
            ),
          ),
        },
      );
      openPrintTemplate();
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Modèle impossible à enregistrer.');
    } finally {
      setSubmitting(false);
    }
  };

  const deactivatePrintTemplate = async (template: PrintTemplate) => {
    await api(`/configuration/print-templates/${template.id}`, { method: 'DELETE' });
    await load();
  };

  const openField = (field?: CustomField) => {
    setEditingField(field ?? null);
    setFieldForm(
      field
        ? {
            entity: field.entity,
            key: field.key,
            label: field.label,
            type: field.type,
            required: field.required,
            options: (field.options ?? []).join(', '),
            displayOrder: String(field.displayOrder),
          }
        : emptyField,
    );
  };

  const saveField = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api(
        editingField
          ? `/configuration/custom-fields/${editingField.id}`
          : '/configuration/custom-fields',
        {
          method: editingField ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...fieldForm,
            displayOrder: Number(fieldForm.displayOrder),
            options:
              fieldForm.type === 'SELECT'
                ? fieldForm.options
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                : undefined,
          }),
        },
      );
      setEditingField(null);
      setFieldForm(emptyField);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Rubrique impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const deactivateField = async (field: CustomField) => {
    await api(`/configuration/custom-fields/${field.id}`, { method: 'DELETE' });
    await load();
  };

  const controlLinks = [
    { href: '/patients', label: 'Patients', icon: Users },
    { href: '/staff', label: 'Personnel', icon: ShieldCheck },
    { href: '/appointments', label: 'Rendez-vous', icon: CalendarDays },
    { href: '/consultations', label: 'Consultations', icon: Stethoscope },
    { href: '/laboratory', label: 'Laboratoire', icon: FlaskConical },
    { href: '/hospitalizations', label: 'Lits et séjours', icon: BedDouble },
    { href: '/billing', label: 'Caisse', icon: Receipt },
    { href: '/pharmacy', label: 'Pharmacie', icon: Pill },
    { href: '/operations', label: 'Services avancés', icon: SlidersHorizontal },
    { href: '/messages', label: 'Messagerie', icon: MessageSquare },
  ];
  const visibleSections = sections.filter((item) => item !== 'audit' || canViewAudit);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Administration globale</span>
          <h1>Centre de contrôle</h1>
          <p>Tarifs, utilisateurs, configuration et urgences depuis un seul espace.</p>
        </div>
        <Settings2 size={30} />
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      <div className="admin-tabs">
        {visibleSections.map((item) => (
          <button
            key={item}
            className={section === item ? 'active' : ''}
            onClick={() => setSection(item)}
          >
            {
              {
                overview: 'Vue globale',
                tariffs: 'Tarifs',
                configuration: 'Configuration',
                users: 'Utilisateurs',
                audit: 'Journal d’audit',
                alerts: 'Urgences',
              }[item]
            }
          </button>
        ))}
      </div>

      {loading ? (
        <div className="panel empty-state">
          <Activity className="spin" /> Chargement…
        </div>
      ) : null}

      {!loading && section === 'overview' && (
        <>
          <section className="metric-grid">
            <article className="metric-card">
              <Users />
              <span>Utilisateurs actifs</span>
              <strong>
                {overview.activeUsers}/{overview.users}
              </strong>
            </article>
            <article className="metric-card">
              <Receipt />
              <span>À recouvrer</span>
              <strong>{currency(overview.pendingRevenue)}</strong>
            </article>
            {canViewAudit && (
              <article className="metric-card">
                <ClipboardList />
                <span>Actions aujourd’hui</span>
                <strong>{overview.auditToday}</strong>
              </article>
            )}
            <article className="metric-card">
              <Siren />
              <span>Urgences actives</span>
              <strong>{overview.activeAlerts}</strong>
            </article>
          </section>
          {user?.role === 'SUPER_ADMIN' && (
            <section className="panel operational-cycle-panel">
              <div className="panel-toolbar">
                <div>
                  <strong>Cycle opérationnel</strong>
                  <span>
                    Remettre à zéro les compteurs courants sans supprimer les données historiques.
                  </span>
                </div>
                <button className="secondary-button" onClick={() => setResetOperationalOpen(true)}>
                  <RotateCcw size={16} /> Repartir à zéro
                </button>
              </div>
            </section>
          )}
          <section className="admin-control-grid">
            {controlLinks.map(({ href, label, icon: Icon }) => (
              <Link href={href} className="panel admin-control-card" key={href}>
                <Icon />
                <strong>{label}</strong>
                <span>Ouvrir et administrer</span>
              </Link>
            ))}
          </section>
        </>
      )}

      {!loading && section === 'tariffs' && (
        <section className="panel table-panel">
          <div className="panel-toolbar">
            <div>
              <strong>Catalogue tarifaire</strong>
              <span>{services.length} tarif(s)</span>
            </div>
            <button className="primary-button" onClick={() => openService()}>
              <Plus size={17} /> Ajouter
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Acte</th>
                  <th>Catégorie</th>
                  <th>Prix</th>
                  <th>État</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <span className="record-number">{service.code}</span>
                    </td>
                    <td>
                      <strong>{service.name}</strong>
                    </td>
                    <td>
                      <strong>{service.type}</strong>
                      {service.category && <span className="muted">{service.category}</span>}
                    </td>
                    <td>{currency(service.price)}</td>
                    <td>
                      <StatusBadge status={service.isActive ? 'ACTIVE' : 'CANCELLED'} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="text-button" onClick={() => openService(service)}>
                          <Pencil size={14} /> Modifier
                        </button>
                        <button
                          className="text-button danger"
                          onClick={() => void removeService(service)}
                        >
                          <Trash2 size={14} /> Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && section === 'users' && (
        <section className="panel table-panel">
          <div className="panel-toolbar">
            <div>
              <strong>Comptes et pouvoirs</strong>
              <span>Changer le rôle déplace immédiatement les permissions.</span>
            </div>
            {user?.role === 'SUPER_ADMIN' && (
              <button className="primary-button" onClick={() => setAdminOpen(true)}>
                <Plus size={17} /> Administrateur
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôles</th>
                  <th>État</th>
                  <th>Dernière activité</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((target) => (
                  <tr key={target.id}>
                    <td>
                      <strong>{target.username}</strong>
                    </td>
                    <td>
                      <select
                        value={target.role}
                        disabled={target.role === 'SUPER_ADMIN' && user?.role !== 'SUPER_ADMIN'}
                        onChange={(event) =>
                          void updateUser(target, { role: event.target.value as Role })
                        }
                      >
                        {Object.entries(roleLabels)
                          .filter(
                            ([role]) =>
                              role !== 'SECRETARY' && (canViewAudit || role !== 'SUPER_ADMIN'),
                          )
                          .map(([role, label]) => (
                            <option value={role} key={role}>
                              {label}
                            </option>
                          ))}
                      </select>
                      {(target.additionalRoles ?? []).length > 0 && (
                        <small>
                          +{' '}
                          {(target.additionalRoles ?? [])
                            .map((role) => roleLabels[role])
                            .join(', ')}
                        </small>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={target.isActive ? 'ACTIVE' : 'CANCELLED'} />
                    </td>
                    <td>
                      {target.lastActiveAt
                        ? new Intl.DateTimeFormat('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(target.lastActiveAt))
                        : 'Jamais'}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="text-button" onClick={() => openUser(target)}>
                          <Pencil size={14} /> Modifier
                        </button>
                        <button
                          className={target.isActive ? 'text-button danger' : 'text-button'}
                          disabled={target.id === user?.id}
                          onClick={() => void updateUser(target, { isActive: !target.isActive })}
                        >
                          {target.isActive ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && section === 'configuration' && (
        <div className="admin-config-grid">
          <section className="panel">
            <div className="panel-toolbar">
              <div>
                <strong>Identité de l’hôpital</strong>
                <span>En-tête des factures, reçus et résultats.</span>
              </div>
            </div>
            <form onSubmit={saveProfile}>
              <div className="form-grid">
                <div className="field full admin-logo-field">
                  <span>Logo officiel</span>
                  <div className="admin-logo-control">
                    <div className="admin-logo-preview">
                      {profile.logoDataUrl ? (
                        <NextImage
                          unoptimized
                          src={profile.logoDataUrl}
                          alt="Aperçu du logo"
                          width={96}
                          height={96}
                        />
                      ) : (
                        <strong>CHI</strong>
                      )}
                    </div>
                    <div>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => prepareLogo(event.target.files?.[0])}
                      />
                      <small>
                        PNG, JPEG ou WebP. Redimensionnement automatique pour l’impression.
                      </small>
                      {profile.logoDataUrl && (
                        <button
                          type="button"
                          className="text-button danger"
                          onClick={() => setProfile({ ...profile, logoDataUrl: null })}
                        >
                          Retirer le logo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <label className="field full">
                  <span>Nom *</span>
                  <input
                    required
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  />
                </label>
                <label className="field full">
                  <span>Dénomination légale</span>
                  <input
                    value={profile.legalName ?? ''}
                    onChange={(e) => setProfile({ ...profile, legalName: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Téléphone</span>
                  <input
                    value={profile.phone ?? ''}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={profile.email ?? ''}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  />
                </label>
                <label className="field full">
                  <span>Adresse</span>
                  <input
                    value={profile.address ?? ''}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>N° d’enregistrement</span>
                  <input
                    value={profile.registrationNumber ?? ''}
                    onChange={(e) => setProfile({ ...profile, registrationNumber: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Devise</span>
                  <input
                    maxLength={3}
                    value={profile.currency}
                    onChange={(e) =>
                      setProfile({ ...profile, currency: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label className="field full">
                  <span>Pied de page des documents</span>
                  <textarea
                    rows={3}
                    value={profile.invoiceFooter ?? ''}
                    onChange={(e) => setProfile({ ...profile, invoiceFooter: e.target.value })}
                  />
                </label>
                <label className="field full">
                  <span>Texte général sous l’en-tête</span>
                  <textarea
                    rows={2}
                    value={profile.documentHeader ?? ''}
                    onChange={(e) => setProfile({ ...profile, documentHeader: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Couleur des documents</span>
                  <input
                    type="color"
                    value={profile.documentAccentColor}
                    onChange={(e) =>
                      setProfile({ ...profile, documentAccentColor: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Format par défaut</span>
                  <select
                    value={profile.documentPaperSize}
                    onChange={(e) => setProfile({ ...profile, documentPaperSize: e.target.value })}
                  >
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="LETTER">Letter</option>
                  </select>
                </label>
                <label className="field">
                  <span>Orientation</span>
                  <select
                    value={profile.documentOrientation}
                    onChange={(e) =>
                      setProfile({ ...profile, documentOrientation: e.target.value })
                    }
                  >
                    <option value="PORTRAIT">Portrait</option>
                    <option value="LANDSCAPE">Paysage</option>
                  </select>
                </label>
                <label className="field">
                  <span>Marge (mm)</span>
                  <input
                    type="number"
                    min="5"
                    max="30"
                    value={profile.documentMarginMm}
                    onChange={(e) =>
                      setProfile({ ...profile, documentMarginMm: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button className="primary-button" disabled={submitting}>
                  Enregistrer l’identité
                </button>
              </div>
            </form>
          </section>
          <section className="panel">
            <div className="panel-toolbar">
              <div>
                <strong>Rubriques personnalisées des formulaires</strong>
                <span>
                  Ajoutez des coordonnées, critères d’accueil ou champs métier sans modifier le
                  code.
                </span>
              </div>
            </div>
            {isAdmin && (
              <form onSubmit={saveField}>
                <div className="form-grid">
                  <label className="field">
                    <span>Formulaire *</span>
                    <select
                      value={fieldForm.entity}
                      onChange={(e) => setFieldForm({ ...fieldForm, entity: e.target.value })}
                    >
                      <option value="PATIENT">Dossier patient</option>
                      <option value="STAFF">Personnel</option>
                      <option value="APPOINTMENT">Rendez-vous</option>
                      <option value="CONSULTATION">Consultation</option>
                      <option value="LABORATORY">Laboratoire</option>
                      <option value="HOSPITALIZATION">Hospitalisation</option>
                      <option value="INVOICE">Facture</option>
                      <option value="CARE_VOUCHER">Bon de soins</option>
                      <option value="NURSING_CARE">Soin infirmier</option>
                      <option value="PRESCRIPTION">Ordonnance</option>
                      <option value="PHARMACY_BATCH">Lot de pharmacie</option>
                      <option value="SURGERY">Chirurgie</option>
                      <option value="MATERNITY">Maternité</option>
                      <option value="PEDIATRICS">Pédiatrie</option>
                      <option value="RADIOLOGY">Radiologie</option>
                      <option value="SHIFT">Garde</option>
                      <option value="ATTENDANCE">Présence</option>
                      <option value="PAYROLL">Paie</option>
                      <option value="ACCOUNTING">Comptabilité</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Type *</span>
                    <select
                      value={fieldForm.type}
                      onChange={(e) => setFieldForm({ ...fieldForm, type: e.target.value })}
                    >
                      {['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'].map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Clé technique *</span>
                    <input
                      required
                      pattern="[a-z][a-z0-9_]{1,49}"
                      value={fieldForm.key}
                      onChange={(e) =>
                        setFieldForm({ ...fieldForm, key: e.target.value.toLowerCase() })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Libellé *</span>
                    <input
                      required
                      value={fieldForm.label}
                      onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
                    />
                  </label>
                  {fieldForm.type === 'SELECT' && (
                    <label className="field full">
                      <span>Options séparées par des virgules *</span>
                      <input
                        required
                        value={fieldForm.options}
                        onChange={(e) => setFieldForm({ ...fieldForm, options: e.target.value })}
                      />
                    </label>
                  )}
                  <label className="field">
                    <span>Ordre</span>
                    <input
                      type="number"
                      min="0"
                      value={fieldForm.displayOrder}
                      onChange={(e) => setFieldForm({ ...fieldForm, displayOrder: e.target.value })}
                    />
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={fieldForm.required}
                      onChange={(e) => setFieldForm({ ...fieldForm, required: e.target.checked })}
                    />{' '}
                    Obligatoire
                  </label>
                </div>
                <div className="modal-actions">
                  {editingField && (
                    <button type="button" className="secondary-button" onClick={() => openField()}>
                      Annuler
                    </button>
                  )}
                  <button className="primary-button" disabled={submitting}>
                    {editingField ? 'Modifier' : 'Ajouter la rubrique'}
                  </button>
                </div>
              </form>
            )}
            <div className="config-field-list">
              {customFields.map((field) => (
                <article key={field.id} className="config-field-row">
                  <div>
                    <strong>{field.label}</strong>
                    <span>
                      {field.entity} · {field.type} · {field.key}
                    </span>
                  </div>
                  <StatusBadge status={field.isActive ? 'ACTIVE' : 'CANCELLED'} />
                  {isAdmin && (
                    <div className="row-actions">
                      <button className="text-button" onClick={() => openField(field)}>
                        Modifier
                      </button>
                      {field.isActive && (
                        <button
                          className="text-button danger"
                          onClick={() => void deactivateField(field)}
                        >
                          Désactiver
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="panel admin-config-wide">
            <div className="panel-toolbar">
              <div>
                <strong>Modèles d’impression par département</strong>
                <span>
                  Personnalisez le titre, le logo, les couleurs, le papier, l’orientation et les
                  marges de chaque document.
                </span>
              </div>
            </div>
            <form onSubmit={savePrintTemplate}>
              <div className="form-grid">
                <label className="field full">
                  <span>Document standard</span>
                  <select
                    value={
                      printTargets.some(
                        ([department, documentType]) =>
                          department === printTemplateForm.department &&
                          documentType === printTemplateForm.documentType,
                      )
                        ? `${printTemplateForm.department}|${printTemplateForm.documentType}`
                        : 'CUSTOM'
                    }
                    onChange={(event) => {
                      if (event.target.value === 'CUSTOM') return;
                      const [department, documentType] = event.target.value.split('|');
                      if (!department || !documentType) return;
                      setPrintTemplateForm({
                        ...printTemplateForm,
                        department,
                        documentType,
                      });
                    }}
                  >
                    {printTargets.map(([department, documentType, label]) => (
                      <option
                        key={`${department}-${documentType}`}
                        value={`${department}|${documentType}`}
                      >
                        {label}
                      </option>
                    ))}
                    <option value="CUSTOM">Autre modèle personnalisé</option>
                  </select>
                </label>
                <label className="field">
                  <span>Département *</span>
                  <input
                    required
                    pattern="[A-Z][A-Z0-9_]{1,49}"
                    value={printTemplateForm.department}
                    onChange={(event) =>
                      setPrintTemplateForm({
                        ...printTemplateForm,
                        department: event.target.value.toUpperCase().replaceAll(' ', '_'),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Type de document *</span>
                  <input
                    required
                    pattern="[A-Z][A-Z0-9_]{1,59}"
                    value={printTemplateForm.documentType}
                    onChange={(event) =>
                      setPrintTemplateForm({
                        ...printTemplateForm,
                        documentType: event.target.value.toUpperCase().replaceAll(' ', '_'),
                      })
                    }
                  />
                </label>
                <label className="field full">
                  <span>Titre imprimé</span>
                  <input
                    value={printTemplateForm.title}
                    onChange={(event) =>
                      setPrintTemplateForm({ ...printTemplateForm, title: event.target.value })
                    }
                  />
                </label>
                <label className="field full">
                  <span>Texte d’en-tête propre à ce document</span>
                  <textarea
                    rows={2}
                    value={printTemplateForm.headerText}
                    onChange={(event) =>
                      setPrintTemplateForm({ ...printTemplateForm, headerText: event.target.value })
                    }
                  />
                </label>
                <label className="field full">
                  <span>Pied de page propre à ce document</span>
                  <textarea
                    rows={2}
                    value={printTemplateForm.footerText}
                    onChange={(event) =>
                      setPrintTemplateForm({ ...printTemplateForm, footerText: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Papier</span>
                  <select
                    value={printTemplateForm.paperSize}
                    onChange={(event) =>
                      setPrintTemplateForm({ ...printTemplateForm, paperSize: event.target.value })
                    }
                  >
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="LETTER">Letter</option>
                  </select>
                </label>
                <label className="field">
                  <span>Orientation</span>
                  <select
                    value={printTemplateForm.orientation}
                    onChange={(event) =>
                      setPrintTemplateForm({
                        ...printTemplateForm,
                        orientation: event.target.value,
                      })
                    }
                  >
                    <option value="PORTRAIT">Portrait</option>
                    <option value="LANDSCAPE">Paysage</option>
                  </select>
                </label>
                <label className="field">
                  <span>Marge (mm)</span>
                  <input
                    type="number"
                    min="5"
                    max="30"
                    value={printTemplateForm.marginMm}
                    onChange={(event) =>
                      setPrintTemplateForm({
                        ...printTemplateForm,
                        marginMm: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Couleur</span>
                  <input
                    type="color"
                    value={printTemplateForm.accentColor}
                    onChange={(event) =>
                      setPrintTemplateForm({
                        ...printTemplateForm,
                        accentColor: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={printTemplateForm.showLogo}
                    onChange={(event) =>
                      setPrintTemplateForm({ ...printTemplateForm, showLogo: event.target.checked })
                    }
                  />{' '}
                  Afficher le logo
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={printTemplateForm.isActive}
                    onChange={(event) =>
                      setPrintTemplateForm({ ...printTemplateForm, isActive: event.target.checked })
                    }
                  />{' '}
                  Modèle actif
                </label>
              </div>
              <div className="modal-actions">
                {editingPrintTemplate && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openPrintTemplate()}
                  >
                    Annuler
                  </button>
                )}
                <button className="primary-button" disabled={submitting}>
                  {editingPrintTemplate ? 'Modifier le modèle' : 'Ajouter le modèle'}
                </button>
              </div>
            </form>
            <DocumentTemplatePreview profile={profile} template={printTemplateForm} />
            <div className="config-field-list print-template-list">
              {printTemplates.map((template) => (
                <article key={template.id} className="config-field-row">
                  <div>
                    <strong>{template.title || template.documentType}</strong>
                    <span>
                      {template.department} · {template.documentType} · {template.paperSize}{' '}
                      {template.orientation}
                    </span>
                  </div>
                  <StatusBadge status={template.isActive ? 'ACTIVE' : 'CANCELLED'} />
                  <div className="row-actions">
                    <button className="text-button" onClick={() => openPrintTemplate(template)}>
                      Modifier
                    </button>
                    {template.isActive && (
                      <button
                        className="text-button danger"
                        onClick={() => void deactivatePrintTemplate(template)}
                      >
                        Désactiver
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!printTemplates.length && (
                <p className="muted">
                  Aucun modèle spécifique : les réglages généraux sont appliqués à tous les
                  documents.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {!loading && canViewAudit && section === 'audit' && (
        <section className="panel table-panel">
          <div className="panel-toolbar">
            <div>
              <strong>Journal immuable des actions</strong>
              <span>Succès et tentatives échouées sont enregistrés.</span>
            </div>
            {user?.role === 'SUPER_ADMIN' && (
              <button className="secondary-button danger" onClick={() => setCleanupOpen(true)}>
                <Trash2 size={16} /> Nettoyer
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Utilisateur</th>
                  <th>Action</th>
                  <th>Entité</th>
                  <th>Chemin</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {!logs.length && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Aucune action enregistrée.
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      {new Intl.DateTimeFormat('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'medium',
                      }).format(new Date(log.createdAt))}
                    </td>
                    <td>
                      {log.user?.username ?? 'Système'}
                      <br />
                      <span className="muted">{log.user?.role}</span>
                    </td>
                    <td>
                      <StatusBadge
                        status={log.action.endsWith('SUCCESS') ? 'ACTIVE' : 'CANCELLED'}
                      />{' '}
                      <span className="muted">{log.action}</span>
                    </td>
                    <td>{log.entity}</td>
                    <td>{log.metadata?.path ?? '—'}</td>
                    <td>{log.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && section === 'alerts' && (
        <section className="panel table-panel">
          <div className="panel-toolbar">
            <div>
              <strong>Historique des urgences</strong>
              <span>Diffusion, auteur et résolution.</span>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Alerte</th>
                  <th>Niveau</th>
                  <th>Auteur</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      {new Intl.DateTimeFormat('fr-FR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(alert.createdAt))}
                    </td>
                    <td>
                      <strong>{alert.title}</strong>
                      <br />
                      <span className="muted">{alert.message}</span>
                    </td>
                    <td>{alert.severity}</td>
                    <td>{alert.createdBy.username}</td>
                    <td>
                      <StatusBadge status={alert.status} />
                    </td>
                    <td>
                      {alert.status === 'ACTIVE' && (
                        <button className="text-button" onClick={() => void resolveAlert(alert.id)}>
                          Résoudre
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {serviceOpen && (
        <Modal
          title={editingService ? 'Modifier le tarif' : 'Ajouter un tarif'}
          eyebrow="Catalogue financier"
          onClose={() => setServiceOpen(false)}
        >
          <form onSubmit={saveService}>
            <div className="form-grid">
              <label className="field">
                <span>Code *</span>
                <input
                  required
                  value={serviceForm.code}
                  onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Type d’acte *</span>
                <select
                  value={serviceForm.type}
                  onChange={(e) => setServiceForm({ ...serviceForm, type: e.target.value })}
                >
                  <option value="CONSULTATION">Consultation</option>
                  <option value="LABORATORY">Laboratoire</option>
                  <option value="HOSPITALIZATION">Hospitalisation</option>
                  <option value="PROCEDURE">Procédure</option>
                  <option value="RADIOLOGY">Radiologie / imagerie</option>
                  <option value="SURGERY">Chirurgie</option>
                  <option value="MATERNITY">Maternité</option>
                  <option value="PEDIATRICS">Pédiatrie</option>
                  <option value="BLOOD_BANK">Transfusion sanguine</option>
                  <option value="OTHER">Autre</option>
                </select>
              </label>
              {serviceForm.type === 'LABORATORY' && (
                <label className="field full">
                  <span>Catégorie de laboratoire</span>
                  <input
                    placeholder="Ex. Hématologie, Biochimie, Sérologie…"
                    value={serviceForm.category}
                    onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                  />
                </label>
              )}
              <label className="field full">
                <span>Libellé *</span>
                <input
                  required
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Prix CDF *</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={serviceForm.requiresPrepayment}
                  onChange={(e) =>
                    setServiceForm({ ...serviceForm, requiresPrepayment: e.target.checked })
                  }
                />{' '}
                Paiement préalable obligatoire
              </label>
              {editingService && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={serviceForm.isActive}
                    onChange={(e) => setServiceForm({ ...serviceForm, isActive: e.target.checked })}
                  />{' '}
                  Tarif actif
                </label>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setServiceOpen(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {adminOpen && (
        <Modal
          title="Créer un compte administratif"
          eyebrow="Super-administration"
          onClose={() => setAdminOpen(false)}
        >
          <form onSubmit={createAdministrator}>
            <div className="form-grid">
              <label className="field">
                <span>Identifiant *</span>
                <input
                  required
                  minLength={3}
                  value={adminForm.username}
                  onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Rôle *</span>
                <select
                  value={adminForm.role}
                  onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value as Role })}
                >
                  <option value="ADMIN">Administrateur</option>
                  <option value="SUPER_ADMIN">Super-administrateur</option>
                </select>
              </label>
              <label className="field full">
                <span>Mot de passe temporaire *</span>
                <input
                  required
                  type="password"
                  minLength={12}
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                />
              </label>
              {adminForm.role === 'ADMIN' && (
                <>
                  <label className="field">
                    <span>Nom du médecin *</span>
                    <input
                      required
                      value={adminForm.lastName}
                      onChange={(event) =>
                        setAdminForm({ ...adminForm, lastName: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Post-nom</span>
                    <input
                      value={adminForm.postName}
                      onChange={(event) =>
                        setAdminForm({ ...adminForm, postName: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Prénom</span>
                    <input
                      value={adminForm.firstName}
                      onChange={(event) =>
                        setAdminForm({ ...adminForm, firstName: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Spécialité médicale *</span>
                    <input
                      required
                      value={adminForm.specialty}
                      onChange={(event) =>
                        setAdminForm({ ...adminForm, specialty: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Grade</span>
                    <input
                      value={adminForm.grade}
                      onChange={(event) =>
                        setAdminForm({ ...adminForm, grade: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Numéro professionnel</span>
                    <input
                      value={adminForm.licenseNumber}
                      onChange={(event) =>
                        setAdminForm({ ...adminForm, licenseNumber: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Téléphone</span>
                    <input
                      value={adminForm.phone}
                      onChange={(event) =>
                        setAdminForm({ ...adminForm, phone: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Adresse</span>
                    <input
                      value={adminForm.address}
                      onChange={(event) =>
                        setAdminForm({ ...adminForm, address: event.target.value })
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAdminOpen(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Créer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingUser && (
        <Modal
          title={`Modifier ${editingUser.username}`}
          eyebrow="Compte et permissions"
          onClose={() => setEditingUser(null)}
        >
          <form onSubmit={saveUser}>
            <div className="form-grid">
              <label className="field">
                <span>Identifiant *</span>
                <input
                  required
                  minLength={3}
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Rôle *</span>
                <select
                  value={userForm.role}
                  disabled={editingUser.role === 'SUPER_ADMIN' && user?.role !== 'SUPER_ADMIN'}
                  onChange={(e) => {
                    const role = e.target.value as Role;
                    setUserForm({
                      ...userForm,
                      role,
                      additionalRoles: userForm.additionalRoles.filter((item) => item !== role),
                    });
                  }}
                >
                  {Object.entries(roleLabels)
                    .filter(
                      ([role]) => role !== 'SECRETARY' && (canViewAudit || role !== 'SUPER_ADMIN'),
                    )
                    .map(([role, label]) => (
                      <option value={role} key={role}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <div className="field full">
                <span>Rôles supplémentaires</span>
                <div className="role-checkboxes">
                  {assignableAdditionalRoles
                    .filter((role) => role !== userForm.role)
                    .map((role) => (
                      <label className="checkbox-field" key={role}>
                        <input
                          type="checkbox"
                          checked={userForm.additionalRoles.includes(role)}
                          disabled={
                            editingUser.role === 'SUPER_ADMIN' && user?.role !== 'SUPER_ADMIN'
                          }
                          onChange={(event) =>
                            setUserForm({
                              ...userForm,
                              additionalRoles: event.target.checked
                                ? [...userForm.additionalRoles, role]
                                : userForm.additionalRoles.filter((item) => item !== role),
                            })
                          }
                        />
                        {roleLabels[role]}
                      </label>
                    ))}
                </div>
                <small>La personne obtient les permissions de chaque rôle coché.</small>
              </div>
              <label className="field full">
                <span>Nouveau mot de passe</span>
                <input
                  type="password"
                  minLength={12}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                />
                <small>Laisser vide pour conserver le mot de passe actuel.</small>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={userForm.isActive}
                  disabled={editingUser.id === user?.id}
                  onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                />{' '}
                Compte actif
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditingUser(null)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {cleanupOpen && (
        <Modal
          title="Nettoyer le journal"
          eyebrow="Action réservée au super-administrateur"
          onClose={() => setCleanupOpen(false)}
        >
          <form onSubmit={cleanupAudit}>
            <div className="alert error">
              Les traces antérieures à la date choisie seront définitivement supprimées. Une
              nouvelle trace de ce nettoyage sera conservée.
            </div>
            <div className="form-grid">
              <label className="field full">
                <span>Supprimer avant le *</span>
                <input
                  required
                  type="datetime-local"
                  value={cleanup.before}
                  onChange={(e) => setCleanup({ ...cleanup, before: e.target.value })}
                />
              </label>
              <label className="field full">
                <span>Écrire NETTOYER *</span>
                <input
                  required
                  value={cleanup.confirmation}
                  onChange={(e) => setCleanup({ ...cleanup, confirmation: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCleanupOpen(false)}
              >
                Annuler
              </button>
              <button
                className="primary-button"
                disabled={submitting || cleanup.confirmation !== 'NETTOYER'}
              >
                Nettoyer définitivement
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resetOperationalOpen && (
        <Modal
          title="Réinitialiser l’activité courante"
          eyebrow="Action réservée au super-administrateur"
          onClose={() => setResetOperationalOpen(false)}
        >
          <form onSubmit={resetOperationalCycle}>
            <div className="alert info">
              Les compteurs des patients, rendez-vous, files d’attente, consultations, examens de
              laboratoire et hospitalisations repartiront à zéro. Tous les anciens dossiers, soins,
              factures, paiements, stocks, présences, comptes et utilisateurs resteront conservés.
            </div>
            <div className="form-grid">
              <label className="field full">
                <span>Écrire REINITIALISER *</span>
                <input
                  required
                  autoComplete="off"
                  value={resetOperationalConfirmation}
                  onChange={(event) => setResetOperationalConfirmation(event.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setResetOperationalOpen(false)}
              >
                Annuler
              </button>
              <button
                className="primary-button"
                disabled={submitting || resetOperationalConfirmation !== 'REINITIALISER'}
              >
                Commencer le nouveau cycle
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
