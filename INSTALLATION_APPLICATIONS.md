# Installation de l’application CHI Isiro

Le système reste centralisé sur le serveur hospitalier. Les applications Windows, Android et iPhone utilisent la même base de données et les mêmes règles d’accès.

## Windows

Le workflow GitHub **Applications installables** produit l’artefact `CHI-Isiro-Windows` contenant :

```text
CHI-Isiro-Setup-2.0.0.exe
```

Installation :

1. télécharger l’artefact depuis GitHub Actions ;
2. extraire le fichier ZIP ;
3. lancer le setup ;
4. choisir le dossier d’installation ;
5. utiliser le raccourci **CHI Isiro** créé sur le bureau.

L’adresse du serveur utilisée par défaut est `https://hopitalcentreisiro.online`.

## Android

Le même workflow produit l’artefact `CHI-Isiro-Android` contenant :

```text
CHI-Isiro-Android.apk
```

Installation :

1. télécharger l’APK sur le téléphone ;
2. autoriser temporairement l’installation provenant du navigateur ou du gestionnaire de fichiers ;
3. ouvrir l’APK ;
4. confirmer l’installation ;
5. retirer ensuite l’autorisation d’installer des applications inconnues.

L’APK exige Android 7.0 ou une version supérieure et refuse les connexions HTTP non chiffrées.

## iPhone et iPad

La version iPhone est une application web installable. Elle ne nécessite pas d’APK.

1. ouvrir `https://hopitalcentreisiro.online` dans Safari ;
2. se connecter ;
3. toucher **Partager** ;
4. choisir **Ajouter à l’écran d’accueil** ;
5. confirmer avec **Ajouter**.

Un bouton **Installer** apparaît également dans l’application lorsque l’appareil permet l’installation.

## Génération manuelle des artefacts

Dans GitHub :

1. ouvrir **Actions** ;
2. sélectionner **Applications installables** ;
3. cliquer **Run workflow** ;
4. choisir la branche `feat/reconstruction-typescript` ;
5. attendre la fin des jobs Windows et Android ;
6. télécharger les deux artefacts au bas du workflow.

## Prérequis de production

Avant distribution :

- le domaine doit répondre en HTTPS ;
- le certificat TLS doit être valide ;
- l’API doit être accessible depuis le réseau des appareils ;
- les migrations et le seed doivent être appliqués ;
- les sauvegardes PostgreSQL doivent être actives ;
- les comptes doivent être attribués selon les rôles métier.
