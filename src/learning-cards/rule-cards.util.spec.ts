import { buildRuleCards, type SourceRuleFile } from './rule-cards.util';

const file: SourceRuleFile = {
  subjectId: 24,
  cards: [
    {
      id: 'rule-24-rope',
      order: 1,
      text: {
        ka: { title: 'ხისტი გადაბმა', body: 'ტექსტი.' },
        en: { title: 'Rigid tow bar', body: 'Text.' },
      },
      questions: [10, 11],
    },
    {
      id: 'rule-24-speed',
      order: 2,
      text: { ka: { title: 'სიჩქარე', body: 'ტექსტი.' } },
      questions: [12],
    },
  ],
};

describe('buildRuleCards', () => {
  it('builds cards, texts per language and primary manual links', () => {
    const { cards, texts, links } = buildRuleCards([file]);
    expect(cards.map((c) => [c.id, c.kind, c.subjectId, c.order])).toEqual([
      ['rule-24-rope', 'rule', 24, 1],
      ['rule-24-speed', 'rule', 24, 2],
    ]);
    expect(texts.map((t) => `${t.cardId}|${t.lang}`)).toEqual([
      'rule-24-rope|ka',
      'rule-24-rope|en',
      'rule-24-speed|ka',
    ]);
    expect(links).toContainEqual({
      questionId: 12,
      cardId: 'rule-24-speed',
      primary: true,
      source: 'manual',
      confirmed: true,
    });
  });

  it('rejects a ticket under two cards', () => {
    const bad = structuredClone(file);
    bad.cards[1].questions = [11];
    expect(() => buildRuleCards([bad])).toThrow(/ticket 11/);
  });

  it('rejects sign subjects, foreign ids and a missing ka text', () => {
    expect(() => buildRuleCards([{ ...file, subjectId: 3 }])).toThrow(/sign/);
    const foreign = structuredClone(file);
    foreign.cards[0].id = 'rule-25-rope';
    expect(() => buildRuleCards([foreign])).toThrow(/bad card id/);
    const noKa = structuredClone(file);
    delete noKa.cards[1].text.ka;
    expect(() => buildRuleCards([noKa])).toThrow(/no ka/);
  });
});
