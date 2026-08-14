'use client';

import { Activity, CheckCircle2, Copy, KeyRound, LockKeyhole, ShieldCheck, ShieldOff } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { PushNotificationSettings } from '@/components/push-notification-settings';
import { api } from '@/lib/api';
import { notifyError, notifySuccess } from '@/lib/notifications';

interface TwoFactorStatus {
  enabled: boolean;
  enabledAt?: string | null;
}

interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  accountName: string;
  issuer: string;
}

const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—';

export default function SecuritySettingsPage() {
  const { logout } = useAuth();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api<TwoFactorStatus>('/auth/two-factor/status'));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'État de sécurité indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const beginSetup = async () => {
    setSubmitting(true);
    try {
      setSetup(await api<TwoFactorSetup>('/auth/two-factor/setup', { method: 'POST' }));
      setEnableCode('');
      notifySuccess('Secret de vérification généré. Ajoutez-le dans votre application d’authentification.');
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Configuration impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const enable = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api('/auth/two-factor/enable', {
        method: 'POST',
        body: JSON.stringify({ code: enableCode }),
      });
      setSetup(null);
      setEnableCode('');
      notifySuccess('L’authentification à deux facteurs est activée.', 'Compte renforcé');
      await load();
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Activation impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const disable = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api('/auth/two-factor/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      notifySuccess('La vérification à deux facteurs est désactivée. Reconnexion requise.');
      await logout();
      window.location.assign('/login');
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Désactivation impossible.');
      setSubmitting(false);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(`${label} copié.`);
    } catch {
      notifyError('Copie automatique indisponible. Sélectionnez le texte manuellement.');
    }
  };

  if (loading) {
    return <section className="panel empty-state"><Activity className="spin" /> Chargement de la sécurité…</section>;
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Protection du compte professionnel</span>
          <h1>Sécurité du compte</h1>
          <p>Activez un second facteur TOTP, contrôlez la durée de session et protégez l’accès aux dossiers médicaux.</p>
        </div>
        <ShieldCheck size={30} />
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="quality-layout">
        <section className={`panel ${status?.enabled ? 'quality-good' : 'quality-warning'}`}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Authentification à deux facteurs</span>
              <h2>{status?.enabled ? 'Protection active' : 'Protection à activer'}</h2>
            </div>
            {status?.enabled ? <CheckCircle2 size={26} /> : <KeyRound size={26} />}
          </div>
          <p>
            Après le mot de passe, un code de six chiffres généré par une application compatible TOTP est demandé à chaque nouvelle connexion.
          </p>
          {status?.enabled ? (
            <>
              <div className="patient-journey-detail">
                <div><strong>État</strong><span>Activée</span></div>
                <div><strong>Depuis</strong><span>{formatDate(status.enabledAt)}</span></div>
                <div><strong>Session inactive</strong><span>Fermeture après 15 minutes</span></div>
              </div>
            </>
          ) : (
            <button className="primary-button" disabled={submitting} onClick={() => void beginSetup()}>
              <KeyRound size={17} /> Commencer l’activation
            </button>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Règles automatiques</span>
              <h2>Protection des connexions</h2>
            </div>
            <LockKeyhole size={25} />
          </div>
          <div className="quality-list">
            <div className="quality-list-item"><div><strong>Verrouillage temporaire</strong><span>Après cinq tentatives incorrectes pendant 15 minutes.</span></div><CheckCircle2 /></div>
            <div className="quality-list-item"><div><strong>Expiration pour inactivité</strong><span>Avertissement à 14 minutes, fermeture à 15 minutes.</span></div><CheckCircle2 /></div>
            <div className="quality-list-item"><div><strong>Traçabilité</strong><span>Adresse IP, appareil, succès, échecs et révocation des sessions.</span></div><CheckCircle2 /></div>
          </div>
        </section>
      </div>

      <PushNotificationSettings />

      {setup && !status?.enabled && (
        <section className="panel quality-warning">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Étape 1 puis étape 2</span>
              <h2>Associer l’application d’authentification</h2>
            </div>
            <KeyRound />
          </div>
          <ol className="security-setup-steps">
            <li>Ouvrez Google Authenticator, Microsoft Authenticator, Authy ou une application TOTP équivalente.</li>
            <li>Choisissez l’ajout manuel d’un compte et saisissez le secret ci-dessous.</li>
            <li>Le type doit être « basé sur le temps », avec six chiffres et une période de 30 secondes.</li>
            <li>Saisissez ensuite le code généré pour confirmer l’activation.</li>
          </ol>
          <div className="security-secret-card">
            <div><span>Émetteur</span><strong>{setup.issuer}</strong></div>
            <div><span>Compte</span><strong>{setup.accountName}</strong></div>
            <div className="full"><span>Secret TOTP</span><code>{setup.secret}</code><button className="text-button" onClick={() => void copy(setup.secret, 'Secret')}><Copy size={15} /> Copier</button></div>
            <div className="full"><span>Lien d’association</span><code>{setup.otpauthUri}</code><button className="text-button" onClick={() => void copy(setup.otpauthUri, 'Lien')}><Copy size={15} /> Copier</button></div>
          </div>
          <div className="alert warning">Conservez ce secret uniquement dans l’application d’authentification. Ne l’envoyez pas par message et ne l’imprimez pas.</div>
          <form onSubmit={enable}>
            <label className="field">
              <span>Premier code à six chiffres *</span>
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                value={enableCode}
                onChange={(event) => setEnableCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setSetup(null)}>Annuler</button>
              <button className="primary-button" disabled={submitting || enableCode.length !== 6}>Activer définitivement</button>
            </div>
          </form>
        </section>
      )}

      {status?.enabled && (
        <section className="panel quality-urgent">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Action sensible</span>
              <h2>Désactiver le second facteur</h2>
            </div>
            <ShieldOff />
          </div>
          <p>La désactivation exige le mot de passe actuel et un code TOTP valide. Toutes les sessions ouvertes seront révoquées.</p>
          <form onSubmit={disable}>
            <div className="form-grid">
              <label className="field">
                <span>Mot de passe actuel *</span>
                <input required minLength={8} type="password" autoComplete="current-password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} />
              </label>
              <label className="field">
                <span>Code TOTP *</span>
                <input required inputMode="numeric" pattern="[0-9]{6}" value={disableCode} onChange={(event) => setDisableCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="danger-button" disabled={submitting || disableCode.length !== 6}>Désactiver et fermer les sessions</button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
