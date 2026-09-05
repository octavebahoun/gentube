import { afterEach, describe, expect, it } from 'vitest';
import {
  AnimationNotConfiguredError,
  DEFAULT_VIDEO_PROVIDER,
  VIDEO_PROVIDERS,
  createAnimator,
  createClientFor,
  videoProviderFor,
} from './index';

const VARS = ['VIDEO_PROVIDER', 'REPLICATE_API_TOKEN', 'NOVITA_API_KEY'] as const;

afterEach(() => {
  for (const name of VARS) process.env[name] = '';
});

describe('qui anime', () => {
  it('prend Replicate par défaut', () => {
    // Le seul qui rappelle, donc le seul dont un job se résout sans que
    // personne ne le surveille. Et c'est sa table de prix qui est branchée.
    expect(videoProviderFor()).toBe('replicate');
    expect(DEFAULT_VIDEO_PROVIDER).toBe('replicate');
  });

  it('suit la variable d environnement', () => {
    // Changer de fournisseur ne doit pas être un déploiement : c'est le point
    // même, quand on passe ses semaines à comparer des modèles.
    process.env.VIDEO_PROVIDER = 'novita';
    expect(videoProviderFor()).toBe('novita');
  });

  it('retombe sur le défaut plutôt que de tomber', () => {
    // Une faute de frappe dans une variable ne doit pas coûter une vidéo.
    process.env.VIDEO_PROVIDER = 'replicat';
    expect(videoProviderFor()).toBe(DEFAULT_VIDEO_PROVIDER);
  });
});

describe('la construction d un client', () => {
  it('dit ce qui manque, par fournisseur', () => {
    expect(() => createClientFor('replicate')).toThrow(AnimationNotConfiguredError);
    expect(() => createClientFor('replicate')).toThrow(/REPLICATE_API_TOKEN/);
    expect(() => createClientFor('novita')).toThrow(/NOVITA_API_KEY/);
  });

  it('déclare comment chaque fournisseur résout sa tâche', () => {
    /*
     * La seule différence entre deux fournisseurs qui casse en silence.
     * Replicate rappelle, Novita non : le brancher comme s'il rappelait
     * laisserait ses jobs `running` pour toujours, sans erreur nulle part.
     */
    process.env.REPLICATE_API_TOKEN = 'r8_test';
    process.env.NOVITA_API_KEY = 'nv_test';

    expect(createClientFor('replicate').resolution).toBe('webhook');
    expect(createClientFor('novita').resolution).toBe('poll');
  });

  it('nomme le fournisseur qui a répondu', () => {
    // Pour que le journal et la facture s'expliquent.
    process.env.NOVITA_API_KEY = 'nv_test';
    expect(createClientFor('novita').provider).toBe('novita');
  });

  it('passe par la variable depuis l entrée unique', () => {
    process.env.NOVITA_API_KEY = 'nv_test';
    process.env.VIDEO_PROVIDER = 'novita';
    expect(createAnimator().provider).toBe('novita');
  });
});

describe('la liste des fournisseurs', () => {
  it('contient le défaut, et chacun sait se construire', () => {
    // Un nom dans la liste sans fabrique derrière serait une promesse vide :
    // la faute ne se verrait qu'au premier client qui la demande.
    expect(VIDEO_PROVIDERS).toContain(DEFAULT_VIDEO_PROVIDER);

    for (const provider of VIDEO_PROVIDERS) {
      expect(() => createClientFor(provider)).toThrow(AnimationNotConfiguredError);
    }
  });
});
