import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Énums
// ---------------------------------------------------------------------------

export const planEnum = pgEnum('plan', ['starter', 'pro', 'business']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member']);
export const pipelineEnum = pgEnum('pipeline', ['image', 'video', 'mixed']);
export const resolutionEnum = pgEnum('resolution', ['480p', '720p']);

// `failed` n'est pas dans le cahier des charges mais tous les autres états
// sont non terminaux en cas d'erreur : sans lui, un crash de pipeline
// laisserait une vidéo bloquée dans `generating`.
export const videoStatusEnum = pgEnum('video_status', [
  'draft',
  'validated',
  'generating',
  'rendering',
  'rendered',
  'published',
  'failed',
]);

export const ratioEnum = pgEnum('ratio', ['16:9', '9:16']);

/**
 * L'apparence des sous-titres.
 *
 * C'est l'élément le plus présent d'une vidéo : un titre passe trois fois, une
 * transition dure une demi-seconde, un sous-titre est là du début à la fin.
 * Son style décide donc de l'allure de toute la production, et c'est pour ça
 * qu'il y en a plusieurs.
 *
 * Les six derniers sont transposés des composants `caption-*` du registre
 * HyperFrames (`docs/vocabulaire-de-rendu.md`).
 */
export const subtitleStyleEnum = pgEnum('subtitle_style', [
  'karaoke',
  'fondant',
  'cinematic',
  'highlight',
  'pill',
  'wipe',
  'neon',
  'gradient',
  'blend',
]);

/**
 * La provenance de la durée d'un plan. `estimated` est déduit du texte de
 * narration avant l'existence de la voix off ; `measured` est la longueur
 * réelle de l'audio généré. Seul un storyboard mesuré peut être facturé au
 * prix exact.
 */
export const durationSourceEnum = pgEnum('duration_source', [
  'estimated',
  'measured',
]);

export const soundKindEnum = pgEnum('sound_kind', ['sfx', 'ambient', 'music']);

export const shotTypeEnum = pgEnum('shot_type', ['image', 'video']);
export const shotStatusEnum = pgEnum('shot_status', [
  'pending',
  'generating',
  'ready',
  'failed',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const creditReasonEnum = pgEnum('credit_reason', [
  'signup_grant',
  'subscription_grant',
  'topup',
  'video_debit',
  'video_refund',
  'manual_adjustment',
  // Fin de cycle : le quota du plan tombe, les crédits achetés ne bougent pas.
  'plan_expiry',
]);

/**
 * Les deux poches d'un solde.
 *
 * `plan` est le quota mensuel : il tombe en fin de cycle. `topup` est ce que
 * le client a **payé en plus** : il n'expire jamais — faire expirer ce qu'un
 * client a acheté, c'est du vol.
 *
 * Un débit prend d'abord dans `plan`, la poche périssable, pour que personne
 * ne perde de la valeur qu'il aurait pu consommer.
 */
export const creditPocketEnum = pgEnum('credit_pocket', ['plan', 'topup']);

export const publicationStatusEnum = pgEnum('publication_status', [
  'scheduled',
  'uploading',
  'published',
  'failed',
]);

// ---------------------------------------------------------------------------
// Multi-tenance
// ---------------------------------------------------------------------------

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  plan: planEnum('plan').notNull().default('starter'),
  // Total courant dénormalisé de `credit_ledger`. Uniquement muté via
  // lib/credits — voir le test d'invariant dans lib/credits/credits.test.ts.
  /**
   * Total des deux poches, dénormalisé pour que le solde se lise sans agréger
   * le grand livre. Toujours égal à `creditsPlan + creditsTopup`.
   */
  creditsBalance: integer('credits_balance').notNull().default(0),
  /** Quota du cycle en cours. Tombe à `planCreditsExpireAt`. */
  creditsPlan: integer('credits_plan').notNull().default(0),
  /** Crédits achetés. N'expirent jamais. */
  creditsTopup: integer('credits_topup').notNull().default(0),
  /** Fin du cycle courant. `null` tant qu'aucun quota n'a été accordé. */
  planCreditsExpireAt: timestamp('plan_credits_expire_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 100 }),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('users_tenant_id_idx').on(t.tenantId)]
);

export const invitations = pgTable(
  'invitations',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: varchar('email', { length: 255 }).notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    invitedBy: integer('invited_by')
      .notNull()
      .references(() => users.id),
    invitedAt: timestamp('invited_at').notNull().defaultNow(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
  },
  (t) => [index('invitations_tenant_id_idx').on(t.tenantId)]
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: integer('user_id').references(() => users.id),
    action: text('action').notNull(),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
    ipAddress: varchar('ip_address', { length: 45 }),
  },
  (t) => [index('activity_logs_tenant_id_idx').on(t.tenantId)]
);

// ---------------------------------------------------------------------------
// Domaine de génération vidéo
//
// Chaque table ci-dessous porte `tenant_id` même quand elle est joignable via
// une FK parente (shots -> videos -> projects -> tenant). Cette dénormalisation
// est ce qui permet à tenantDb() d'imposer une simple clause WHERE au lieu
// d'une chaîne de jointures, et c'est ce que les tests d'isolation vérifient.
// ---------------------------------------------------------------------------

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: 120 }).notNull(),
    defaultPipeline: pipelineEnum('default_pipeline').notNull().default('mixed'),
    voiceId: varchar('voice_id', { length: 100 }),
    youtubeChannelId: varchar('youtube_channel_id', { length: 100 }),
    stylePrompt: text('style_prompt'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('projects_tenant_id_idx').on(t.tenantId)]
);

export const videos = pgTable(
  'videos',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    title: varchar('title', { length: 200 }).notNull(),
    // Le prompt/thème à partir duquel le storyboard est généré (cahier des
    // charges §4.2). Conservé pour qu'une régénération pose la même question,
    // au lieu de le redériver du titre modifié depuis par quelqu'un.
    theme: text('theme'),
    status: videoStatusEnum('status').notNull().default('draft'),
    pipelineOverride: pipelineEnum('pipeline_override'),
    // Détermine la tarification en crédits : 1 crédit/s en 480p,
    // 3 crédits/s en 720p (docs/tarifs.md).
    resolution: resolutionEnum('resolution').notNull().default('480p'),
    // --- Réglages de rendu, sérialisés dans le storyboard Hyperframes -----
    ratio: ratioEnum('ratio').notNull().default('16:9'),
    /** Nom de la voix ou id du fournisseur. Null hérite de la voix du projet. */
    voice: varchar('voice', { length: 60 }),
    subtitles: boolean('subtitles').notNull().default(true),
    subtitleStyle: subtitleStyleEnum('subtitle_style')
      .notNull()
      .default('karaoke'),
    /** Musique de fond : clé R2. Les volumes sont des gains 0..1, pas de l'argent. */
    musicUrl: text('music_url'),
    musicVolume: real('music_volume').notNull().default(0.09),
    /** Multiplicateur global sur tous les sons de scène. 0 coupe tous les SFX d'un coup. */
    sfxVolume: real('sfx_volume').notNull().default(1),
    /**
     * Décidé **au débit**, pas au rendu : une vidéo garde la marque avec
     * laquelle elle a été payée. Sinon un client qui s'abonne après coup
     * réclamerait le rendu propre de sa vidéo d'essai — et il aurait raison.
     */
    watermarked: boolean('watermarked').notNull().default(false),
    /**
     * Clé R2 du MP4 final. Vide jusqu'à la fin du montage.
     *
     * Stockée plutôt que dérivée d'une convention : un rendu qui échoue et
     * qu'on relance produit une nouvelle exécution, et c'est celle qui a
     * abouti qui doit être servie au client.
     */
    outputUrl: text('output_url'),
    creditsEstimated: integer('credits_estimated').notNull().default(0),
    creditsConsumed: integer('credits_consumed').notNull().default(0),
    youtubeVideoId: varchar('youtube_video_id', { length: 32 }),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('videos_tenant_id_idx').on(t.tenantId),
    index('videos_project_id_idx').on(t.projectId),
  ]
);

export const shots = pgTable(
  'shots',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    videoId: integer('video_id')
      .notNull()
      .references(() => videos.id),
    order: integer('order').notNull(),
    type: shotTypeEnum('type').notNull(),
    /** Prompt visuel, en anglais : les modèles image et vidéo l'exigent. */
    prompt: text('prompt').notNull(),
    /**
     * La ligne que la voix lit, dans la langue propre de la vidéo. C'est le
     * champ à partir duquel tout le reste est dérivé : l'audio, donc la
     * durée, donc le prix.
     */
    narration: text('narration'),
    /** Texte du sous-titre quand il doit différer de la narration. */
    subtitle: text('subtitle'),
    /** Clé R2 de la voix off générée. */
    audioUrl: text('audio_url'),
    /**
     * Quelle voix a produit `audioUrl` : `edge`, `polly` ou `elevenlabs`.
     *
     * La voix off se fait en **deux passes**, et cette colonne est ce qui les
     * distingue. La première parle avant que le client ait payé — donc avec
     * Edge TTS, gratuit — et c'est elle qui mesure la durée, donc le prix. La
     * seconde, après validation, livre la voix du plan. Sans ce champ, la
     * seconde passe ne saurait pas quelles scènes elle a déjà refaites et
     * repaierait le fournisseur à chaque reprise.
     */
    voiceProvider: varchar('voice_provider', { length: 20 }),
    /**
     * Secondes. Fractionnaires, car une piste audio mesurée fait 5,28 s,
     * pas 5. Écrite par l'estimateur avant la voix off puis écrasée par la
     * longueur réelle ensuite — voir `durationSource`.
     */
    durationS: real('duration_s').notNull(),
    durationSource: durationSourceEnum('duration_source')
      .notNull()
      .default('estimated'),
    /**
     * Timings mot à mot pour les sous-titres karaoké, sous la forme
     * `[{ text, start, duration }]` en secondes depuis le début de la scène.
     * Produits par l'étape voix off — jamais écrits à la main.
     */
    words: jsonb('words'),
    /**
     * Mise en scène et sound design : zoom, transition, mouvement caméra,
     * overlays et titres animés, sons par scène, cartes, volumes. Validé par
     * le contrat zod de lib/storyboard/render.ts, qui est la même forme que
     * consomme la composition Hyperframes — donc extensible sans migration.
     */
    render: jsonb('render'),
    /**
     * Clé R2 de l'image fixe de la scène.
     *
     * Séparée de `assetUrl` parce qu'un plan animé a **deux** assets : Wan
     * fait de l'image-to-video, donc la fixe est la matière première du clip,
     * pas un brouillon. Les confondre dans une colonne fait qu'une reprise du
     * clip repaie l'image — et l'image d'un plan animé est ce qui décide de son
     * cadrage, donc on veut pouvoir régénérer le clip sans rejouer le dé.
     */
    sourceImageUrl: text('source_image_url'),
    /** Ce que le rendu consomme : l'image fixe, ou le clip pour un plan animé. */
    assetUrl: text('asset_url'),
    status: shotStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('shots_tenant_id_idx').on(t.tenantId),
    index('shots_video_id_order_idx').on(t.videoId, t.order),
  ]
);

export const jobs = pgTable(
  'jobs',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    videoId: integer('video_id')
      .notNull()
      .references(() => videos.id),
    step: varchar('step', { length: 60 }).notNull(),
    // Id côté fournisseur (prédiction Replicate, rendu Lambda, ...). Unique
    // pour qu'un webhook rejoué ne résolve qu'exactement un job.
    externalId: varchar('external_id', { length: 120 }),
    status: jobStatusEnum('status').notNull().default('queued'),
    payload: jsonb('payload'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('jobs_tenant_id_idx').on(t.tenantId),
    index('jobs_video_id_idx').on(t.videoId),
    uniqueIndex('jobs_external_id_uq').on(t.externalId),
  ]
);

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // Négatif pour un débit, positif pour une dotation/recharge/remboursement.
    delta: integer('delta').notNull(),
    reason: creditReasonEnum('reason').notNull(),
    /**
     * Poche touchée. Un débit qui traverse les deux écrit deux lignes, une par
     * poche, pour que le grand livre reste lisible ligne à ligne.
     */
    pocket: creditPocketEnum('pocket').notNull().default('plan'),
    videoId: integer('video_id').references(() => videos.id),
    balanceAfter: integer('balance_after').notNull(),
    // Posé par les écritures pilotées par webhook (GeniusPay, Replicate) pour
    // qu'un replay soit un no-op plutôt qu'un double crédit.
    idempotencyKey: varchar('idempotency_key', { length: 120 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('credit_ledger_tenant_id_created_at_idx').on(t.tenantId, t.createdAt),
    uniqueIndex('credit_ledger_idempotency_key_uq').on(t.idempotencyKey),
  ]
);

export const youtubeTokens = pgTable(
  'youtube_tokens',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    // Texte chiffré AES-256-GCM produit par lib/crypto/encryption.ts.
    // Ne jamais logger ces colonnes, ne jamais les exposer via une route API.
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    scope: text('scope'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('youtube_tokens_tenant_id_uq').on(t.tenantId)]
);

/**
 * Bibliothèque de sons — SFX, ambiances et nappes musicales disponibles pour
 * tous les tenants.
 *
 * Niveau plateforme volontairement : elle ne porte pas de `tenant_id` et est
 * donc la seule table hors `tenants` que tenantDb() ne scope pas. C'est un
 * catalogue d'actifs partagés, comme une liste de polices — rien de ce qu'elle
 * contient n'appartient à un client, et chaque ligne est lisible par tous.
 *
 * `impacts` porte les secondes où le son frappe réellement, ce qui permet à
 * une scène de caler un effet sur une coupe au lieu de deviner.
 */
export const soundAssets = pgTable(
  'sound_assets',
  {
    id: serial('id').primaryKey(),
    /** Clé R2, aussi l'identifiant référencé par le storyboard. */
    key: varchar('key', { length: 200 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    kind: soundKindEnum('kind').notNull(),
    /** Tags d'ambiance libres, séparés par virgules, tels qu'écrits par le catalogue. */
    mood: varchar('mood', { length: 200 }),
    loopable: boolean('loopable').notNull().default(false),
    durationS: real('duration_s'),
    musicalKey: varchar('musical_key', { length: 20 }),
    bpm: integer('bpm'),
    /** Secondes où le son culmine : `[0.14, 0.86, 1.51]`. */
    impacts: jsonb('impacts'),
    /** À quoi il sert, en des mots que le modèle peut rapprocher d'une scène. */
    usage: text('usage'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sound_assets_key_uq').on(t.key)]
);

// ---------------------------------------------------------------------------
// Facturation (GeniusPay — mobile money + carte, XOF)
//
// La plateforme détient UN compte marchand : ses clés vivent dans
// l'environnement, pas dans la base. Il n'y a volontairement pas de table de
// credentials par tenant — les tenants paient la plateforme, ils n'encaissent
// pas eux-mêmes.
//
// L'argent est stocké en entiers `amount_xof`. Le XOF n'a pas de sous-unité,
// donc il n'y a aucune colonne de centimes et aucun float ne touche un montant.
// ---------------------------------------------------------------------------

export const paymentKindEnum = pgEnum('payment_kind', [
  'subscription',
  'topup',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  // Ligne locale créée, passerelle pas encore appelée.
  'created',
  // URL de checkout remise à l'utilisateur, en attente du verdict de la
  // passerelle.
  'pending',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  // Créée au checkout, avant confirmation du premier paiement.
  'pending',
  'active',
  'past_due',
  // Réessais épuisés (cahier des charges §3.A) : le tenant garde son solde
  // mais l'abonnement ne se renouvelle plus.
  'suspended',
  'canceled',
]);

export const billingCycleStatusEnum = pgEnum('billing_cycle_status', [
  'pending',
  'paid',
  'failed',
]);

export const paymentAttemptStatusEnum = pgEnum('payment_attempt_status', [
  'pending',
  'succeeded',
  'failed',
]);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    // Un abonnement par tenant : un changement de plan réutilise cette ligne
    // au lieu d'en empiler une seconde.
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    plan: planEnum('plan').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('pending'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    // Posé quand un downgrade est programmé ; la période payée va à son terme.
    cancelAt: timestamp('cancel_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subscriptions_tenant_id_uq').on(t.tenantId)]
);

export const billingCycles = pgTable(
  'billing_cycles',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    plan: planEnum('plan').notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    amountXof: integer('amount_xof').notNull(),
    // La dotation en crédits que ce cycle achète, enregistrée pour que la
    // dotation soit auditable face au prix réellement facturé.
    creditsGranted: integer('credits_granted').notNull(),
    status: billingCycleStatusEnum('status').notNull().default('pending'),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('billing_cycles_tenant_id_idx').on(t.tenantId),
    index('billing_cycles_subscription_id_idx').on(t.subscriptionId),
  ]
);

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: paymentKindEnum('kind').notNull(),
    // Paiements d'abonnement uniquement.
    plan: planEnum('plan'),
    billingCycleId: integer('billing_cycle_id').references(
      () => billingCycles.id
    ),
    amountXof: integer('amount_xof').notNull(),
    creditsGranted: integer('credits_granted').notNull(),
    // Id propre de GeniusPay pour la transaction. Unique car c'est ce qui
    // permet au webhook de résoudre un tenant — une référence, une intention,
    // un tenant.
    gatewayReference: varchar('gateway_reference', { length: 120 }),
    checkoutUrl: text('checkout_url'),
    status: paymentStatusEnum('status').notNull().default('created'),
    // Les mots de la passerelle elle-même, conservés verbatim pour le support
    // et la réconciliation.
    gatewayStatus: varchar('gateway_status', { length: 40 }),
    paymentMethod: varchar('payment_method', { length: 60 }),
    feesXof: integer('fees_xof'),
    netXof: integer('net_xof'),
    metadata: jsonb('metadata'),
    failureReason: text('failure_reason'),
    succeededAt: timestamp('succeeded_at'),
    failedAt: timestamp('failed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_intents_tenant_id_created_at_idx').on(
      t.tenantId,
      t.createdAt
    ),
    uniqueIndex('payment_intents_gateway_reference_uq').on(t.gatewayReference),
  ]
);

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingCycleId: integer('billing_cycle_id')
      .notNull()
      .references(() => billingCycles.id),
    paymentIntentId: integer('payment_intent_id').references(
      () => paymentIntents.id
    ),
    attemptNumber: integer('attempt_number').notNull().default(1),
    status: paymentAttemptStatusEnum('status').notNull().default('pending'),
    gatewayReference: varchar('gateway_reference', { length: 120 }),
    error: text('error'),
    attemptedAt: timestamp('attempted_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_attempts_tenant_id_idx').on(t.tenantId),
    index('payment_attempts_billing_cycle_id_idx').on(t.billingCycleId),
  ]
);

/**
 * Journal d'audit de chaque webhook passé la vérification de signature, et
 * garde-fou d'idempotence du chemin monétaire.
 *
 * `tenant_id` est nullable ici et seulement ici : un événement est écrit
 * avant de savoir à quel tenant il appartient — le tenant est *résolu* depuis
 * l'intention derrière `gateway_reference`, et un événement ne matchant aucune
 * intention n'appartient à aucun tenant. C'est la même exception que
 * getUser() dans lib/db/queries.ts, et c'est pourquoi le chemin webhook est le
 * seul endroit autorisé à toucher cette table sans scope (voir
 * lib/billing/webhook.ts).
 */
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id').references(() => tenants.id),
    provider: varchar('provider', { length: 40 }).notNull().default('geniuspay'),
    eventId: varchar('event_id', { length: 120 }).notNull(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    environment: varchar('environment', { length: 20 }),
    gatewayReference: varchar('gateway_reference', { length: 120 }),
    payload: jsonb('payload').notNull(),
    signatureValid: boolean('signature_valid').notNull().default(false),
    // Null tant que l'événement n'a pas été traité. Un replay d'un événement
    // non traité peut repartir ; un replay d'un événement traité est un no-op.
    processedAt: timestamp('processed_at'),
    processingError: text('processing_error'),
    receivedAt: timestamp('received_at').notNull().defaultNow(),
    receivedFromIp: varchar('received_from_ip', { length: 45 }),
  },
  (t) => [
    // La garantie d'idempotence : un événement passerelle crédite au plus
    // une fois.
    uniqueIndex('payment_webhook_events_provider_event_id_uq').on(
      t.provider,
      t.eventId
    ),
    index('payment_webhook_events_tenant_id_idx').on(t.tenantId),
  ]
);

/**
 * Une tentative de publication, pas une par vidéo : republier après un échec
 * doit rester lisible dans l'historique.
 *
 * `videos.youtube_video_id` reste en projection de la dernière publication
 * réussie — même règle que `videos.status` face à `jobs`.
 */
export const publications = pgTable(
  'publications',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id),
    videoId: integer('video_id')
      .notNull()
      .references(() => videos.id),
    provider: varchar('provider', { length: 40 }).notNull().default('youtube'),
    /** Id côté plateforme, une fois l'envoi accepté. */
    externalId: varchar('external_id', { length: 64 }),
    status: publicationStatusEnum('status').notNull().default('scheduled'),
    /** Quand publier. `null` signifie dès que possible. */
    scheduledFor: timestamp('scheduled_for'),
    publishedAt: timestamp('published_at'),
    error: text('error'),
    /** Ce que l'appel a coûté en quota, pour réconcilier avec le compteur. */
    quotaUnits: integer('quota_units'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('publications_tenant_id_idx').on(t.tenantId),
    index('publications_video_id_idx').on(t.videoId),
    index('publications_scheduled_for_idx').on(t.scheduledFor),
  ]
);

/**
 * Consommation quotidienne du quota YouTube, **pour toute la plateforme**.
 *
 * Ce n'est pas une limite par client, c'est une limite sur nous. Les envois ont
 * leur propre quota depuis juin 2026, d'environ 100 appels par jour, et un envoi
 * coûte ~100 unités depuis décembre 2025 au lieu de 1 600 : compter une centaine
 * de publications quotidiennes, tous clients confondus.
 *
 * Pas de `tenant_id`, volontairement — même statut que `sound_assets` : c'est
 * une ressource de plateforme, pas la donnée d'un client. Le compteur est
 * incrémenté dans la transaction qui crée la publication, jamais après
 * l'envoi, sinon deux envois simultanés passent tous les deux.
 *
 * Le quota se réinitialise à minuit **Pacifique**, l'heure de Google — 9 h du
 * matin à Cotonou en heure d'hiver.
 */
export const youtubeQuotaUsage = pgTable(
  'youtube_quota_usage',
  {
    id: serial('id').primaryKey(),
    /** Jour Pacifique, au format `YYYY-MM-DD`. */
    day: varchar('day', { length: 10 }).notNull(),
    unitsUsed: integer('units_used').notNull().default(0),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('youtube_quota_usage_day_uq').on(t.day)]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  invitations: many(invitations),
  activityLogs: many(activityLogs),
  projects: many(projects),
  videos: many(videos),
  creditLedger: many(creditLedger),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [invitations.tenantId],
    references: [tenants.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [activityLogs.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [projects.tenantId],
    references: [tenants.id],
  }),
  videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [videos.tenantId],
    references: [tenants.id],
  }),
  project: one(projects, {
    fields: [videos.projectId],
    references: [projects.id],
  }),
  shots: many(shots),
  jobs: many(jobs),
}));

export const shotsRelations = relations(shots, ({ one }) => ({
  video: one(videos, {
    fields: [shots.videoId],
    references: [videos.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  video: one(videos, {
    fields: [jobs.videoId],
    references: [videos.id],
  }),
}));

export const creditLedgerRelations = relations(creditLedger, ({ one }) => ({
  tenant: one(tenants, {
    fields: [creditLedger.tenantId],
    references: [tenants.id],
  }),
  video: one(videos, {
    fields: [creditLedger.videoId],
    references: [videos.id],
  }),
}));

export const youtubeTokensRelations = relations(youtubeTokens, ({ one }) => ({
  tenant: one(tenants, {
    fields: [youtubeTokens.tenantId],
    references: [tenants.id],
  }),
}));

export const subscriptionsRelations = relations(
  subscriptions,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [subscriptions.tenantId],
      references: [tenants.id],
    }),
    cycles: many(billingCycles),
  })
);

export const billingCyclesRelations = relations(
  billingCycles,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [billingCycles.tenantId],
      references: [tenants.id],
    }),
    subscription: one(subscriptions, {
      fields: [billingCycles.subscriptionId],
      references: [subscriptions.id],
    }),
    attempts: many(paymentAttempts),
  })
);

export const paymentIntentsRelations = relations(paymentIntents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [paymentIntents.tenantId],
    references: [tenants.id],
  }),
  billingCycle: one(billingCycles, {
    fields: [paymentIntents.billingCycleId],
    references: [billingCycles.id],
  }),
}));

export const paymentAttemptsRelations = relations(
  paymentAttempts,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [paymentAttempts.tenantId],
      references: [tenants.id],
    }),
    billingCycle: one(billingCycles, {
      fields: [paymentAttempts.billingCycleId],
      references: [billingCycles.id],
    }),
    paymentIntent: one(paymentIntents, {
      fields: [paymentAttempts.paymentIntentId],
      references: [paymentIntents.id],
    }),
  })
);

export const paymentWebhookEventsRelations = relations(
  paymentWebhookEvents,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [paymentWebhookEvents.tenantId],
      references: [tenants.id],
    }),
  })
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;
export type YoutubeToken = typeof youtubeTokens.$inferSelect;
export type NewYoutubeToken = typeof youtubeTokens.$inferInsert;

export type Publication = typeof publications.$inferSelect;
export type NewPublication = typeof publications.$inferInsert;
export type YoutubeQuotaUsage = typeof youtubeQuotaUsage.$inferSelect;
export type CreditPocket = (typeof creditPocketEnum.enumValues)[number];
export type PublicationStatus = (typeof publicationStatusEnum.enumValues)[number];

export type SoundAsset = typeof soundAssets.$inferSelect;
export type NewSoundAsset = typeof soundAssets.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type BillingCycle = typeof billingCycles.$inferSelect;
export type NewBillingCycle = typeof billingCycles.$inferInsert;
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type NewPaymentIntent = typeof paymentIntents.$inferInsert;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type NewPaymentWebhookEvent = typeof paymentWebhookEvents.$inferInsert;

export type Plan = (typeof planEnum.enumValues)[number];
export type Resolution = (typeof resolutionEnum.enumValues)[number];
export type Pipeline = (typeof pipelineEnum.enumValues)[number];
export type VideoStatus = (typeof videoStatusEnum.enumValues)[number];
export type ShotType = (typeof shotTypeEnum.enumValues)[number];
export type Ratio = (typeof ratioEnum.enumValues)[number];
export type SubtitleStyle = (typeof subtitleStyleEnum.enumValues)[number];
export type DurationSource = (typeof durationSourceEnum.enumValues)[number];
export type SoundKind = (typeof soundKindEnum.enumValues)[number];
export type PaymentKind = (typeof paymentKindEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type SubscriptionStatus =
  (typeof subscriptionStatusEnum.enumValues)[number];
export type BillingCycleStatus =
  (typeof billingCycleStatusEnum.enumValues)[number];
export type PaymentAttemptStatus =
  (typeof paymentAttemptStatusEnum.enumValues)[number];

export type TenantDataWithMembers = Tenant & {
  users: Pick<User, 'id' | 'name' | 'email' | 'role'>[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TENANT = 'CREATE_TENANT',
  REMOVE_TENANT_MEMBER = 'REMOVE_TENANT_MEMBER',
  INVITE_TENANT_MEMBER = 'INVITE_TENANT_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}
