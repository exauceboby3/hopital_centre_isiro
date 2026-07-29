import { CloudOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <CloudOff size={52} />
      <h1>Connexion Internet indisponible</h1>
      <p>
        Les écrans déjà ouverts restent utilisables. Les nouvelles actions compatibles sont
        conservées sur cet appareil et seront synchronisées au retour de la connexion.
      </p>
      <a href="/dashboard">Réessayer</a>
    </main>
  );
}
