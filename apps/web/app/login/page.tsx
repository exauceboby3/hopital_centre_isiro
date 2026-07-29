'use client';

import { Activity, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      router.replace('/dashboard');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Connexion impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="showcase-content">
          <div className="showcase-logo software-logo-frame">
            <Image src="/software-logo.svg" alt="Logo CHI Isiro" width={72} height={72} priority />
          </div>
          <span className="eyebrow light">Centre Hospitalier d&apos;Isiro</span>
          <h1>Des soins mieux coordonnés, des équipes mieux informées.</h1>
          <p>Une plateforme unique et sécurisée pour le parcours complet de chaque patient.</p>
          <div className="showcase-stats">
            <div><strong>24/7</strong><span>Disponibilité</span></div>
            <div><strong>100%</strong><span>Traçabilité</span></div>
            <div><strong>Sécurisé</strong><span>Accès professionnel</span></div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-heading">
            <span className="mobile-logo software-logo-frame">
              <Image src="/software-logo.svg" alt="Logo CHI Isiro" width={42} height={42} priority />
            </span>
            <span className="eyebrow">Espace sécurisé</span>
            <h2>Bienvenue</h2>
            <p>Connectez-vous avec votre compte professionnel.</p>
          </div>

          <label className="field">
            <span>Identifiant</span>
            <div className="input-wrap">
              <UserRound size={18} />
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                minLength={3}
                required
                placeholder="Votre identifiant"
              />
            </div>
          </label>

          <label className="field">
            <span>Mot de passe</span>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                minLength={8}
                required
                placeholder="Votre mot de passe"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button login-button" type="submit" disabled={submitting}>
            {submitting ? <Activity className="spin" size={19} /> : <LockKeyhole size={18} />}
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="security-note">Les connexions, échecs, appareils et sessions sont journalisés.</p>
        </form>
      </section>
    </main>
  );
}
