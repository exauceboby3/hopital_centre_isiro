# Sauvegarde et restauration de production

## Objectif

La sauvegarde doit couvrir PostgreSQL et les fichiers médicaux téléversés. Une sauvegarde n'est considérée fiable qu'après une restauration de contrôle réussie.

## Prérequis

- `postgresql-client` installé sur le serveur ;
- `DATABASE_URL` défini pour la base de production ;
- un répertoire local protégé ;
- une copie sur un autre disque ou un autre serveur ;
- des permissions de lecture limitées à l'administrateur système.

## Sauvegarde PostgreSQL

```bash
cd /opt/hopital-isiro
chmod +x scripts/backup-production.sh scripts/verify-restore.sh

export DATABASE_URL='postgresql://...'
export BACKUP_DIR='/var/backups/hopital-centre-isiro'
export BACKUP_COPY_DIR='/mnt/backup-externe/hopital-centre-isiro'
export BACKUP_RETENTION_DAYS='30'

./scripts/backup-production.sh
```

Le script :

- crée un dump PostgreSQL compressé ;
- vérifie que l'archive est lisible par `pg_restore` ;
- génère une somme SHA-256 ;
- effectue la copie secondaire lorsqu'elle est configurée ;
- supprime uniquement les archives dépassant la durée de conservation.

## Restauration de contrôle

La base cible doit être une base isolée. Ne jamais utiliser l'URL de production.

```bash
export BACKUP_FILE='/var/backups/hopital-centre-isiro/hopital-serveur-AAAAmmjjTHHMMSSZ.dump'
export RESTORE_DATABASE_URL='postgresql://hopital:mot-de-passe@localhost:5432/hopital_restore_test?schema=public'

./scripts/verify-restore.sh
```

La vérification :

- contrôle le checksum lorsqu'il existe ;
- restaure l'archive dans la base de test ;
- vérifie la présence des tables critiques ;
- compte les utilisateurs, patients, factures et lignes d'audit.

Après le test, enregistrer l'exécution et la restauration dans **Qualité & continuité → Sauvegardes**.

## Planification quotidienne

Exemple de tâche cron à 02 h 15 :

```cron
15 2 * * * cd /opt/hopital-isiro && /usr/bin/env bash -lc 'source /opt/hopital-isiro/.env.server && BACKUP_DIR=/var/backups/hopital-centre-isiro BACKUP_COPY_DIR=/mnt/backup-externe/hopital-centre-isiro ./scripts/backup-production.sh' >> /var/log/hopital-backup.log 2>&1
```

## Fichiers médicaux

Le répertoire réel des documents téléversés doit être sauvegardé séparément avec `rsync` ou un stockage objet compatible S3. La copie doit préserver les noms, dates, permissions et versions.

## Fréquence recommandée

- sauvegarde PostgreSQL : chaque nuit ;
- copie externe : chaque nuit ;
- vérification automatique du checksum : chaque nuit ;
- restauration complète de contrôle : au moins une fois par mois ;
- exercice documenté de reprise après incident : au moins deux fois par an.
