import { buildManualSignLinks } from './manual-sign-links.util';

const known = new Set(['sign-1.2', 'sign-1.11', 'sign-8.1.1–8.1.4']);

describe('buildManualSignLinks', () => {
  it('links every listed card, the first one primary', () => {
    const rows = buildManualSignLinks(
      { '602': ['sign-1.2', 'sign-1.11'], '1193': ['sign-8.1.1–8.1.4'] },
      known,
    );
    expect(rows).toEqual([
      {
        questionId: 602,
        cardId: 'sign-1.2',
        primary: true,
        source: 'manual',
        confirmed: true,
      },
      {
        questionId: 602,
        cardId: 'sign-1.11',
        primary: false,
        source: 'manual',
        confirmed: true,
      },
      {
        questionId: 1193,
        cardId: 'sign-8.1.1–8.1.4',
        primary: true,
        source: 'manual',
        confirmed: true,
      },
    ]);
  });

  it('throws on a bad ticket id, an empty list, an unknown or repeated card', () => {
    expect(() => buildManualSignLinks({ abc: ['sign-1.2'] }, known)).toThrow(
      'bad ticket id',
    );
    expect(() => buildManualSignLinks({ '1': [] }, known)).toThrow('no cards');
    expect(() => buildManualSignLinks({ '1': ['sign-9.9'] }, known)).toThrow(
      'unknown card',
    );
    expect(() =>
      buildManualSignLinks({ '1': ['sign-1.2', 'sign-1.2'] }, known),
    ).toThrow('twice');
  });
});
