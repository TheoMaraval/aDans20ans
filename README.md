# Patrimoine — dashboard financier personnel chiffré

Suivi de patrimoine façon Finary, **sans aucune connexion à tes banques, courtiers ou wallets**. Tu saisis tes comptes, positions, biens, prêts et DCA ; les cours sont récupérés automatiquement (Yahoo Finance, CoinGecko, BCE) ; un mail récapitulatif arrive chaque dimanche. Le site est hébergé gratuitement sur GitHub Pages et s'installe sur le téléphone comme une app.

Ce que tu peux suivre :

- **Investissements** : PEA, PEA-PME, CTO, assurance-vie, PER, crypto (saisie manuelle), avec PRU, plus-values latentes et réalisées, dividendes et TRI par compte.
- **Épargne** : Livret A, LDDS, LEP, CEL, PEL, comptes courants, avec intérêts estimés et jauges de plafond.
- **Immobilier** : valeur, quote-part, équité nette, rendements brut et net.
- **Véhicules et biens** : décote automatique ou cote manuelle.
- **Dettes** : tableau d'amortissement et capital restant dû calculés automatiquement.
- **DCA** : achats enregistrés automatiquement au cours de clôture, corrigeables, avec projection sur 5, 10 ou 20 ans.
- **Historique** : courbe du patrimoine net depuis ta première opération.
- **Alertes** : fortes variations, dérive d'allocation, seuils de prix, concentration, plafonds, épargne de précaution.

## Sécurité

| Élément | Où | Visibilité |
|---|---|---|
| Code de l'app | Dépôt GitHub public | Public |
| Tes données (`data/vault.enc`) et les cours (`data/prices.enc`) | Dépôt + site | **Chiffrés** AES-256-GCM, clé dérivée de ta passphrase (PBKDF2-SHA256, 600 000 itérations) |
| Dates des commits | Dépôt | Public |
| Passphrase | Ta tête + secret GitHub `VAULT_PASSPHRASE` | Privé |
| Token GitHub d'écriture (ce dépôt uniquement) | Dans `vault.enc`, **chiffré** avec tes données | Privé |

- Le déchiffrement se fait **uniquement dans ton navigateur**. La clé ne vit qu'en mémoire et l'app se verrouille après inactivité.
- Une CSP stricte bloque tout script tiers ; aucune analytics, aucun CDN.
- Comme le fichier chiffré est public, **la passphrase doit être longue** (≥ 16 caractères, plusieurs mots non liés). L'app l'impose.
- Compromis assumés :
  - GitHub détient ta passphrase en secret, ce qui est nécessaire pour rafraîchir les cours et envoyer le mail.
  - Le mail hebdo arrive en clair dans ta boîte.
- Une passphrase oubliée = données irrécupérables. Fais un export chiffré de temps en temps (Réglages → Données).

## Mise en route

1. **Créer un dépôt public** sur GitHub (ex. `finaryPerso`) et y pousser ce code :
   ```bash
   git remote add origin https://github.com/<pseudo>/finaryPerso.git
   git push -u origin main
   ```
2. **Activer Pages** : Settings → Pages → Source : **GitHub Actions**.
3. **Ajouter les secrets** (Settings → Secrets and variables → Actions → New repository secret) :
   - `VAULT_PASSPHRASE` : ta passphrase (la même que dans l'app).
   - `SMTP_USER` : ton adresse Gmail.
   - `SMTP_PASS` : un **mot de passe d'application** Google (Compte Google → Sécurité → Validation en deux étapes activée → Mots de passe des applications).
   - `MAIL_TO` : l'adresse qui reçoit le récap.
   - (facultatif) `SMTP_HOST` / `SMTP_PORT` pour un autre fournisseur (défaut `smtp.gmail.com` / `465`).
4. **Ouvrir** `https://<pseudo>.github.io/finaryPerso/` puis **Créer ton patrimoine** avec la même passphrase.
5. **Créer un token** : GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Choisir *Only select repositories* (ce dépôt) et *Repository permissions → Contents : Read and write* **et** *Actions : Read and write* (cette dernière sert au bouton « Actualiser » des cours). Le coller dans l'app (Réglages → GitHub) puis **Enregistrer la connexion**. Il est rangé chiffré dans ton patrimoine : **à saisir une seule fois**, il suit sur tous tes appareils.
6. **Saisir** tes comptes, actifs, transactions, DCA, biens et prêts, puis appuyer sur le bouton **Enregistrer** (icône disquette). Un commit est créé et le site est mis à jour en ~1 min.
7. Lancer une première fois Actions → **Cours** → *Run workflow* pour charger l'historique des cours.
8. **Sur le téléphone** : ouvrir l'URL → Partager → *Sur l'écran d'accueil* (iOS) ou *Installer l'application* (Android).

Le mail part chaque dimanche vers 17h-18h (heure de Paris). Pour le tester tout de suite : Actions → **Mail hebdo** → *Run workflow*.

## Import Trade Republic

Dans l'app Trade Republic : Profil → Paramètres → Activité → **Exporter les transactions** (CSV). Puis dans le dashboard : Investissements → **Importer** (ou Réglages → Données), et dépose le fichier.

- Le PEA et le compte-titres/espèces sont créés, ou rattachés à tes comptes existants. Les actifs sont créés à partir des ISIN.
- Achats, ventes, frais et taxes, dividendes, intérêts, Saveback et attributions gratuites sont importés. Les paiements carte sont regroupés en une ligne par mois, pour que le solde espèces reste exact.
- **Réimporter un export plus récent n'ajoute que les opérations manquantes** : identifiant Trade Republic, sans doublon.
- Les tickers Yahoo sont retrouvés automatiquement depuis l'ISIN par l'Action « Cours ». Les cotations dans une autre devise (USD, CHF…) sont converties en euros.
- Si tu as déclaré un plan DCA, les achats réels importés proches d'une échéance (−3 à +10 jours) sont rattachés au plan au lieu d'être doublés.
- Le fichier est lu uniquement dans ton navigateur.

## Import Kraken

Sur Kraken : Documents → Export → **Balances** (CSV). Puis dans le dashboard : Investissements → **Importer**.

- Kraken ne fournit que des **soldes** : chaque import aligne le compte « Kraken » sur le fichier. Chaque écart devient un achat ou une vente d'ajustement au cours du jour, compensé par un apport ou un retrait.
- Le staking (`ETH.S`…) est fusionné avec l'actif, les symboles Kraken (`XBT`, `ZEUR`…) sont normalisés, et le solde en euros devient les espèces du compte.
- Réimporter le même fichier ne change rien. Un fichier plus récent n'ajoute que les écarts. Un actif absent du fichier est considéré comme vendu.
- Le prix de revient des ajustements est le cours du jour de l'import. Tu peux le corriger dans Transactions.

## Tickers

- **Yahoo Finance** (actions/ETF) : le symbole affiché sur [finance.yahoo.com](https://finance.yahoo.com). Exemples : `CW8.PA` (Amundi MSCI World), `WPEA.PA` (iShares MSCI World PEA), `ESE.PA` (BNP S&P 500), `MC.PA` (LVMH), `AAPL`, `VUSA.L` (cotée en pence, convertie automatiquement).
- **CoinGecko** (crypto) : l'identifiant, ex. `bitcoin`, `ethereum`, `solana`. L'app propose une recherche intégrée.
- **Sans cotation** (UC, SCPI, fonds non cotés) : laisser le ticker vide et saisir un **prix manuel** depuis le détail de la position.

## Développement

```bash
npm install
npm test                 # tests unitaires (Vitest)
npm run demo             # crée data/*.enc avec des données fictives (passphrase demandée) — NE PAS COMMITER
npm run refresh-prices   # récupère les cours (VAULT_PASSPHRASE dans l'environnement)
npm run weekly-report -- --dry-run   # écrit report.html sans envoyer
npm run dev              # http://localhost:5173
npm run build
```

Structure :

- `src/core` : logique métier pure et testée (chiffrement, valorisation, DCA, prêts, alertes…).
- `src/ui` : app React.
- `scripts` : tâches lancées par les GitHub Actions.
- `docs/superpowers` : spec et plans d'implémentation.

## Limites

- Actions/ETF : cours retardés de ~15 à 45 min (Yahoo + Action toutes les 30 min en semaine, 8h-23h). Le bouton **Actualiser** (Accueil ou barre latérale) lance l'Action à la demande, avec ~1 à 2 min d'attente. L'app recharge seule les nouveaux cours toutes les 5 min. La crypto est en direct (CoinGecko, toutes les 60 s).
- L'API Yahoo utilisée n'est pas officielle : elle peut changer. Les erreurs apparaissent dans l'app et dans le mail.
- Historique crypto limité à 365 jours (API publique CoinGecko).
- Intérêts des livrets estimés simplement (pas la règle exacte des quinzaines).
- Sur un dépôt public, GitHub suspend les crons après 60 jours sans activité. Les commits de cours suffisent normalement à l'éviter.
