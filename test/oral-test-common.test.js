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
