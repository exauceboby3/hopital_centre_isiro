'use client';

import {
  Activity,
  BadgeCheck,
  BriefcaseMedical,
  CalendarDays,
  Check,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { api } from '@/lib/api';
import { roleLabels } from '@/lib/roles';

interface ProfessionalProfile {
  lastName?: string;
  postName?: string;
  firstName?: string;
  specialty?: string;
  grade?: string;
  licenseNumber?: string;
  educationLevel?: string;
  phone?: string;
  address?: string;
}

interface OwnProfile {
  user: {
    id: string;
    username: string;
    role: keyof typeof roleLabels;
    additionalRoles?: Array<keyof typeof roleLabels>;
    isActive: boolean;
    lastActiveAt?: string;
    createdAt: string;
  };
  profile?: ProfessionalProfile;
  profileType: string;
}

const emptyProfile: ProfessionalProfile = {
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

const emptyPassword = { currentPassword: '', newPassword: '', confirmation: '' };

const profileTypeLabels: Record<string, string> = {
  DOCTOR: 'Profil médical',
  NURSE: 'Profil infirmier',
  SECRETARY: 'Profil administratif',
  LABORATORY: 'Profil de laboratoire',
  STAFF: 'Profil professionnel',
};

const dateTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('fr-CD', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Pas encore enregistrée';

export default function ProfilePage() {
  const { refresh, logout } = useAuth();
  const [record, setRecord] = useState<OwnProfile | null>(null);
  const [form, setForm] = useState<ProfessionalProfile>(emptyProfile);
  const [passwordForm, setPasswordForm] = useState(emptyPassword);
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<OwnProfile>('/users/me/profile');
      setRecord(result);
      setForm({ ...emptyProfile, ...(result.profile ?? {}) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement du profil impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api<OwnProfile>('/users/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      setRecord(result);
      setForm({ ...emptyProfile, ...(result.profile ?? {}) });
      setSuccess('Votre profil professionnel a été mis à jour.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mise à jour impossible.');
    } finally {
      setSaving(false);
    }
  };

  const passwordChecks = useMemo(
    () => [
      { label: '12 caractères minimum', valid: passwordForm.newPassword.length >= 12 },
      { label: 'Une lettre majuscule', valid: /[A-Z]/.test(passwordForm.newPassword) },
      { label: 'Une lettre minuscule', valid: /[a-z]/.test(passwordForm.newPassword) },
      { label: 'Un chiffre', valid: /\d/.test(passwordForm.newPassword) },
      {
        label: 'Un caractère spécial',
        valid: /[^A-Za-z0-9]/.test(passwordForm.newPassword),
      },
    ],
    [passwordForm.newPassword],
  );
  const passwordReady =
    passwordChecks.every((item) => item.valid) &&
    Boolean(passwordForm.currentPassword) &&
    passwordForm.newPassword === passwordForm.confirmation;

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (passwordForm.newPassword !== passwordForm.confirmation) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (!passwordChecks.every((item) => item.valid)) {
      setError('Le nouveau mot de passe ne respecte pas encore toutes les règles de sécurité.');
      return;
    }

    setChangingPassword(true);
    try {
      await api('/users/me/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordForm(emptyPassword);
      setSuccess('Mot de passe modifié. Reconnexion sécurisée en cours…');
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      await logout();
      window.location.assign('/login');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Modification du mot de passe impossible.',
      );
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <section className="panel empty-state">
        <Activity className="spin" /> Chargement du profil…
      </section>
    );
  }
  if (!record) return <section className="panel alert error">{error}</section>;

  const roles = [...new Set([record.user.role, ...(record.user.additionalRoles ?? [])])];
  const isDoctor = record.profileType === 'DOCTOR';
  const isSecretary = record.profileType === 'SECRETARY';
  const displayName = [form.lastName, form.postName, form.firstName].filter(Boolean).join(' ');
  const initials = (displayName || record.user.username)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <div className="page-heading profile-page-heading">
        <div>
          <span className="eyebrow">Espace personnel sécurisé</span>
          <h1>Mon profil</h1>
          <p>Gérez votre identité professionnelle, vos coordonnées et votre mot de passe.</p>
        </div>
        <UserRound size={30} />
      </div>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="profile-layout">
        <aside className="panel profile-summary">
          <div className="profile-cover" aria-hidden="true" />
          <div className="avatar profile-avatar">{initials}</div>
          <div className="profile-identity">
            <h2>{displayName || record.user.username}</h2>
            <span>@{record.user.username}</span>
            <strong>{profileTypeLabels[record.profileType] ?? 'Profil professionnel'}</strong>
          </div>
          <span className={`profile-status ${record.user.isActive ? 'active' : ''}`}>
            <i /> {record.user.isActive ? 'Compte actif' : 'Compte désactivé'}
          </span>
          <div className="profile-role-list">
            {roles.map((role) => (
              <span key={role}>
                <BadgeCheck size={15} /> {roleLabels[role]}
              </span>
            ))}
          </div>
          <div className="profile-account-meta">
            <div>
              <CalendarDays size={17} />
              <span>
                Membre depuis <strong>{dateTime(record.user.createdAt)}</strong>
              </span>
            </div>
            <div>
              <Clock3 size={17} />
              <span>
                Dernière activité <strong>{dateTime(record.user.lastActiveAt)}</strong>
              </span>
            </div>
            {form.phone && (
              <div>
                <Phone size={17} />
                <span>{form.phone}</span>
              </div>
            )}
            {form.address && (
              <div>
                <MapPin size={17} />
                <span>{form.address}</span>
              </div>
            )}
          </div>
        </aside>

        <div className="profile-content-stack">
          <section className="panel">
            <div className="profile-section-heading">
              <span className="profile-section-icon">
                <BriefcaseMedical size={20} />
              </span>
              <div>
                <h2>Identité professionnelle</h2>
                <p>Ces informations sont utilisées dans les dossiers et documents autorisés.</p>
              </div>
            </div>
            <form onSubmit={save}>
              <div className="form-grid">
                <label className="field">
                  <span>Nom *</span>
                  <input
                    required
                    value={form.lastName ?? ''}
                    onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Post-nom</span>
                  <input
                    value={form.postName ?? ''}
                    onChange={(event) => setForm({ ...form, postName: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Prénom</span>
                  <input
                    value={form.firstName ?? ''}
                    onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Téléphone</span>
                  <input
                    type="tel"
                    value={form.phone ?? ''}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  />
                </label>
                <label className="field full">
                  <span>Adresse</span>
                  <textarea
                    rows={2}
                    value={form.address ?? ''}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                  />
                </label>
                {(isDoctor || ['NURSE', 'LABORATORY', 'STAFF'].includes(record.profileType)) && (
                  <label className="field">
                    <span>Spécialité</span>
                    <input
                      value={form.specialty ?? ''}
                      onChange={(event) => setForm({ ...form, specialty: event.target.value })}
                    />
                  </label>
                )}
                {(isDoctor || record.profileType === 'STAFF') && (
                  <label className="field">
                    <span>Grade</span>
                    <input
                      value={form.grade ?? ''}
                      onChange={(event) => setForm({ ...form, grade: event.target.value })}
                    />
                  </label>
                )}
                {isDoctor && (
                  <label className="field">
                    <span>Numéro professionnel</span>
                    <input
                      value={form.licenseNumber ?? ''}
                      onChange={(event) => setForm({ ...form, licenseNumber: event.target.value })}
                    />
                  </label>
                )}
                {isSecretary && (
                  <label className="field">
                    <span>Niveau d’études</span>
                    <input
                      value={form.educationLevel ?? ''}
                      onChange={(event) => setForm({ ...form, educationLevel: event.target.value })}
                    />
                  </label>
                )}
              </div>
              <div className="modal-actions">
                <button className="primary-button" disabled={saving}>
                  {saving ? <Activity className="spin" size={17} /> : <Save size={17} />}
                  Enregistrer mon profil
                </button>
              </div>
            </form>
          </section>

          <section className="panel profile-security-panel">
            <div className="profile-section-heading">
              <span className="profile-section-icon security">
                <ShieldCheck size={20} />
              </span>
              <div>
                <h2>Sécurité du compte</h2>
                <p>
                  Le changement déconnecte toutes les sessions ouvertes sur les autres appareils.
                </p>
              </div>
            </div>
            <form onSubmit={changePassword}>
              <div className="form-grid">
                <label className="field full">
                  <span>Mot de passe actuel *</span>
                  <div className="profile-password-input">
                    <KeyRound size={17} />
                    <input
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="current-password"
                      type={showPasswords ? 'text' : 'password'}
                      value={passwordForm.currentPassword}
                      onChange={(event) =>
                        setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
                      }
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Nouveau mot de passe *</span>
                  <div className="profile-password-input">
                    <KeyRound size={17} />
                    <input
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      type={showPasswords ? 'text' : 'password'}
                      value={passwordForm.newPassword}
                      onChange={(event) =>
                        setPasswordForm({ ...passwordForm, newPassword: event.target.value })
                      }
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Confirmer le nouveau mot de passe *</span>
                  <div className="profile-password-input">
                    <KeyRound size={17} />
                    <input
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      type={showPasswords ? 'text' : 'password'}
                      value={passwordForm.confirmation}
                      onChange={(event) =>
                        setPasswordForm({ ...passwordForm, confirmation: event.target.value })
                      }
                    />
                  </div>
                </label>
              </div>
              <button
                type="button"
                className="profile-password-visibility"
                onClick={() => setShowPasswords((current) => !current)}
              >
                {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                {showPasswords ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
              </button>
              <div className="profile-password-rules" aria-label="Règles du mot de passe">
                {passwordChecks.map((item) => (
                  <span className={item.valid ? 'valid' : ''} key={item.label}>
                    <Check size={14} /> {item.label}
                  </span>
                ))}
              </div>
              <div className="modal-actions">
                <button className="primary-button" disabled={changingPassword || !passwordReady}>
                  {changingPassword ? (
                    <Activity className="spin" size={17} />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                  Modifier mon mot de passe
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="profile-section-heading">
              <span className="profile-section-icon">
                <UserRound size={20} />
              </span>
              <div>
                <h2>Rubriques personnalisées</h2>
                <p>Informations complémentaires définies par l’administration de l’hôpital.</p>
              </div>
            </div>
            <CustomFieldsEditor entity="STAFF" entityId={record.user.id} compact={false} />
          </section>
        </div>
      </div>
    </>
  );
}
