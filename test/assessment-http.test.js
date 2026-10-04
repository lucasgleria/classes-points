const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");
const { createDatabase } = require("../db");
const { createApp } = require("../app");
const { getRuntimeConfig } = require("../config");
const { generatePerformancePdf } = require("../performance-pdf");

function fixture(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "points-assessment-http-"));
  const store = createDatabase({ filename: path.join(dir, "test.sqlite") });
  const classroom = store.createClass({
    book: "Super Minds 3",
    weekday: "Sabados",
    startTime: "09h00",
    endTime: "11h00",
  });
  const student = store.createStudent("Ana Teste", { classId: classroom.id });
  const { app } = createApp({
    store,
    sessionSecret: "assessment-test",
    runtimeConfig: options.runtimeConfig || {},
  });
  return {
    app,
    classroom,
    student,
    store,
    close() {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function loginProfessor(agent) {
  const config = getRuntimeConfig();
  await agent.post("/login").type("form").send({
    username: config.teacherUsername,
    password: config.teacherPassword,
  }).expect(302);
}

test("Feature 03-05: professor cria, lanca, publica e preenche ficha pela interface", async () => {
  const context = fixture();
  const professor = request.agent(context.app);
  await loginProfessor(professor);

  const list = await professor.get(`/assessments?classId=${context.classroom.id}`).expect(200);
  assert.match(list.text, /Nova avaliacao/);

  await professor.post("/api/assessments").type("form").send({
    classId: context.classroom.id,
    title: "Avaliacao 1: Unidades 0 e 1",
    description: "Unidades 0 e 1",
    countsForRanking: "1",
  }).expect(302);
  const assessment = context.store.getAssessmentsByClass(context.classroom.id)[0];

  await professor.post(`/api/assessments/${assessment.id}/grades`).type("form").send({
    [`status_${context.student.id}`]: "graded",
    [`ot_${context.student.id}`]: "8,50",
    [`wt_${context.student.id}`]: "9,00",
    [`note_${context.student.id}`]: "Bom resultado",
  }).expect(302);
  await professor.post(`/api/assessments/${assessment.id}/publish`).expect(302);

  await professor.post(`/api/assessments/${assessment.id}/students/${context.student.id}/performance`).type("form").send({
    participation: "otimo",
    grammarVocabulary: "bom",
    homework: "otimo",
    behavior: "bom",
    comments: "Evolucao consistente.",
  }).expect(302);
  const page = await professor.get(`/assessments/${assessment.id}/students/${context.student.id}/performance`).expect(200);
  assert.match(page.text, /Gerar PDF atualizado/);
  const pdf = await professor.get(`/assessments/${assessment.id}/students/${context.student.id}/performance.pdf`)
    .expect(200)
    .expect("Content-Type", /application\/pdf/)
    .expect("Cache-Control", /no-store/);
  assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
  context.close();
});

test("Feature Oral: professor cria modelo, aplica prova oral e ve OT preenchido", async () => {
  const context = fixture();
  const professor = request.agent(context.app);
  await loginProfessor(professor);
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Avaliacao Oral" });

  const list = await professor.get(`/assessments?classId=${context.classroom.id}`).expect(200);
  assert.match(list.text, /Avaliacao Oral/);

  const oralPage = await professor.get(`/assessments/${assessment.id}/oral`).expect(200);
  assert.match(oralPage.text, /Criar novo modelo oral/);

  await professor.post(`/api/assessments/${assessment.id}/oral/templates`).type("form").send({
    title: "Oral Unit 1",
    description: "Aplicacao individual",
    questionsText: "Introduce yourself\nSay your favorite food",
  }).expect(302);

  const oralTest = context.store.getAssessmentOralTest(assessment.id);
  assert.equal(oralTest.questions.length, 2);

  const attemptPage = await professor
    .get(`/assessments/${assessment.id}/oral/apply/students/${context.student.id}`)
    .expect(200);
  assert.match(attemptPage.text, /Observacoes da prova oral/);
  assert.match(attemptPage.text, /maxlength="500"/);

  await professor.post(`/api/assessments/${assessment.id}/oral/students/${context.student.id}/complete`).type("form").send({
    [`answer_${oralTest.questions[0].id}`]: "correct",
    [`answer_${oralTest.questions[1].id}`]: "half",
    observation: "Respondeu bem, hesitou pouco.",
  }).expect(302);

  const applyPage = await professor.get(`/assessments/${assessment.id}/oral/apply`).expect(200);
  assert.match(applyPage.text, /Nota oral: 7,50/);
  assert.match(applyPage.text, /Respondeu bem, hesitou pouco/);

  const gradesPage = await professor.get(`/assessments/${assessment.id}/grades`).expect(200);
  assert.match(gradesPage.text, /Nota oral calculada: 7,50/);
  assert.match(gradesPage.text, new RegExp(`name="ot_${context.student.id}" value="7,50"`));
  context.close();
});

test("Feature 07-08: gerador produz PDF interno sem conversor externo", async () => {
  const context = fixture();
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Avaliacao Final" });
  context.store.saveAssessmentGrades(assessment.id, [{
    studentId: context.student.id,
    status: "graded",
    otScore: "10",
    wtScore: "9,5",
  }]);
  const report = context.store.updateAssessmentPerformanceReport(assessment.id, context.student.id, {
    participation: "otimo",
    grammarVocabulary: "bom",
    homework: "otimo",
    behavior: "bom",
    comments: "Pronto para avancar.",
  }, { professorId: 1 });

  const payload = {
    assessment: context.store.getAssessmentById(assessment.id),
    grade: context.store.getAssessmentGrades(assessment.id)[0],
    student: context.student,
    report,
    professor: context.store.getProfessorById(1),
  };

  const generated = await generatePerformancePdf(payload);
  const pdfText = generated.toString("latin1");

  assert.equal(generated.subarray(0, 4).toString(), "%PDF");
  assert.match(pdfText, /Ana Teste/);
  assert.match(pdfText, /Avaliacao[\s\S]*Final/);
  assert.match(pdfText, /Super Minds 3/);
  assert.match(pdfText, /Prova Escrita:/);
  assert.match(pdfText, /9,50/);
  assert.match(pdfText, /Prova Oral:/);
  assert.match(pdfText, /10,00/);
  assert.match(pdfText, /Observacoes: Pronto para avancar/);
  context.close();
});

test("Feature 09-10: ranking academico pode ser ativado por configuracao", async () => {
  const context = fixture({ runtimeConfig: { academicRankingEnabled: true } });
  const assessment = context.store.createAssessment(context.classroom.id, { title: "Avaliacao" });
  context.store.saveAssessmentGrades(assessment.id, [{
    studentId: context.student.id,
    status: "graded",
    otScore: "10",
    wtScore: "10",
  }]);
  context.store.publishAssessment(assessment.id);
  const professor = request.agent(context.app);
  await loginProfessor(professor);

  const dashboard = await professor.get("/dashboard").expect(200);
  assert.match(dashboard.text, /Bonus academico: \+100/);
  assert.match(dashboard.text, />100 pts</);
  context.close();
});
