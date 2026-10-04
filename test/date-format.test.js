const test = require("node:test");
const assert = require("node:assert/strict");
const { mapAssessmentGradeRow, mapAssessmentRow, normalizeDateOnly } = require("../db-common");
const { formatDateOnly } = require("../views/shared");

test("Datas de avaliacao: Date do Postgres e texto do SQLite viram AAAA-MM-DD", () => {
  assert.equal(normalizeDateOnly(new Date("2026-10-10T00:00:00.000Z")), "2026-10-10");
  assert.equal(normalizeDateOnly("2026-10-10"), "2026-10-10");
  assert.equal(normalizeDateOnly(null), null);
  assert.equal(normalizeDateOnly(""), null);

  const row = mapAssessmentRow({ id: "3", class_id: "2", assessment_date: new Date("2026-10-10T00:00:00.000Z") });
  assert.equal(row.assessment_date, "2026-10-10");

  const grade = mapAssessmentGradeRow({ assessment_id: "3", student_id: "1", assessment_date: new Date("2026-06-13T00:00:00.000Z") });
  assert.equal(grade.assessment_date, "2026-06-13");
  assert.equal("assessment_date" in mapAssessmentGradeRow({ assessment_id: "3", student_id: "1" }), false);
});

test("Datas de avaliacao: exibicao no formato DD/MM/AAAA", () => {
  assert.equal(formatDateOnly("2026-10-10"), "10/10/2026");
  assert.equal(formatDateOnly("2026-06-13"), "13/06/2026");
  assert.equal(formatDateOnly(null), "");
});
