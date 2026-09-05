import { describe, expect, it } from 'vitest';
import { apparenceDe, echelleEnPx, texteDesVariables } from './apparence';

describe('ce que le registre porte comme apparence', () => {
  it('retombe sur explainer quand le nom est inconnu', () => {
    // Un storyboard ne doit pas perdre son habillage parce que le modèle a
    // inventé un mot — même règle que `habille()`.
    expect(apparenceDe('western-spaghetti')).toEqual(apparenceDe('explainer'));
    expect(apparenceDe()).toEqual(apparenceDe('explainer'));
  });

  it('rend en pixels les ratios que la composition écrivait en dur', () => {
    // 0,058, 0,032, 0,042 et 0,16 : hier des constantes, aujourd'hui l'échelle
    // du registre. À 480 lignes, ça vaut 28, 15, 20 et 77.
    const tailles = echelleEnPx(apparenceDe('explainer'), 480);
    expect(tailles).toEqual({ sousTitre: 28, filigrane: 15, structure: 20, roue: 77 });
  });

  it('pose la palette et les tailles en variables sur la racine', () => {
    const texte = texteDesVariables('explainer', 480);
    expect(texte).toContain('--gt-accent: #ce1f20;');
    expect(texte).toContain('--gt-accent-2: #ff5a36;');
    expect(texte).toContain('--gt-encre: #ffd9a0;');
    expect(texte).toContain('--gt-sous-titre: 28px;');
  });
});
