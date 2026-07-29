'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api';
import styles from './user-avatar.module.css';

interface UserAvatarProps {
  userId: string;
  username: string;
  size?: number;
  version?: number | string;
  className?: string;
}

export function UserAvatar({
  userId,
  username,
  size = 40,
  version,
  className = '',
}: UserAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const initials = useMemo(
    () =>
      username
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'U',
    [username],
  );
  const src = apiUrl(
    `/users/${userId}/photo${version !== undefined ? `?v=${encodeURIComponent(String(version))}` : ''}`,
  );
  const failed = failedSource === src;

  return (
    <span
      className={`${styles.avatar} ${className}`.trim()}
      style={{ width: size, height: size, flexBasis: size }}
      aria-label={`Photo de ${username}`}
    >
      {!failed ? (
        <Image
          unoptimized
          src={src}
          alt=""
          width={size}
          height={size}
          className={styles.image}
          onError={() => setFailedSource(src)}
        />
      ) : (
        <span className={styles.initials}>{initials}</span>
      )}
    </span>
  );
}
