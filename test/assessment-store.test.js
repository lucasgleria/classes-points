const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDatabase } = require("../db");

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "points-assessment-"));
  const store = createDatabase({ filename: path.join(dir, "test.sqlite") });
  const classroom = store.createClass({
    book: "Super Minds 2",
    weekday: "Sabados",
    startTime: "09h00",
    endTime: "11h00",
  });
  return {
    classroom,
    store,
    close() {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("Feature 02: criar avaliacao congela a lista atual da turma", () => {
  const context = fixture();
  const first = context.store.createStudent("Ana", { classId: context.classroom.id });
  context.store.createStudent("Bia", { classId: context.classroom.id });

  const assessment = context.store.createAssessment(context.classroom.id, {
    title: "Avaliacao 1",
    description: "Unidades 0 e 1",
  });
  context.store.createStudent("Caio", { classId: context.classroom.id });

  const grades = context.store.getAssessmentGrades(assessment.id);
  assert.equal(grades.length, 2);
  assert.equal(grades.every((grade) => grade.status === "pending"), true);
  assert.equal(grades.some((grade) => grade.student_id === first.id), true);
  context.close();
});

test("Feature 03: publicacao exige notas resolvidas e aluno ve somente publicadas", () => {
  const context = fixture();
  const student = context.store.createStudent("Ana", { classId: context.classroom.id });
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Avaliacao 1" });

  assert.throws(() => context.store.publishAssessment(assessment.id), /pendentes/);
  context.store.saveAssessmentGrades(assessment.id, [
    { studentId: student.id, status: "graded", otScore: "8,50", wtScore: "9" },
  ]);
  assert.equal(context.store.getStudentAssessments(student.id).length, 0);
  context.store.publishAssessment(assessment.id);

  const visible = context.store.getStudentAssessments(student.id);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].ot_score, 850);
  assert.equal(context.store.getStudentAcademicSummary(student.id).academicBonus, 88);
  context.close();
});

test("Feature 11: alterar nota publicada exige motivo e registra revisao", () => {
  const context = fixture();
  const student = context.store.createStudent("Ana", { classId: context.classroom.id });
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Avaliacao 1" });
  context.store.saveAssessmentGrades(assessment.id, [
    { studentId: student.id, status: "graded", otScore: "8", wtScore: "8" },
  ]);
  context.store.publishAssessment(assessment.id);

  assert.throws(
    () =>
      context.store.saveAssessmentGrades(assessment.id, [
        { studentId: student.id, status: "graded", otScore: "9", wtScore: "8" },
      ]),
    /motivo/
  );
  context.store.saveAssessmentGrades(
    assessment.id,
    [{ studentId: student.id, status: "graded", otScore: "9", wtScore: "8" }],
    { reason: "Correcao de digitacao", professorId: 1 }
  );

  const revisions = context.store.getAssessmentGradeRevisions(assessment.id);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].old_ot_score, 800);
  assert.equal(revisions[0].new_ot_score, 900);
  context.close();
});

test("Feature 05: ficha por avaliacao exige marcacoes validas", () => {
  const context = fixture();
  const student = context.store.createStudent("Ana", { classId: context.classroom.id });
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Avaliacao 1" });

  assert.throws(
    () =>
      context.store.updateAssessmentPerformanceReport(assessment.id, student.id, {
        participation: "",
        grammarVocabulary: "bom",
        homework: "bom",
        behavior: "bom",
      }),
    /desempenho invalida/
  );
  const report = context.store.updateAssessmentPerformanceReport(
    assessment.id,
    student.id,
    {
      participation: "otimo",
      grammarVocabulary: "bom",
      homework: "precisa_melhorar",
      behavior: "bom",
      comments: "Bom progresso.",
    },
    { professorId: 1 }
  );
  assert.equal(report.participation, "otimo");
  assert.equal(report.comments, "Bom progresso.");
  context.close();
});

test("Feature 12: turma arquivada preserva avaliacao em modo somente leitura e sai do ranking", () => {
  const context = fixture();
  const student = context.store.createStudent("Ana", { classId: context.classroom.id });
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Avaliacao 1" });
  context.store.saveAssessmentGrades(assessment.id, [
    { studentId: student.id, status: "graded", otScore: "10", wtScore: "10" },
  ]);
  context.store.publishAssessment(assessment.id);
  assert.equal(context.store.getStudentAcademicSummary(student.id).academicBonus, 100);

  context.store.archiveClass(context.classroom.id);
  assert.equal(context.store.getAllClasses().length, 0);
  assert.equal(context.store.getAllClasses({ includeArchived: true }).length, 1);
  assert.equal(context.store.getStudentAcademicSummary(student.id).academicBonus, 0);
  assert.throws(
    () => context.store.saveAssessmentGrades(assessment.id, [
      { studentId: student.id, status: "graded", otScore: "9", wtScore: "9" },
    ]),
    /somente para consulta/
  );
  context.close();
});

test("Feature Oral: pesos e respostas esperadas sao copiados para a avaliacao e usados na nota", () => {
  const context = fixture();
  const student = context.store.createStudent("Ana", { classId: context.classroom.id });
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Oral Units 2-3" });
  const template = context.store.createOralTestTemplate(1, {
    title: "Oral Units 2-3",
    questionsText: [
      "What's this? | It's a frog. | 1",
      "What shape is this? | It's a triangle.",
      "Do you like dogs? | I like dogs. / I don't like dogs. | 2",
      "Say in English: Eu nao gosto de aranhas. | I don't like spiders. | 2",
    ].join("\n"),
  });
  assert.deepEqual(template.questions.map((question) => question.weight), [1, 1, 2, 2]);

  const copy = context.store.duplicateOralTestTemplate(template.id, 1);
  assert.deepEqual(copy.questions.map((question) => question.weight), [1, 1, 2, 2]);

  const oralTest = context.store.attachOralTemplateToAssessment(assessment.id, template.id, 1);
  assert.deepEqual(oralTest.questions.map((question) => question.weight), [1, 1, 2, 2]);
  assert.equal(oralTest.questions[0].teacher_note, "It's a frog.");

  const attempt = context.store.completeOralAttempt(
    oralTest.id,
    student.id,
    [
      { questionId: oralTest.questions[0].id, result: "correct" },
      { questionId: oralTest.questions[1].id, result: "correct" },
      { questionId: oralTest.questions[2].id, result: "half" },
      { questionId: oralTest.questions[3].id, result: "correct" },
    ],
    { professorId: 1 }
  );
  assert.equal(attempt.score_hundredths, 833);
  context.close();
});

test("Feature Oral: modelo reutilizavel, roster por pontos e observacao da tentativa", () => {
  const context = fixture();
  const ana = context.store.createStudent("Ana", { classId: context.classroom.id });
  const bia = context.store.createStudent("Bia", { classId: context.classroom.id });
  const caio = context.store.createStudent("Caio", { classId: context.classroom.id });
  context.store.addPoints(ana.id, "games", 10, "");
  context.store.addPoints(bia.id, "games", 30, "");
  context.store.addPoints(caio.id, "games", 20, "");
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Avaliacao Oral 1" });

  const template = context.store.createOralTestTemplate(1, {
    title: "Oral Unit 1",
    description: "Perguntas basicas",
    questionsText: "Introduce yourself\nSpell your name\nSay your favorite color\nAsk one question",
  });
  assert.equal(template.questions.length, 4);

  const oralTest = context.store.attachOralTemplateToAssessment(assessment.id, template.id, 1);
  assert.equal(oralTest.questions.length, 4);
  const roster = context.store.getAssessmentOralRoster(assessment.id);
  assert.deepEqual(roster.map((item) => item.student_name), ["Bia", "Caio", "Ana"]);

  const attempt = context.store.completeOralAttempt(
    oralTest.id,
    caio.id,
    [
      { questionId: oralTest.questions[0].id, result: "correct" },
      { questionId: oralTest.questions[1].id, result: "half" },
      { questionId: oralTest.questions[2].id, result: "wrong" },
      { questionId: oralTest.questions[3].id, result: "correct" },
    ],
    { observation: "Boa fluencia, revisar perguntas.", professorId: 1 }
  );

  assert.equal(attempt.status, "completed");
  assert.equal(attempt.score_hundredths, 625);
  assert.equal(attempt.observation, "Boa fluencia, revisar perguntas.");
  assert.equal(attempt.answers.length, 4);
  assert.equal(context.store.getAssessmentGrades(assessment.id).find((grade) => grade.student_id === caio.id).ot_score, null);

  const updatedRoster = context.store.getAssessmentOralRoster(assessment.id);
  const caioResult = updatedRoster.find((item) => item.student_id === caio.id);
  assert.equal(caioResult.attempt_status, "completed");
  assert.equal(caioResult.score_hundredths, 625);
  assert.equal(caioResult.observation, "Boa fluencia, revisar perguntas.");

  assert.throws(
    () =>
      context.store.saveOralAttemptDraft(
        oralTest.id,
        ana.id,
        [{ questionId: oralTest.questions[0].id, result: "correct" }],
        { observation: "a".repeat(501), professorId: 1 }
      ),
    /500/
  );
  context.close();
});
