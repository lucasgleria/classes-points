const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateOralScoreHundredths,
  normalizeOralObservation,
  normalizeOralQuestions,
} = require("../oral-test-common");

test("Feature Oral: calcula nota com correto, meio-certo e errado", () => {
  assert.equal(
    calculateOralScoreHundredths([
      { result: "correct" },
      { result: "half" },
      { result: "wrong" },
      { result: "correct" },
    ]),
    625
  );
});

test("Feature Oral: observacao curta e aceita e limite de 500 caracteres e validado", () => {
  assert.equal(normalizeOralObservation("  Boa fluencia.  "), "Boa fluencia.");
  assert.equal(normalizeOralObservation("a".repeat(500)).length, 500);
  assert.throws(() => normalizeOralObservation("a".repeat(501)), /500/);
});

test("Feature Oral: perguntas vazias sao ignoradas e modelo exige ao menos uma pergunta", () => {
  assert.deepEqual(normalizeOralQuestions("Pergunta 1\n\nPergunta 2").map((item) => item.prompt), [
    "Pergunta 1",
    "Pergunta 2",
  ]);
  assert.throws(() => normalizeOralQuestions("\n \n"), /pergunta/i);
});

test("Feature Oral: linha aceita pergunta, resposta esperada e peso", () => {
  const questions = normalizeOralQuestions(
    "What's this? | It's a frog.\nDo you like dogs? | I like dogs. | 2\nSpell your name"
  );
  assert.deepEqual(
    questions.map(({ prompt, teacherNote, weight }) => ({ prompt, teacherNote, weight })),
    [
      { prompt: "What's this?", teacherNote: "It's a frog.", weight: 1 },
      { prompt: "Do you like dogs?", teacherNote: "I like dogs.", weight: 2 },
      { prompt: "Spell your name", teacherNote: "", weight: 1 },
    ]
  );
  assert.throws(() => normalizeOralQuestions("Pergunta | Resposta | 0"), /Peso/);
  assert.throws(() => normalizeOralQuestions("Pergunta | Resposta | 11"), /Peso/);
  assert.throws(() => normalizeOralQuestions("Pergunta | Resposta | 1.5"), /Peso/);
});

test("Feature Oral: nota oral respeita o peso de cada pergunta", () => {
  assert.equal(
    calculateOralScoreHundredths([
      { result: "correct", weight: 1 },
      { result: "wrong", weight: 1 },
      { result: "correct", weight: 2 },
      { result: "half", weight: 2 },
    ]),
    667
  );
});
