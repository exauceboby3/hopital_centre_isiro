'use client';

import { Activity, CalendarClock, Plus, ShieldAlert, UserCheck, UserCog, Wifi } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatHospitalTime, hospitalDateKey, matchesSearch, patientName } from '@/lib/display';
import { hasAnyRole, roleLabels } from '@/lib/roles';
import { Role, User } from '@/lib/types';

interface Profile {
  lastName: string;
  postName?: string;
  firstName?: string;
  specialty?: string;
  phone?: string;
}
interface StaffUser extends User {
  doctorProfile?: Profile;
  nurseProfile?: Profile;
  secretaryProfile?: Profile;
  labProfile?: Profile;
  staffProfile?: Profile;
}
interface Attendance {
  id: string;
  date: string;
  status: string;
  clockIn?: string;
  clockOut?: string;
  employee: { id: string; username: string; role: Role };
}
interface Shift {
  id: string;
  service: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  status: string;
  employee: { id: string; username: string; role: Role; additionalRoles?: Role[] };
}
interface StaffForm {
  username: string;
  password: string;
  role: Role;
  lastName: string;
  postName: string;
  firstName: string;
  specialty: string;
  grade: string;
  licenseNumber: string;
  educationLevel: string;
  phone: string;
  address: string;
}
const emptyForm: StaffForm = {
  username: '',
  password: '',
  role: 'DOCTOR',
  lastName: '',
  postName: '',
  firstName: '',
  specialty: '',
  grade: '',
  licenseNumber: '',
  educationLevel: '',
  phone: '',
  address: '',
};
export default function StaffPage() {
  const { user } = useAuth();
  const canManageStaff = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'HR']);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [referenceTime, setReferenceTime] = useState(() => Date.now());
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const load = useCallback(async () => {
    if (!canManageStaff) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [staffRows, attendanceRows, shiftRows] = await Promise.all([
        api<StaffUser[]>('/staff'),
        api<Attendance[]>('/enterprise/hr/attendance'),
        api<Shift[]>('/enterprise/hr/shifts'),
      ]);
      setStaff(staffRows);
      setAttendance(attendanceRows);
      setShifts(shiftRows);
      setReferenceTime(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [canManageStaff]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);
  if (!canManageStaff)
    return (
      <section className="panel restricted">
        <ShieldAlert size={36} />
        <h1>Accès réservé</h1>
        <p>La gestion du personnel est réservée à l’administration et aux ressources humaines.</p>
      </section>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api('/staff', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))),
      });
      setOpen(false);
      setForm(emptyForm);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Création impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const toggle = async (row: StaffUser) => {
    try {
      await api(`/staff/${row.id}/active?value=${!row.isActive}`, { method: 'PATCH' });
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Mise à jour impossible.');
    }
  };
  const isOnline = (row: StaffUser) =>
    Boolean(row.lastActiveAt && referenceTime - new Date(row.lastActiveAt).getTime() <= 5 * 60_000);
  const displayedStaff = staff.filter((row) => {
    const profile =
      row.doctorProfile ??
      row.nurseProfile ??
      row.secretaryProfile ??
      row.labProfile ??
      row.staffProfile;
    return (
      (!onlineOnly || isOnline(row)) &&
      (!roleFilter ||
        row.role === roleFilter ||
        row.additionalRoles?.includes(roleFilter as Role)) &&
      matchesSearch(
        query,
        row.username,
        profile ? patientName(profile) : '',
        profile?.specialty,
        profile?.phone,
        roleLabels[row.role],
      )
    );
  });
  const today = hospitalDateKey(new Date(referenceTime));
  const todayAttendance = attendance.filter((row) => hospitalDateKey(row.date) === today);
  const doctorShifts = shifts
    .filter(
      (row) =>
        (row.employee.role === 'DOCTOR' || row.employee.additionalRoles?.includes('DOCTOR')) &&
        new Date(row.endsAt).getTime() >= referenceTime &&
        row.status !== 'CANCELLED',
    )
    .slice(0, 20);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Ressources humaines</span>
          <h1>Personnel</h1>
          <p>Comptes, profils et accès professionnels.</p>
        </div>
        <div className="heading-actions">
          <button
            className={onlineOnly ? 'secondary-button active-filter' : 'secondary-button'}
            onClick={() => setOnlineOnly((current) => !current)}
          >
            <Wifi size={17} /> En ligne ({staff.filter(isOnline).length})
          </button>
          <button className="primary-button" onClick={() => setOpen(true)}>
            <Plus size={18} /> Ajouter un membre
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <section className="panel table-panel">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Nom, identifiant, rôle, spécialité ou téléphone…"
          status={roleFilter}
          onStatusChange={setRoleFilter}
          allLabel="Tous les rôles"
          statusOptions={Object.entries(roleLabels)
            .filter(
              ([role]) =>
                role !== 'SECRETARY' && (user?.role === 'SUPER_ADMIN' || role !== 'SUPER_ADMIN'),
            )
            .map(([value, label]) => ({ value, label }))}
          resultCount={displayedStaff.length}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Personnel</th>
                <th>Identifiant</th>
                <th>Rôle</th>
                <th>Spécialité</th>
                <th>Téléphone</th>
                <th>État</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Activity className="spin" />
                      Chargement…
                    </div>
                  </td>
                </tr>
              ) : displayedStaff.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <UserCog />
                      <strong>Aucun personnel</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedStaff.map((row) => {
                  const profile =
                    row.doctorProfile ??
                    row.nurseProfile ??
                    row.secretaryProfile ??
                    row.labProfile ??
                    row.staffProfile;
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{profile ? patientName(profile) : row.username}</strong>
                      </td>
                      <td>{row.username}</td>
                      <td>
                        {roleLabels[row.role]}
                        {(row.additionalRoles ?? []).length > 0 && (
                          <small>
                            +{' '}
                            {(row.additionalRoles ?? []).map((role) => roleLabels[role]).join(', ')}
                          </small>
                        )}
                      </td>
                      <td>{profile?.specialty ?? '—'}</td>
                      <td>{profile?.phone ?? '—'}</td>
                      <td>
                        <span
                          className={isOnline(row) ? 'online-indicator online' : 'online-indicator'}
                        >
                          <i />{' '}
                          {isOnline(row) ? 'En ligne' : row.isActive ? 'Hors ligne' : 'Désactivé'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className={row.isActive ? 'text-button danger' : 'text-button'}
                            onClick={() => void toggle(row)}
                          >
                            {row.isActive ? 'Désactiver' : 'Réactiver'}
                          </button>
                          <CustomFieldsEditor entity="STAFF" entityId={row.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="staff-monitoring-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Aujourd’hui</span>
              <h2>Présence du personnel</h2>
            </div>
            <UserCheck size={22} />
          </div>
          <div className="compact-record-list">
            {todayAttendance.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>{row.employee.username}</strong>
                  <span>
                    {roleLabels[row.employee.role]} · arrivée {formatHospitalTime(row.clockIn)} ·
                    sortie {formatHospitalTime(row.clockOut)}
                  </span>
                </div>
                <StatusBadge status={row.status} />
              </article>
            ))}
            {!todayAttendance.length && (
              <p className="muted">Aucune présence saisie aujourd’hui.</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Planning clinique</span>
              <h2>Horaires des médecins</h2>
            </div>
            <CalendarClock size={22} />
          </div>
          <div className="compact-record-list">
            {doctorShifts.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>{row.employee.username}</strong>
                  <span>
                    {row.service}
                    {row.location ? ` · ${row.location}` : ''}
                  </span>
                </div>
                <time>
                  {new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(row.startsAt))}
                </time>
              </article>
            ))}
            {!doctorShifts.length && <p className="muted">Aucune garde médicale à venir.</p>}
          </div>
        </section>
      </div>
      {open && (
        <Modal
          title="Ajouter un membre du personnel"
          eyebrow="Compte professionnel"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit}>
            <div className="form-grid">
              <label className="field">
                <span>Rôle *</span>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  {(
                    [
                      'DOCTOR',
                      'NURSE',
                      'RECEPTIONIST',
                      'LAB_TECHNICIAN',
                      'MEDICAL_BIOLOGIST',
                      'CASHIER',
                      'RADIOLOGIST',
                      'SURGEON',
                      'MIDWIFE',
                      'PHARMACIST',
                      'ACCOUNTANT',
                      'STOREKEEPER',
                      'HR',
                    ] as Role[]
                  ).map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Identifiant *</span>
                <input
                  required
                  minLength={3}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Mot de passe temporaire *</span>
                <input
                  required
                  type="password"
                  minLength={12}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Nom *</span>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Post-nom</span>
                <input
                  value={form.postName}
                  onChange={(e) => setForm({ ...form, postName: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Prénom</span>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </label>
              {[
                'DOCTOR',
                'NURSE',
                'LAB_TECHNICIAN',
                'MEDICAL_BIOLOGIST',
                'RADIOLOGIST',
                'SURGEON',
                'MIDWIFE',
                'PHARMACIST',
              ].includes(form.role) && (
                <label className="field">
                  <span>Spécialité {form.role === 'DOCTOR' && '*'}</span>
                  <input
                    required={form.role === 'DOCTOR'}
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  />
                </label>
              )}
              {form.role === 'DOCTOR' && (
                <>
                  <label className="field">
                    <span>Grade</span>
                    <input
                      value={form.grade}
                      onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Numéro d’ordre</span>
                    <input
                      value={form.licenseNumber}
                      onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                    />
                  </label>
                </>
              )}
              {['RECEPTIONIST', 'SECRETARY'].includes(form.role) && (
                <label className="field">
                  <span>Niveau d’études</span>
                  <input
                    value={form.educationLevel}
                    onChange={(e) => setForm({ ...form, educationLevel: e.target.value })}
                  />
                </label>
              )}
              <label className="field">
                <span>Téléphone</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label className="field full">
                <span>Adresse</span>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? 'Création…' : 'Créer le compte'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
