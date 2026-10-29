# Dashboard patrimoine perso — Design

- **Date** : 2026-10-29
- **Statut** : validé en brainstorming, en relecture
- **Nom de code** : `finaryPerso`

## 1. Objectif

Un dashboard patrimonial personnel façon Finary. Il est **chiffré de bout en bout**, hébergé gratuitement sur GitHub Pages et consultable depuis le téléphone. Il couvre tout le patrimoine : investissements (PEA, CTO, assurance-vie, PER, crypto), épargne réglementée, immobilier, véhicules et biens, dettes.

L'app n'a **aucune connexion aux banques, courtiers ou wallets**. Elle ne passe **aucun ordre** : c'est uniquement du suivi. Les données sont saisies à la main, les cours de marché sont récupérés automatiquement, et un mail récapitulatif part chaque semaine.

### Critères de succès

1. Je peux saisir toutes mes positions et tous mes biens depuis le PC ou le téléphone, et l'enregistrement est persistant.
2. Le patrimoine net et sa répartition sont à jour avec des cours vieux de 45 min au plus en heures de marché.
3. La courbe d'évolution remonte jusqu'à ma première transaction.
4. Mes plans DCA alimentent automatiquement mes positions.
5. Je reçois chaque dimanche un mail récapitulatif avec des alertes pertinentes.
6. Rien de lisible n'est publié sur GitHub : seul le code est en clair.

### Hors périmètre (YAGNI)

- Agrégation bancaire, lecture de wallets on-chain, API de courtiers.
- Passage d'ordres, simulation fiscale complète (IFI, déclaration), multi-utilisateur.
- Répartition géographique et sectorielle des ETF (envisageable en v2).
- Estimation automatique de l'immobilier via DVF (v2).

## 2. Décisions d'architecture

| Sujet | Décision | Raison |
|---|---|---|
| Hébergement | GitHub Pages, **repo public** | Gratuit, Actions illimitées |
| Confidentialité | Tous les fichiers de données chiffrés AES-256-GCM | Le repo étant public, le chiffrement est la seule protection |
| Persistance des éditions | Commit via l'API GitHub REST (`PUT /repos/{o}/{r}/contents/{path}`), token fine-grained `contents:write` limité à ce repo | Édition possible depuis n'importe quel appareil |
| Cours actions/ETF | GitHub Action toutes les 30 min, Yahoo Finance, résultat écrit dans `prices.enc` | Yahoo n'accepte pas les appels directs du navigateur (CORS), pas d'infra en plus |
| Cours crypto et devises | Aussi rafraîchis en direct dans le navigateur (CoinGecko, Frankfurter/BCE) | Ces API acceptent le CORS ; vrai temps réel |
| Mail | GitHub Action hebdo, nodemailer et Gmail SMTP (mot de passe d'application) | Gratuit, fiable |
| Stack | React 18, Vite, TypeScript strict, Tailwind, Recharts, Zustand, vite-plugin-pwa ; Vitest | Cœur TS pur partagé entre navigateur et Node 22 (WebCrypto natif des deux côtés) |

### Compromis assumés

- La passphrase est stockée en secret GitHub (`VAULT_PASSPHRASE`) pour que les Actions puissent déchiffrer. GitHub est donc techniquement en mesure de lire les données.
- Le mail hebdo est en clair dans la boîte Gmail.
- Les dates et la fréquence des commits sont visibles publiquement.

## 3. Structure du repo

```
finaryPerso/
├─ src/
│  ├─ core/                 # logique métier PURE (aucune dépendance DOM/React), testée
│  │  ├─ types.ts           # modèle de données (section 4)
│  │  ├─ crypto.ts          # dérivation de clé, chiffrement/déchiffrement d'enveloppe
│  │  ├─ money.ts           # arrondis, conversion de devises
│  │  ├─ positions.ts       # transactions -> positions, PRU (PMP), PV réalisées
│  │  ├─ dca.ts             # génération des achats DCA, projection
│  │  ├─ loans.ts           # tableau d'amortissement, capital restant dû
│  │  ├─ depreciation.ts    # décote des véhicules et biens
│  │  ├─ savings.ts         # intérêts courus estimés, plafonds
│  │  ├─ valuation.ts       # valorisation complète à une date -> NetWorthBreakdown
│  │  ├─ performance.ts     # XIRR, variations sur une période
│  │  ├─ history.ts         # reconstruction historique et snapshots quotidiens
│  │  ├─ alerts.ts          # moteur d'alertes (section 7)
│  │  └─ report.ts          # données du mail hebdo (sans rendu)
│  ├─ ui/
│  │  ├─ App.tsx, routes, layout (nav du bas sur mobile, barre latérale sur desktop)
│  │  ├─ pages/             # Unlock, Home, Investments, Savings, RealEstate, Assets,
│  │  │                     # Debts, Dca, Transactions, Settings, AccountDetail
│  │  ├─ components/        # cartes, graphiques, formulaires, tableaux, badges
│  │  ├─ store/             # Zustand : vault déchiffré, état de session, état « modifié »
│  │  └─ services/          # githubStore.ts, livePrices.ts, session.ts
│  └─ main.tsx
├─ scripts/
│  ├─ lib/                  # fournisseurs de cours (yahoo, coingecko, ecb), I/O des fichiers chiffrés
│  ├─ refresh-prices.ts
│  ├─ weekly-report.ts      # + templates/email.html.ts
│  └─ init-vault.ts         # crée un vault vide (ou de démo) chiffré
├─ data/                    # vault.enc · prices.enc · history.enc (tous chiffrés)
├─ .github/workflows/       # deploy.yml · refresh-prices.yml · weekly-report.yml · ci.yml
└─ docs/
```

Les tests Vitest sont placés à côté du code (`src/core/*.test.ts`, `scripts/lib/*.test.ts`).

**Règle d'écriture** : un seul écrivain par fichier.
- `vault.enc` : écrit uniquement par l'app.
- `prices.enc` et `history.enc` : écrits uniquement par les Actions.
- Les achats DCA générés ne sont **pas** écrits dans le vault par les Actions. Ils sont recalculés de façon déterministe à partir des plans DCA et de l'historique des cours (section 5.3), ce qui évite tout conflit d'écriture.

## 4. Modèle de données

Tous les montants sont stockés en nombre décimal dans la devise native, et les dates en ISO `YYYY-MM-DD`. La devise de référence est l'EUR.

```ts
type Id = string; // uuid

interface Vault {
  version: 1;
  settings: Settings;
  accounts: Account[];
  instruments: Instrument[];
  transactions: Transaction[];
  dcaPlans: DcaPlan[];
  realEstate: RealEstate[];
  loans: Loan[];
  physicalAssets: PhysicalAsset[];   // véhicules et autres biens
  priceAlerts: PriceAlert[];
}

type AccountType =
  | 'PEA' | 'PEA_PME' | 'CTO' | 'ASSURANCE_VIE' | 'PER'
  | 'LIVRET_A' | 'LDDS' | 'LEP' | 'CEL' | 'PEL' | 'LIVRET_BANCAIRE'
  | 'COMPTE_COURANT' | 'CRYPTO' | 'AUTRE';

interface Account {
  id: Id; name: string; type: AccountType; institution?: string;
  currency: string;              // 'EUR' par défaut
  openedAt?: string;
  // Comptes « solde » (épargne, compte courant, fonds euro d'une AV) :
  balanceHistory?: { date: string; balance: number }[]; // la dernière entrée fait foi
  interestRate?: number;         // taux annuel, ex. 0.024
  ceiling?: number;              // valeur par défaut selon le type (section 6.5), modifiable
  archived?: boolean;
}

type InstrumentKind = 'STOCK' | 'ETF' | 'FUND' | 'BOND' | 'CRYPTO' | 'OTHER';
type AssetClass = 'ACTIONS' | 'OBLIGATIONS' | 'CRYPTO' | 'IMMOBILIER' | 'CASH' | 'BIENS' | 'AUTRE';

interface Instrument {
  id: Id; name: string; kind: InstrumentKind; assetClass: AssetClass;
  currency: string;
  yahooSymbol?: string;          // 'CW8.PA', 'AAPL', 'ESE.PA'
  coingeckoId?: string;          // 'bitcoin'
  isin?: string;
  manualPrice?: { date: string; price: number }[]; // pour les instruments sans cotation (UC, SCPI...)
}

type TxType = 'BUY' | 'SELL' | 'DIVIDEND' | 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'INTEREST';

interface Transaction {
  id: Id; accountId: Id; date: string; type: TxType;
  instrumentId?: Id;             // obligatoire pour BUY/SELL/DIVIDEND
  quantity?: number;             // BUY/SELL
  unitPrice?: number;            // devise de l'instrument
  amount?: number;               // DEPOSIT/WITHDRAWAL/FEE/INTEREST/DIVIDEND (devise du compte)
  fees?: number;
  fxRate?: number;               // EUR par unité de devise, figé à la date (rempli automatiquement si absent)
  note?: string;
  dcaPlanId?: Id; dcaDate?: string; // présents si la transaction est la correction manuelle d'un achat DCA
}

interface DcaPlan {
  id: Id; name: string; accountId: Id; instrumentId: Id;
  amount: number;                // montant investi par échéance, en EUR (frais inclus)
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';
  dayOfMonth?: number;           // 1-28 pour MONTHLY/QUARTERLY
  dayOfWeek?: number;            // 1-7 pour WEEKLY/BIWEEKLY
  startDate: string; endDate?: string;
  feesPct?: number;              // ex. 0.0 pour Trade Republic, 0.005 pour d'autres
  fractional: boolean;           // true : quantité fractionnaire ; false : arrondi à l'unité inférieure (le reste n'est pas investi)
  paused?: boolean;
  expectedAnnualReturn?: number; // pour la projection, 0.07 par défaut
}

interface RealEstate {
  id: Id; name: string; kind: 'RESIDENCE_PRINCIPALE' | 'LOCATIF' | 'RESIDENCE_SECONDAIRE' | 'SCPI_DIRECTE' | 'AUTRE';
  address?: string; surfaceM2?: number;
  purchaseDate: string; purchasePrice: number; notaryFees?: number; worksCost?: number;
  ownershipPct: number;          // 0..1
  valuations: { date: string; value: number; source?: string }[]; // la dernière fait foi ; sinon prix d'achat
  monthlyRent?: number; monthlyCharges?: number; annualPropertyTax?: number;
  loanIds: Id[];
}

interface Loan {
  id: Id; name: string; kind: 'IMMOBILIER' | 'CONSO' | 'AUTO' | 'ETUDIANT' | 'AUTRE';
  principal: number; annualRate: number; durationMonths: number;
  startDate: string;             // date de la première échéance
  insuranceMonthly?: number;
  ownershipPct?: number;         // 1 par défaut
  manualOutstanding?: { date: string; amount: number }[]; // remplace le calcul si présent (remboursement anticipé, etc.)
}

interface PhysicalAsset {
  id: Id; name: string; kind: 'VEHICULE' | 'MONTRE' | 'ART' | 'OR_PHYSIQUE' | 'AUTRE';
  purchaseDate: string; purchasePrice: number;
  depreciation: { model: 'DEGRESSIVE'; annualRate: number }   // véhicule : 0.15 par défaut
              | { model: 'LINEAR'; years: number; residualPct: number }
              | { model: 'NONE' };
  valuations: { date: string; value: number }[];              // une cote manuelle remplace le modèle à partir de sa date
  loanIds: Id[];
}

interface PriceAlert {
  id: Id; instrumentId: Id;
  condition: 'PRICE_BELOW' | 'PRICE_ABOVE' | 'GAIN_PCT_ABOVE' | 'LOSS_PCT_BELOW';
  threshold: number; note?: string; active: boolean;
}

interface Settings {
  baseCurrency: 'EUR';
  targetAllocation: Partial<Record<AssetClass, number>>; // somme = 1
  alertThresholds: {
    weeklyMovePct: number;       // 0.05
    monthlyMovePct: number;      // 0.10
    allocationDriftPts: number;  // 0.05
    concentrationPct: number;    // 0.20
    emergencyFundMin?: number;   // montant minimum d'épargne de précaution
    ceilingWarnPct: number;      // 0.90
  };
  emergencyFundAccountIds: Id[];
  hideAmountsByDefault: boolean;
  autoLockMinutes: number;       // 10
  github: { owner: string; repo: string; branch: string }; // le token N'EST PAS ici (section 8)
}
```

### Fichiers Actions

```ts
interface PriceFile {          // prices.enc
  updatedAt: string;          // ISO datetime
  quotes: Record<string /*yahooSymbol|cg:id*/, { price: number; currency: string; asOf: string; changePct1d?: number }>;
  fx: Record<string /*'USD'*/, number /*EUR par unité*/>;
  closes: Record<string, Record<string /*date*/, number>>;  // historique des clôtures quotidiennes, depuis la 1re transaction
  fxCloses: Record<string, Record<string, number>>;
  errors: { symbol: string; message: string; at: string }[];
}

interface HistoryFile {        // history.enc
  snapshots: { date: string; net: number; gross: number; debts: number;
               byClass: Record<AssetClass, number>; byAccount: Record<Id, number>; invested: number }[];
}
```

## 5. Règles de calcul (`src/core`)

### 5.1 Positions et PRU

On traite les transactions d'un couple (compte, instrument) dans l'ordre chronologique, à date égale dans l'ordre d'insertion.
- **BUY** : `qty += q` ; `costBasis += q*price*fx + fees*fx` ; `PRU = costBasis/qty` (prix moyen pondéré, frais inclus).
- **SELL** : `PV réalisée = q*price*fx - fees*fx - q*PRU` ; `costBasis -= q*PRU` ; `qty -= q`. Une vente supérieure à la quantité détenue est une erreur de validation.
- **DIVIDEND** : s'ajoute aux revenus de la position.
- Les achats DCA virtuels (5.3) sont fusionnés avant ce traitement.
- `valeur = qty * cours * fx(EUR)` ; `PV latente = valeur - costBasis`.
- Le cours est pris dans cet ordre de priorité : cotation live du navigateur (crypto), puis `prices.enc`, puis le dernier `manualPrice`, puis le dernier prix de transaction. Chaque cours a un `asOf`.

### 5.2 Cash des comptes d'investissement

Le cash d'un compte d'investissement vaut `Σ DEPOSIT - Σ WITHDRAWAL - Σ achats + Σ ventes + Σ DIVIDEND + Σ INTEREST - Σ FEE`. Il est affiché, et s'il est négatif l'app affiche un avertissement sans bloquer.

Pour les comptes « solde » (livrets, compte courant), c'est la dernière entrée de `balanceHistory` qui fait foi. S'y ajoutent les intérêts courus estimés (5.6), affichés séparément.

### 5.3 DCA

`generateDcaBuys(plan, closes, today)` liste les échéances entre `startDate` et `min(endDate, today)`, en excluant les périodes `paused`.

Pour chaque échéance :
- On prend le cours de clôture du jour, ou à défaut du jour de cotation **suivant** (jour férié ou week-end).
- `investi = amount * (1 - feesPct)` ; `qty = investi / (close * fx)`, ou `floor(...)` si `!fractional`.
- On produit un BUY virtuel d'id `dca:{planId}:{date}`.

Si une transaction réelle porte `dcaPlanId` et `dcaDate`, elle **remplace** l'achat virtuel correspondant (correction du prix réel ou des frais). Une échéance sans cours disponible est marquée « en attente » et n'est pas comptée.

Chaque achat DCA (virtuel ou corrigé) génère aussi un **versement implicite** du même montant sur le compte, pour que le cash ne devienne pas négatif. Il ne faut donc **pas** saisir à part les versements qui financent un DCA. En cas de correction réelle, le versement implicite vaut le montant réel (prix × qté + frais).

**Projection** : versements futurs capitalisés au taux mensuel `(1+r)^(1/12)-1` sur 5, 10 et 20 ans, avec la valeur actuelle de la position comme point de départ. Le résultat affiche le total versé, la valeur projetée et les intérêts composés.

### 5.4 Prêts

Mensualité constante `M = P*i/(1-(1+i)^-n)` avec `i = taux/12`.
- Le capital restant dû à une date est calculé après la dernière échéance passée.
- Si `manualOutstanding` est renseigné, on part de la dernière valeur manuelle et on poursuit le tableau à partir de là, en gardant la même mensualité.
- Le résultat est multiplié par la quote-part détenue.
- L'app affiche aussi le coût total du crédit et la date de fin.

### 5.5 Biens

**Immobilier** : `valeur = dernière estimation (ou prix d'achat) * ownershipPct`.
- `Équité = valeur - Σ capital restant dû des prêts liés`.
- `Rendement brut = loyer*12 / (prix + frais + travaux)`.
- `Rendement net = (loyer - charges)*12 - taxe foncière`, rapporté au même dénominateur.

**Biens physiques** :
- `DEGRESSIVE` : `prix * (1-taux)^années` (années fractionnaires).
- `LINEAR` : la valeur décroît linéairement jusqu'à `résiduel` au bout de `years`.
- `NONE` : prix d'achat.
- Une cote manuelle remplace le modèle à sa date, et la décote reprend ensuite à partir de cette valeur.

### 5.6 Épargne

- **Intérêts courus estimés** : `solde * taux * jours écoulés dans l'année / 365`. C'est une simplification de la règle des quinzaines, signalée comme « estimation ».
- **Plafonds par défaut** : Livret A 22 950 €, LDDS 12 000 €, LEP 10 000 €, CEL 15 300 €, PEL 61 200 €, PEA 150 000 € de versements, PEA-PME 225 000 € cumulés avec le PEA. Tous modifiables dans Réglages.

### 5.7 Valorisation et répartition

`valueAt(vault, prices, date)` renvoie la structure suivante :
```ts
interface NetWorthBreakdown { date; gross; debts; net; byClass; byAccountType; byAccount; positions: PositionView[] }
```
Répartition par classe d'actif :
- Titres : selon `instrument.assetClass`.
- Cash des comptes d'investissement et comptes « solde » : `CASH`, sauf les fonds euro d'une AV, comptés en `OBLIGATIONS`.
- Immobilier : `IMMOBILIER`.
- Biens physiques : `BIENS`.
- Les dettes sont soustraites dans `net` et listées à part.

### 5.8 Performance

- **Variation sur une période** (1S, 1M, YTD, 1A, Max) : `net(fin) - net(début) - flux externes nets de la période`. Les flux externes sont les versements et retraits sur les comptes d'investissement, versements implicites DCA compris (5.3), ainsi que les variations de solde des comptes « solde » hors intérêts estimés. L'app affiche à la fois la variation brute et la variation hors apports.
- **XIRR** par compte et global sur les flux (versements négatifs, valeur actuelle positive). Méthode de Newton avec repli sur la bissection, tolérance 1e-7, 100 itérations maximum. Si le calcul ne converge pas, l'app affiche « n/d ».

### 5.9 Historique

- `rebuildHistory(vault, prices, from, to)` produit un snapshot par jour. Pour chaque jour, on applique les transactions jusqu'à cette date, on prend la dernière clôture connue à cette date et on interpole linéairement les estimations des biens.
- C'est l'app qui l'appelle quand le vault change (ajout d'une transaction ancienne).
- L'Action écrit le snapshot du jour dans `history.enc`.
- La courbe affichée = snapshots stockés + recalcul du jour courant en live.

## 6. Interface

**Principes** :
- Mobile-first, mode sombre par défaut (clair disponible).
- Nav du bas sur mobile, avec 5 entrées : Accueil, Investir, Biens, DCA, Plus. Barre latérale sur desktop.
- Chiffres en `font-variant-numeric: tabular-nums`, montants formatés `fr-FR`. Vert et rouge pour les variations, toujours doublés d'un signe +/−.
- Squelettes de chargement, états vides avec un appel à l'action « Ajouter… ».
- Formulaires en tiroir (bottom sheet) sur mobile.

| Page | Contenu |
|---|---|
| **Déverrouillage** | Champ passphrase, indicateur de force à la création, « initialiser un vault » au premier lancement |
| **Accueil** | Patrimoine net (masquable), variation sur la période avec sélecteur 1S/1M/YTD/1A/Max, courbe d'aire net/brut, donut par classe et par enveloppe, cartes Investissements/Épargne/Immobilier/Biens/Dettes, top 3 hausses et baisses du jour, alertes actives, prochaines échéances DCA, fraîcheur des cours |
| **Investissements** | Onglets par compte (PEA, CTO, AV, PER, Crypto) ; tableau des positions : nom, qté, PRU, cours, valeur, PV €/%, variation du jour, poids ; tri ; ligne de cash ; XIRR du compte ; détail d'une position : graphique de cours avec marqueurs d'achat, transactions, alertes |
| **Épargne** | Livrets et comptes courants : solde, taux, intérêts estimés, jauge de plafond, mise à jour rapide du solde |
| **Immobilier** | Fiches de biens : valeur, équité, rendements, prêt lié (CRD, fin), historique des estimations |
| **Biens** | Véhicules et autres : valeur décotée, courbe de décote, cote manuelle |
| **Dettes** | Prêts : CRD, mensualité, % remboursé, graphique d'amortissement, date de fin |
| **DCA** | Plans (actif, montant, fréquence, total investi, valeur, PV), calendrier des prochaines échéances, échéances « en attente », corriger un achat, projection sur 5/10/20 ans (graphique empilé versé / intérêts) |
| **Transactions** | Liste filtrable (compte, type, période, recherche), ajout, édition, suppression, achats DCA virtuels signalés par un badge |
| **Réglages** | Allocation cible (curseurs dont la somme vaut 100 %), seuils d'alerte, alertes de prix, plafonds, connexion GitHub (owner, repo, token), changement de passphrase, export JSON chiffré et en clair (avec confirmation), import, verrouillage auto, devise |

**Saisie d'instrument** : pas de recherche Yahoo (impossible depuis le navigateur, et l'Action est asynchrone). La saisie se fait donc à la main du ticker Yahoo, avec une aide (exemples `CW8.PA`, `ESE.PA`, `AAPL`) et un lien « vérifier sur Yahoo ». Pour la crypto, une recherche CoinGecko en direct (`/search`, compatible CORS). Le prix est validé au prochain passage de l'Action ; d'ici là, le prix de la dernière transaction est utilisé.

**Bouton Enregistrer** : persistant dès qu'il y a des modifications non sauvegardées, avec un compteur. La sauvegarde déclenche un commit. Si l'utilisateur quitte la page avec des modifications en attente, un avertissement `beforeunload` s'affiche.

## 7. Alertes (`alerts.ts`)

Chaque alerte a un niveau (`info`, `warn` ou `critical`), un titre, un détail et la ressource liée.

1. **Variations** : position ou compte qui a bougé de ±`weeklyMovePct` sur 7 jours ou de ±`monthlyMovePct` sur 30 jours ; top 3 et flop 3 de la semaine.
2. **Dérive d'allocation** : écart entre l'allocation réelle et la cible supérieur à `allocationDriftPts`. Suggestion : « orienter les prochains versements vers X », en ciblant la classe la plus sous-pondérée.
3. **Seuils de prix** : `PriceAlert` actives déclenchées.
4. **Concentration** : une position représente plus de `concentrationPct` du patrimoine brut.
5. **Plafonds** : compte à au moins `ceilingWarnPct` de son plafond (`critical` s'il est atteint).
6. **Épargne de précaution** : somme des comptes `emergencyFundAccountIds` inférieure à `emergencyFundMin`.
7. **Données** : cours ancien (plus de 3 jours ouvrés pour un titre coté), échéances DCA en attente, erreurs de l'Action, prêt dont le CRD est calculé alors qu'aucune valeur manuelle n'a été saisie depuis plus d'un an (info).

## 8. Sécurité

- **Format d'enveloppe** (JSON) : `{ v:1, kdf:'PBKDF2-SHA256', iter:600000, salt:b64(16o), iv:b64(12o), ct:b64 }`, chiffré en AES-256-GCM. Chaque écriture utilise un nouvel IV. Le sel est commun aux trois fichiers, ce qui permet de ne dériver la clé qu'une fois par session.
- **Passphrase** : 16 caractères minimum, et un score zxcvbn d'au moins 3 est exigé à la création et au changement.
- **Changement de passphrase** : les trois fichiers sont rechiffrés. L'app rechiffre `vault.enc`. L'app pouvant déchiffrer les deux autres fichiers, elle les rechiffre aussi avec un nouveau sel, commite les trois en une fois (API Git Data : tree + commit) et affiche la consigne de mettre à jour le secret `VAULT_PASSPHRASE` ; tant que ce n'est pas fait, l'Action échoue proprement.
- **Clé en mémoire uniquement** (CryptoKey non extractible). Le verrouillage la supprime, ainsi que le vault déchiffré. Verrouillage automatique après `autoLockMinutes` d'inactivité et quand l'onglet reste caché plus de 5 min.
- **Token GitHub** : chiffré avec la clé de session et stocké dans `localStorage` (`fp.ghToken.enc`). Il n'est jamais commité. Pour le créer : token *fine-grained*, repo unique, `Contents: Read and write` ; un lien de création pré-rempli est proposé.
- **Lecture** des fichiers `.enc` : directement depuis le site Pages (fichiers publics). Si un token est configuré, l'app lit via l'API pour avoir la version la plus récente (le cache de Pages peut avoir plusieurs minutes de retard).
- **CSP** (balise meta) : `default-src 'self'; connect-src 'self' https://api.github.com https://api.coingecko.com https://api.frankfurter.app; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'`. Aucun CDN, aucune analytics.
- **Masquage des montants** : remplacés par `••••` (en mémoire et à l'affichage).
- **Pas de service worker pour les données** : il ne met en cache que les assets statiques, jamais les `.enc` (évite de servir des données périmées).

## 9. GitHub Actions

| Workflow | Déclencheur | Rôle |
|---|---|---|
| `ci.yml` | push / PR | `npm ci`, lint, typecheck, `vitest run`, build |
| `deploy.yml` | push sur `main` + `workflow_call` + manuel | Build Vite (`base: '/<repo>/'`), déploiement Pages via `actions/deploy-pages` ; `data/` est copié dans le build |
| `refresh-prices.yml` | cron `*/30 6-21 * * 1-5` (UTC) + `0 */2 * * 0,6` + manuel | Déchiffre le vault, collecte les symboles, récupère les cours Yahoo (endpoint chart v8 : dernier cours + clôtures quotidiennes manquantes), CoinGecko, BCE ; écrit `prices.enc` ; recalcule et ajoute le snapshot du jour dans `history.enc` ; commit `chore(data): prices` seulement s'il y a un changement ; puis déclenche le déploiement |
| `weekly-report.yml` | cron `0 16 * * 0` (UTC, soit 17h ou 18h à Paris) + manuel | Déchiffre, construit le rapport, envoie le mail ; n'écrit rien |

- **Commits des Actions** : `concurrency: data-writer` pour sérialiser, `git pull --rebase` avant le push, 3 tentatives.
- **Cours Yahoo** : pause de 300 ms entre deux symboles, User-Agent de navigateur ; un symbole en échec est ajouté à `errors` sans bloquer les autres.
- **Clôtures historiques** : récupérées depuis la date de la première transaction de chaque symbole au premier passage, puis de façon incrémentale.
- **Redéploiement** : le déploiement Pages est relancé depuis le workflow de cours (`workflow_call`), car les commits faits avec `GITHUB_TOKEN` ne déclenchent pas d'autres workflows.
- **Commits de l'app** (vault) : un commit fait avec le PAT de l'utilisateur déclenche bien `deploy.yml`. On déploie donc à chaque push, sans filtre de chemins : le site est petit et un build prend environ 1 min.
- **Secrets** : `VAULT_PASSPHRASE`, `SMTP_HOST` (défaut `smtp.gmail.com`), `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, `MAIL_TO`.

## 10. Mail hebdo

- **Objet** : `Patrimoine · semaine du {date} · {net} ({±x,x %})`.
- **Format** : HTML responsive à tableaux et styles inline, avec une version texte.

Contenu, dans l'ordre :
1. Patrimoine net et brut, dettes ; variation sur la semaine, le mois et l'année (brute et hors apports).
2. Mini-graphique du patrimoine net sur 12 semaines en barres HTML (pas d'image externe).
3. Répartition actuelle comparée à la cible.
4. Top 3 et flop 3 des positions de la semaine.
5. **Positions à surveiller** : toutes les alertes `warn` et `critical`, regroupées par famille.
6. Achats DCA de la semaine et à venir la semaine suivante ; échéances en attente.
7. Santé des données : fraîcheur des cours, erreurs.
8. Lien vers le dashboard.

## 11. Gestion des erreurs

| Cas | Comportement |
|---|---|
| Mauvaise passphrase | Le déchiffrement échoue sur le tag GCM, message « Passphrase incorrecte », pas de détail |
| `vault.enc` absent | Écran « Créer un nouveau patrimoine » (ou import) |
| Conflit 409 / SHA périmé à l'enregistrement | Recharger le vault distant ; s'il n'a pas changé côté contenu, réessayer ; sinon proposer « écraser » ou « recharger et perdre mes modifs » (un seul écrivain humain, donc fusion inutile) |
| Token absent ou invalide (401/403) | L'enregistrement est désactivé et un lien vers Réglages s'affiche ; l'export local reste possible |
| Hors ligne | Lecture depuis la dernière version en mémoire de session uniquement ; enregistrement désactivé |
| Cours manquant | Dernier connu + badge « ancien (date) » ; valeur au PRU si jamais coté |
| JSON du vault invalide ou d'une version inconnue | Message d'erreur et proposition d'export brut ; migrations de schéma via `version` |
| Échec SMTP | L'Action échoue, ce qui déclenche la notification GitHub d'échec de workflow |

Le vault est validé avec **zod** au chargement et avant chaque enregistrement.

## 12. Tests

- **TDD** sur `src/core` avec Vitest, objectif de couverture d'au moins 90 % sur `core` :
  - crypto (aller-retour, mauvaise passphrase, IV unique) ;
  - PRU et PV réalisée (cas de ventes partielles, frais, devise) ;
  - DCA (jours fériés, fractionnaire ou non, pause, correction réelle) ;
  - prêts (comparaison avec un tableau d'amortissement connu) ;
  - décote ; XIRR (cas de référence) ;
  - valorisation, alertes (chaque famille), historique, rapport.
- **Scripts** : fournisseurs de cours testés avec des réponses `fetch` simulées à partir de fixtures.
- **UI** : tests légers React Testing Library sur les formulaires critiques (transaction, plan DCA), puis vérification manuelle dans le navigateur (mobile 375 px et desktop) avant livraison.
- **Données de démo** : `npm run demo` génère un vault fictif complet pour développer et tester.

## 13. Mise en route (README)

1. Forker ou créer le repo public, activer Pages (source : GitHub Actions).
2. Lancer `npm run init-vault` en local : saisie de la passphrase, création de `data/vault.enc` vide, commit.
3. Ajouter les secrets (section 9). Pour le mot de passe d'application Gmail : Compte Google, puis Sécurité, puis Validation en deux étapes, puis Mots de passe des applications.
4. Créer un token fine-grained et le saisir dans Réglages sur chaque appareil.
5. Sur le téléphone : ouvrir l'URL Pages, puis « Ajouter à l'écran d'accueil ».
