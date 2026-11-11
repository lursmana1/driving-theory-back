import { buildSignCards, type SourceSign } from './sign-cards.util';
import { buildSignLinks } from './sign-links.util';
import { findSignRefs } from './sign-refs.util';

const sign = (over: Partial<SourceSign>): SourceSign => ({
  slug: '1-1',
  kind: 'sign',
  group: 1,
  order: 0,
  number: '1.1',
  name: 'რკინიგზის გადასასვლელი',
  description: 'აფრთხილებს.',
  image: '/images/signs/1-1.svg',
  ...over,
});

describe('findSignRefs', () => {
  it('finds numbers next to the word sign / marking, in order', () => {
    expect(
      findSignRefs('საგზაო ნიშანი 3.24 და 3.25 ნიშნები, მონიშვნა 1.1'),
    ).toEqual([
      { kind: 'sign', number: '3.24', at: 14 },
      { kind: 'sign', number: '3.25', at: 22 },
      { kind: 'marking', number: '1.1', at: 45 },
    ]);
  });

  it('ignores law paragraphs and duplicates', () => {
    expect(findSignRefs('დანართის 4.3 პუნქტის მიხედვით')).toEqual([]);
    expect(
      findSignRefs('ნიშანი 2.1 ... 2.1 ნიშანი').map((r) => r.number),
    ).toEqual(['2.1']);
  });

  it('handles lists and empty text', () => {
    expect(findSignRefs('ნიშნები 1.4.1-1.4.3').map((r) => r.number)).toEqual([
      '1.4.1',
      '1.4.3',
    ]);
    expect(findSignRefs(null)).toEqual([]);
  });
});

describe('buildSignCards', () => {
  it('makes one card per sign with ka/en/ru texts and the group subject', () => {
    const { cards, texts, skipped } = buildSignCards(
      [
        sign({}),
        sign({
          slug: 'marking-1-1',
          kind: 'marking',
          group: 101,
          number: '1.1',
          order: 2,
        }),
      ],
      { en: { '1-1': { name: 'Level crossing', description: 'Warns.' } } },
    );
    expect(cards).toEqual([
      {
        id: 'sign-1.1',
        kind: 'sign',
        subjectId: 3,
        order: 1000,
        image: '/images/signs/1-1.svg',
        signNumber: '1.1',
      },
      {
        id: 'marking-1.1',
        kind: 'marking',
        subjectId: 28,
        order: 101002,
        image: '/images/signs/1-1.svg',
        signNumber: '1.1',
      },
    ]);
    expect(
      texts.filter((t) => t.cardId === 'sign-1.1').map((t) => t.lang),
    ).toEqual(['ka', 'en']);
    expect(skipped).toEqual([]);
  });

  it('titles markings by number (the source has no name)', () => {
    const { texts } = buildSignCards(
      [sign({ slug: 'marking-1-1', kind: 'marking', group: 101, name: '' })],
      { ru: { 'marking-1-1': { name: '', description: 'Разделяет потоки.' } } },
    );
    expect(texts.map((t) => [t.lang, t.title])).toEqual([
      ['ka', 'მონიშვნა 1.1'],
      ['ru', 'Разметка 1.1'],
    ]);
  });

  it('skips unknown groups and duplicate numbers', () => {
    const { cards, skipped } = buildSignCards(
      [sign({}), sign({ slug: 'dup' }), sign({ slug: 'x', group: 99 })],
      {},
    );
    expect(cards).toHaveLength(1);
    expect(skipped).toEqual(['dup', 'x']);
  });
});

describe('buildSignLinks', () => {
  const known = new Set(['sign-3.24', 'sign-3.25', 'marking-1.1']);

  it('links tickets by the signs they name; primary = first sign in the question', () => {
    const { links, unlinked } = buildSignLinks(
      [
        {
          id: 10,
          subject: 5,
          question: 'რას ნიშნავს ნიშანი 3.25?',
          question_explained: 'ნიშანი 3.24 და 3.25 …',
        },
        {
          id: 11,
          subject: 5,
          question: 'მოცემული ნიშანი:',
          question_explained: null,
        },
        {
          id: 12,
          subject: 20,
          question: 'ნიშანი 3.24',
          question_explained: null,
        },
        {
          id: 13,
          subject: 20,
          question: 'ვინ გადის პირველი?',
          question_explained: null,
        },
      ],
      known,
    );
    // A rule-subject ticket naming a sign is linked too (mislabelled sign
    // ticket); one with no sign is not reported as unlinked.
    expect(links).toEqual([
      {
        questionId: 10,
        cardId: 'sign-3.25',
        primary: true,
        source: 'regex',
        confirmed: true,
      },
      {
        questionId: 10,
        cardId: 'sign-3.24',
        primary: false,
        source: 'regex',
        confirmed: true,
      },
      {
        questionId: 12,
        cardId: 'sign-3.24',
        primary: true,
        source: 'regex',
        confirmed: true,
      },
    ]);
    expect(unlinked).toEqual([11]);
  });

  it('falls back to the explanation and ignores unknown numbers', () => {
    const { links } = buildSignLinks(
      [
        {
          id: 20,
          subject: 28,
          question: 'რომელი?',
          question_explained: 'მონიშვნა 9.9 და მონიშვნა 1.1',
        },
      ],
      known,
    );
    expect(links).toEqual([
      {
        questionId: 20,
        cardId: 'marking-1.1',
        primary: true,
        source: 'regex',
        confirmed: true,
      },
    ]);
  });
});
