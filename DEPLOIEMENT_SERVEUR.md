# Déploiement isolé sur un serveur existant

Cette procédure installe le système hospitalier sans remplacer les sites déjà hébergés. Les conteneurs
utilisent le projet Docker `hopital_isiro`, le réseau `hopital_isiro_internal`, le volume
`hopital_isiro_postgres_data` et deux ports liés exclusivement à l'interface locale du serveur.
PostgreSQL n'est jamais publié sur Internet.

## 1. Vérifications sans modification

Sur un serveur Linux, vérifier d'abord les services et les ports :

```bash
cat /etc/os-release
docker --version
docker compose version
sudo ss -ltnp | grep -E ':(80|443|3100|4100|5432)\\b' || true
systemctl is-active nginx apache2 caddy 2>/dev/null || true
df -h
free -h
```

Si `3100` ou `4100` est occupé, choisir deux autres ports libres dans `.env.server`. Ne jamais arrêter
un service existant pour libérer un port.

## 2. Sous-domaine

Créer un enregistrement DNS `A` (et `AAAA` seulement si IPv6 est correctement configuré) pour le
sous-domaine hospitalier, par exemple `hopital.example.com`, vers l'adresse du serveur. Cette opération
n'affecte pas les enregistrements DNS des deux sites existants.

## 3. Installation du projet

Utiliser un répertoire propre, différent de ceux des sites existants :

```bash
sudo mkdir -p /opt/hopital-isiro
sudo chown "$USER":"$USER" /opt/hopital-isiro
git clone --branch feat/reconstruction-typescript --single-branch \
  https://github.com/exauceboby/hopital_centre_isiro.git /opt/hopital-isiro
cd /opt/hopital-isiro
cp .env.server.example .env.server
chmod 600 .env.server
```

Générer les secrets sans espace ni caractère nécessitant un encodage dans l'URL PostgreSQL :

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Placer les trois valeurs différentes dans `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET` et
`JWT_REFRESH_SECRET`. Renseigner aussi l'URL HTTPS définitive et un mot de passe super-administrateur
unique d'au moins 12 caractères.

## 4. Démarrage isolé

Toujours préciser le fichier de production et son fichier d'environnement :

```bash
docker compose --env-file .env.server -f docker-compose.production.yml config --quiet
docker compose --env-file .env.server -f docker-compose.production.yml up -d --build
docker compose --env-file .env.server -f docker-compose.production.yml ps
curl --fail http://127.0.0.1:4100/api/health
curl --fail --head http://127.0.0.1:3100
```

Créer le premier super-administrateur une seule fois :

```bash
docker compose --env-file .env.server -f docker-compose.production.yml \
  --profile tools run --rm seed
```

Le seed est idempotent : une nouvelle exécution met à jour le compte configuré sans dupliquer les
données initiales.

## 5. Proxy du nouveau sous-domaine

Pour Nginx, copier `deploy/nginx/hopital.conf.example` vers un **nouveau** fichier de site, remplacer le
domaine et les ports, puis tester l'ensemble de la configuration avant toute recharge :

```bash
sudo cp deploy/nginx/hopital.conf.example /etc/nginx/sites-available/hopital-isiro.conf
sudo nano /etc/nginx/sites-available/hopital-isiro.conf
sudo ln -s /etc/nginx/sites-available/hopital-isiro.conf /etc/nginx/sites-enabled/hopital-isiro.conf
sudo nginx -t
sudo systemctl reload nginx
```

Ne pas exécuter la recharge si `nginx -t` échoue. Une recharge Nginx réussie conserve les connexions
des sites existants. Activer ensuite HTTPS pour ce nouveau sous-domaine avec la méthode déjà utilisée
sur le serveur. `HOSPITAL_PUBLIC_URL` doit être exactement la même URL HTTPS, sans barre finale.

## 6. Mise à jour

```bash
cd /opt/hopital-isiro
git pull --ff-only origin feat/reconstruction-typescript
docker compose --env-file .env.server -f docker-compose.production.yml up -d --build
docker compose --env-file .env.server -f docker-compose.production.yml ps
```

L'API applique automatiquement les migrations Prisma avant de redémarrer. Les deux sites existants ne
sont pas redémarrés.

## 7. Sauvegarde de la base

Créer un répertoire protégé et sauvegarder régulièrement la base hors du volume Docker :

```bash
mkdir -p "$HOME/backups-hopital"
chmod 700 "$HOME/backups-hopital"
set -a
. ./.env.server
set +a
docker compose --env-file .env.server -f docker-compose.production.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "$HOME/backups-hopital/hopital-$(date +%F-%H%M).dump"
```

Tester une restauration sur une base séparée avant la mise en service. Conserver au moins une copie
chiffrée hors du serveur.

## 8. Arrêt ciblé

Cette commande arrête uniquement l'application hospitalière et conserve sa base :

```bash
docker compose --env-file .env.server -f docker-compose.production.yml down
```

Ne jamais ajouter `-v` en production : cette option supprimerait le volume de la base hospitalière.

