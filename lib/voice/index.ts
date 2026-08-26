import type { Plan } from '@/lib/db/schema';
import { createEdgeClient, isEdgeConfigured } from './edge';
import { createElevenLabsClient, isVoiceConfigured } from './elevenlabs';
import { createPollyClient, isPollyConfigured } from './polly';
import { VoiceNotConfiguredError, type VoiceSynthesizer } from './contract';

/**
 * Qui parle, et quand.
 *
 * La voix off se fait en deux passes, pour une raison de caisse : le prix d'une
 * vidéo est la somme des durées de ses scènes, et une durée s'obtient en
 * faisant lire la phrase. Il faut donc parler **avant** que le client valide.
 *
 *   1. **Mesurer** — Edge TTS, gratuit. C'est cette passe qui fixe le prix
 *      affiché sur le bouton, et le débit s'y verrouille.
 *   2. **Livrer** — après validation, la voix du plan : Polly Neural sur
 *      Starter (`docs/tarifs.md`, dont la marge de 41 % en dépend), ElevenLabs
 *      sur Pro et Business, nettement moins robotique en français. La qualité
 *      de la voix est une raison d'acheter le plan supérieur.
 *
 * La seconde passe **ne rejoue jamais le calcul du prix**. Le montant du bouton
 * est le montant débité : si la voix livrée dure un peu plus, l'écart est pour
 * nous, pas pour le client.
 */

export {
  VoiceError,
  VoiceNotConfiguredError,
  type Voiceover,
  type VoiceSynthesizer,
} from './contract';

export type VoiceProvider = 'edge' | 'polly' | 'elevenlabs';

/** Le fournisseur de la passe de mesure. Gratuit, donc le même pour tous. */
export const MEASURING_PROVIDER: VoiceProvider = 'edge';

/**
 * Fournisseur d'un plan. Le défaut est Polly : un tenant dont le plan est
 * inconnu ne doit pas se voir offrir la voix premium par accident.
 */
export function voiceProviderFor(plan?: Plan | null): VoiceProvider {
  return plan === 'pro' || plan === 'business' ? 'elevenlabs' : 'polly';
}

/** Construit le client d'un fournisseur nommé, ou dit ce qui lui manque. */
export function createClientFor(provider: VoiceProvider): VoiceSynthesizer {
  if (provider === 'edge') {
    if (!isEdgeConfigured()) {
      throw new VoiceNotConfiguredError('Edge TTS is disabled here');
    }
    return createEdgeClient();
  }

  if (provider === 'elevenlabs') {
    if (!isVoiceConfigured()) {
      throw new VoiceNotConfiguredError('ELEVENLABS_API_KEY');
    }
    return createElevenLabsClient();
  }

  if (!isPollyConfigured()) {
    throw new VoiceNotConfiguredError('AWS_ACCESS_KEY_ID / AWS_REGION (Polly)');
  }
  return createPollyClient();
}

/**
 * La voix qui mesure, avant toute facture. Gratuite, donc la même pour tous les
 * plans : un devis ne se paie pas.
 */
export function createMeasuringVoiceClient(): VoiceSynthesizer {
  return createClientFor(MEASURING_PROVIDER);
}

/**
 * La voix qui est livrée, après validation.
 *
 * `VOICE_PROVIDER` passe outre le plan. Elle existe pour une machine qui n'a
 * les clés que d'un fournisseur — pas pour arbitrer en production, où c'est le
 * plan qui décide.
 *
 * Un fournisseur mal configuré **lève** au lieu de basculer sur l'autre. Une
 * bascule silencieuse ferait payer la voix premium sur un plan Starter, ou
 * servirait la voix d'entrée de gamme à un client qui a payé pour l'autre :
 * deux façons de se tromper sans que personne ne le voie.
 */
export function createDeliveryVoiceClient(plan?: Plan | null): VoiceSynthesizer {
  return createClientFor(deliveryProviderFor(plan));
}

/**
 * Le fournisseur que la passe de livraison va réellement employer, override
 * compris.
 *
 * Exporté parce que l'étape a besoin du même verdict que la fabrique : c'est en
 * comparant ce nom à `shots.voice_provider` qu'une reprise saute les scènes
 * déjà livrées au lieu de repayer le fournisseur.
 */
export function deliveryProviderFor(plan?: Plan | null): VoiceProvider {
  const forced = process.env.VOICE_PROVIDER?.trim().toLowerCase();
  return forced === 'polly' || forced === 'elevenlabs' || forced === 'edge'
    ? forced
    : voiceProviderFor(plan);
}
