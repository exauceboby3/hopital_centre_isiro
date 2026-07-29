'use client';

import { Activity, Camera, ImageUp, ShieldCheck } from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from './auth-provider';
import { UserAvatar } from './user-avatar';

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxSize = 3 * 1024 * 1024;

export function ProfilePhotoManager() {
  const pathname = usePathname();
  const { user, refresh } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (pathname !== '/profile' || !user) return null;

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    if (!acceptedTypes.has(file.type)) {
      setError('La photo doit être au format JPEG, PNG ou WebP.');
      return;
    }
    if (!file.size || file.size > maxSize) {
      setError('La photo de profil ne doit pas dépasser 3 Mo.');
      return;
    }

    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      await api('/users/me/photo', { method: 'POST', body: data });
      setVersion((current) => current + 1);
      setNotice('Votre photo de profil a été mise à jour.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Téléversement impossible.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="panel profile-photo-manager">
      <div className="profile-photo-preview">
        <span key={version}>
          <UserAvatar userId={user.id} username={user.username} size={88} />
        </span>
        <button
          className="profile-photo-camera"
          type="button"
          title="Changer la photo"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Activity className="spin" size={18} /> : <Camera size={18} />}
        </button>
      </div>
      <div>
        <span className="eyebrow">Identité visuelle du personnel</span>
        <h2>Photo de profil</h2>
        <p>
          Cette photo est affichée dans votre profil, la messagerie et les listes autorisées du
          personnel.
        </p>
        <div className="profile-photo-rules">
          <span><ShieldCheck size={14} /> JPEG, PNG ou WebP</span>
          <span><ShieldCheck size={14} /> Maximum 3 Mo</span>
          <span><ShieldCheck size={14} /> Ancienne photo remplacée automatiquement</span>
        </div>
        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}
        <button
          className="secondary-button"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <ImageUp size={17} /> {uploading ? 'Téléversement…' : 'Choisir une photo'}
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
        />
      </div>
    </section>
  );
}
