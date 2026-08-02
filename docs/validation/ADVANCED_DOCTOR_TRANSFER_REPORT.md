# Rapport avancé — charge médicale et transferts

**Résultat local déterministe : SUCCÈS.**

## Scénario demandé

- 5 médecins actifs testés ;
- 4 patients actifs attribués simultanément à chacun ;
- 20 patients simulés ;
- transfert d’un patient après le début du traitement ;
- un médecin destinataire déjà chargé de 4 patients reçoit un 5e patient ;
- conservation de l’heure initiale, du même épisode et des notes cliniques ;
- retrait immédiat des droits d’écriture de l’ancien médecin ;
- reprise du traitement par le nouveau médecin après reconnaissance ;
- transfert avec résultats de laboratoire en attente ;
- chaîne de transferts et conflit de transferts simultanés.

## Résultats

- Assertions exécutées : 31
- Assertions réussies : 31
- Assertions échouées : 0
- Transferts audités : 6

## Défaut corrigé

Le transfert remettait auparavant `startedAt` à `null`. Le nouveau médecin pouvait donc remplacer l’heure réelle du début de la prise en charge. Le transfert conserve désormais cette date ainsi que le rapport clinique existant.

## Limite

Ce rapport local est une simulation déterministe. La branche doit également réussir les tests Jest d’intégration sur PostgreSQL, le lint, les migrations et les builds avant fusion.
