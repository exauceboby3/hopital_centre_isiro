# Centre Hospitalier d'Isiro

Plateforme moderne de gestion hospitalière reconstruite à partir de l'application PHP historique.

## Fonctionnalités

- authentification sécurisée, rotation des sessions et contrôle d'accès par rôle ;
- gestion des patients, du personnel et des rendez-vous ;
- consultations, constantes vitales et demandes d'examens ;
- laboratoire, hospitalisations, chambres et lits ;
- catalogue tarifaire, facturation et paiement obligatoire avant les soins ;
- prescriptions structurées (dosage, fréquence, voie, durée), contrôle des interactions et paiement
  avant délivrance ;
- pharmacie avec lots, dates d'expiration, quarantaine automatique, délivrance FEFO et inventaires
  physiques rapprochés ;
- dossiers structurés de chirurgie, maternité et pédiatrie, avec checklists et comptes rendus ;
- radiologie avec études, modalités, identifiants DICOM, instances, DICOMweb et lien vers le viewer
  PACS ;
- banque de sang, poches, compatibilité documentée et suivi des transfusions ;
- assurances, polices patient, dossiers de remboursement et répartition directe de chaque facture
  entre patient et assureur ;
- fournisseurs, commandes, réception et alimentation automatique du stock ;
- planning des gardes, présences, retards, absences, périodes de paie et bulletins calculés ;
- plan comptable, journal à partie double, validation des écritures et balance ;
- identité de l'hôpital, logo optimisé et rubriques configurables sur tous les formulaires métier ;
- impressions PDF personnalisables par département (A4, A5 ou Letter, portrait ou paysage) ;
- rapports financiers, opérationnels et réglementaires exportables en Excel ou CSV ;
- mode hors ligne avec file locale des mutations et synchronisation automatique au retour du réseau ;
- messagerie interne, tableau de bord et journal d'audit ;
- erreurs utilisateur expliquées en français avec référence d'incident, sans exposer les détails
  techniques ni les données médicales.

Le centre de contrôle administrateur réunit la gestion des tarifs, des comptes, des rôles, des
modules métier, des urgences et du journal d'activité. Les administrateurs peuvent modifier les prix,
déplacer un patient vers un autre lit, activer ou désactiver les comptes et administrer les opérations
depuis cette interface. Les éléments déjà utilisés dans un dossier sont désactivés au lieu d'être
supprimés physiquement afin de conserver l'intégrité médicale et comptable.

Le rôle `SUPER_ADMIN` est le seul autorisé à créer d'autres comptes administratifs privilégiés et à
nettoyer les anciennes traces d'audit. Le dernier super-administrateur actif ne peut pas être désactivé.
Toutes les mutations réussies ou refusées sont enregistrées avec l'utilisateur, le rôle, la route,
l'adresse IP et le code de réponse, sans copier le contenu médical ni les mots de passe.

La messagerie interne signale les nouveaux messages dans toute l'application. Chaque membre peut
déclencher une alerte d'urgence globale ou ciblée par rôle ; les alertes critiques produisent une
notification visuelle, sonore et, si le navigateur l'autorise, une notification système.

Les rôles disponibles sont : super-administrateur, administrateur, caissier, secrétaire, médecin,
infirmier, laborantin, radiologue, chirurgien, sage-femme, pharmacien, comptable et gestionnaire de
stock. Chaque rôle dispose uniquement des opérations nécessaires à son métier ; le
super-administrateur conserve le contrôle global.

## Configuration sans modification du code

L'administrateur ou le super-administrateur configure l'identité visuelle et les modèles d'impression.
Le super-administrateur configure également depuis son centre de contrôle :

- le nom légal, l'adresse, le téléphone, l'e-mail, le numéro d'enregistrement, la devise et le pied
  de page des documents, le logo, la couleur, le papier, l'orientation, les marges et la connexion
  PACS/DICOMweb ;
- les modèles propres à chaque département et type de document, y compris les types ajoutés plus tard ;
- les tarifs de consultation, laboratoire, hospitalisation, pharmacie, radiologie, chirurgie,
  maternité, pédiatrie, banque de sang et autres actes ;
- les types d'examens et d'actes proposés aux utilisateurs ;
- les rubriques supplémentaires des patients, employés, rendez-vous, consultations, examens,
  hospitalisations, factures, ordonnances, lots, dossiers spécialisés, imagerie, gardes, présences,
  paies et écritures comptables : texte, texte long, nombre, date, booléen ou liste de choix, avec
  ordre et caractère obligatoire ;
- les comptes, rôles, urgences et paramètres opérationnels.

Une rubrique désactivée reste liée à l'historique existant. Le système évite ainsi de perdre une
information médicale déjà enregistrée.

## Architecture

- `apps/api` : API REST NestJS, Prisma et PostgreSQL
- `apps/web` : interface Next.js et TypeScript
- `legacy` : application PHP historique conservée uniquement comme référence fonctionnelle

L'API utilise une architecture modulaire. Les règles métier critiques, notamment le calcul des
factures, l'enregistrement des paiements, l'occupation des lits et les mouvements de stock, sont
exécutées dans des transactions PostgreSQL.

## Paiement avant les soins

Chaque rendez-vous de consultation et chaque demande d'examen génère automatiquement une facture.
Le paiement intégral transforme cette facture en autorisation utilisable une seule fois. L'API
bloque l'accueil du patient, le démarrage de la consultation, la saisie d'un résultat de laboratoire,
l'admission dans un lit et la délivrance d'un médicament tant que l'autorisation n'est pas validée.

La caisse peut également préparer une autorisation pour une hospitalisation, une procédure, un autre
acte ou une vente de pharmacie. Seul un administrateur peut enregistrer une dérogation d'urgence, avec
un motif obligatoire conservé dans la traçabilité. Les tarifs fournis au premier démarrage sont des
valeurs initiales en CDF : l'administrateur doit les vérifier et les adapter avant la mise en service.

Les actes configurables de radiologie, chirurgie, maternité, pédiatrie et banque de sang génèrent eux
aussi leur facture et leur autorisation. Leur exécution ne peut commencer qu'après paiement complet ou
dérogation tracée. Les transitions de statut sont contrôlées afin d'empêcher, par exemple, la validation
d'un acte non exécuté ou la clôture directe d'une transfusion non démarrée.

Chaque transfusion est rattachée à un acte `BLOOD_BANK` facturé. Sa programmation réserve la poche,
mais son administration ne peut commencer que lorsque l'autorisation de paiement est validée ou qu'une
dérogation d'urgence a été enregistrée.

Lorsqu'une assurance est affectée à une facture, le système calcule la part patient et la part
assureur à partir de la police active. Les soins peuvent être autorisés dès que la garantie de
l'assureur est validée et que la part patient est encaissée. Chaque paiement indique explicitement
son payeur et ne peut pas dépasser la part qui lui revient.

## Documents et impressions

Les boutons d'impression ouvrent un document utilisant l'identité et le modèle configurés pour son
département. Le navigateur permet ensuite une impression papier ou un enregistrement PDF. Les
documents disponibles sont :

- facture détaillée ;
- reçu associé à un paiement précis ;
- résultat de laboratoire validé ;
- compte rendu d'un acte clinique ;
- fiche de transfusion avec cross-match et traçabilité ;
- bon de commande fournisseur ;
- synthèse du dossier patient et de ses rubriques personnalisées ;
- ordonnance structurée ;
- dossier de chirurgie, maternité ou pédiatrie ;
- compte rendu radiologique avec références DICOM ;
- attestation de prise en charge assurance ;
- procès-verbal d'inventaire de pharmacie ;
- fiche de garde et fiche de présence ;
- état de paie ;
- pièce comptable détaillée.

## Gestion intégrée

L'écran **Gestion intégrée** centralise les fonctions avancées : répartition assurance, prescriptions,
lots et inventaires, dossiers spécialisés, PACS/DICOM, gardes, présences, paie, comptabilité et exports.
Les actions restent protégées par les rôles côté API, même si un utilisateur tente d'appeler une route
directement.

Le mode hors ligne ne met jamais les réponses de l'API ni les dossiers médicaux en cache HTTP. Seules
les mutations explicitement compatibles sont placées dans IndexedDB sur le poste utilisé, puis rejouées
après reconnexion. Les postes hors ligne doivent donc être des appareils hospitaliers chiffrés, protégés
par session et soumis à la politique locale de sécurité.

## Prérequis

- Node.js 22 ou supérieur
- npm 11 ou supérieur
- Docker avec Docker Compose (sur Windows, installer et démarrer Docker Desktop)

## Démarrage local

1. Copier `.env.example` vers `.env` et remplacer toutes les valeurs de démonstration.
2. Installer les dépendances avec `npm install`.
3. Démarrer PostgreSQL avec `docker compose up -d postgres`.
4. Appliquer le schéma avec `npm run db:migrate`.
5. Créer le compte administrateur avec `npm run db:seed`.
6. Lancer l'API et le frontend dans deux terminaux :
   - `npm run dev:api`
   - `npm run dev:web`

L'interface est disponible sur `http://localhost:3000` et la documentation API sur `http://localhost:4000/docs`.

Sous Windows, Docker Desktop doit être ouvert et afficher que le moteur est démarré avant la commande
`docker compose`. Le fichier `.env` reste à la racine du projet ; Prisma le charge explicitement depuis
ce chemin pour les commandes exécutées dans le workspace API.

Si PowerShell indique que `dockerDesktopLinuxEngine` est introuvable, démarrer Docker Desktop, attendre
que l'état « Engine running » apparaisse, puis relancer `docker compose up -d postgres`. Les commandes
`npm run db:migrate` et `npm run db:seed` ne peuvent pas réussir tant que PostgreSQL n'écoute pas sur le
port configuré dans `DATABASE_URL`.

Le seed utilise `SEED_SUPER_ADMIN_USERNAME` et `SEED_SUPER_ADMIN_PASSWORD`. Les anciennes variables
`SEED_ADMIN_USERNAME` et `SEED_ADMIN_PASSWORD` restent acceptées comme solution de repli.

En production, `docker compose up -d --build` applique automatiquement les migrations avant le démarrage de l'API.

## Sécurité

- mots de passe hachés avec Argon2 ;
- jetons d'accès et de renouvellement dans des cookies `httpOnly` ;
- renouvellement rotatif, révocation des sessions et limitation de débit ;
- validation stricte des entrées, CORS limité et contrôle d'origine des mutations ;
- autorisations par rôle, en-têtes Helmet et traçabilité des écritures ;
- aucune donnée médicale ni aucun secret dans les journaux d'audit.

Les transfusions exigent une référence de cross-match réalisée par le personnel compétent. Le logiciel
enregistre et contrôle le parcours, mais ne remplace jamais les procédures cliniques, la vérification
humaine de compatibilité, la réglementation locale ni la validation du responsable médical.

Utiliser des secrets aléatoires d'au moins 32 caractères et activer HTTPS devant les conteneurs en
production. Le fichier SQL historique ne contient aucune ligne `INSERT` : une migration de données
réelles devra partir d'un export autorisé de la base actuellement utilisée par l'hôpital.

## Vérifications

- `npm run lint`
- `npm run test`
- `npm run build`

La GitHub Action `.github/workflows/ci.yml` exécute ces contrôles, ainsi que la génération et la
validation du client Prisma, à chaque pull request.

Avant une mise en production réelle, effectuer une recette avec les utilisateurs de chaque service,
un test de restauration de sauvegarde, une revue de sécurité, une validation réglementaire locale et
des essais d'impression sur les équipements de l'hôpital. Aucun logiciel médical sérieux ne doit être
qualifié d'« infaillible » sans ces validations de terrain.

Les secrets, fichiers téléversés et données de production ne doivent jamais être ajoutés au dépôt.
