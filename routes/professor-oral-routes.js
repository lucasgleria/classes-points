const { requireProfessor } = require("../auth");
const {
  renderOralApplyPage,
  renderOralAssessmentPage,
  renderOralAttemptPage,
} = require("../views");
const {
  assertAssessmentWritable,
  getScopedAssessment,
} = require("./assessment-access");
const { normalizeProfessorId } = require("./professor-scope");
const { collectOralAnswers } = require("./professor-route-helpers");

function registerProfessorOralRoutes(router, { store }) {
  router.get("/assessments/:id/oral", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    const professorId = normalizeProfessorId(req.auth.professorId);
    const oralTest = await store.getAssessmentOralTest(assessment.id);
    const roster = oralTest ? await store.getAssessmentOralRoster(assessment.id) : [];
    return res.send(renderOralAssessmentPage(
      assessment,
      await store.getOralTestTemplates(professorId),
      oralTest,
      roster,
      req.query.message || "",
      req.query.error || ""
    ));
  });

  router.post("/api/assessments/:id/oral/templates", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    const professorId = normalizeProfessorId(req.auth.professorId);
    try {
      assertAssessmentWritable(assessment);
      const template = await store.createOralTestTemplate(professorId, {
        title: req.body.title,
        description: req.body.description,
        questionsText: req.body.questionsText,
      });
      await store.attachOralTemplateToAssessment(assessment.id, template.id, professorId);
      return res.redirect(`/assessments/${assessment.id}/oral?message=${encodeURIComponent("Modelo oral criado e vinculado a avaliacao.")}`);
    } catch (error) {
      return res.redirect(`/assessments/${assessment.id}/oral?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/oral/attach-template", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    const professorId = normalizeProfessorId(req.auth.professorId);
    try {
      assertAssessmentWritable(assessment);
      await store.attachOralTemplateToAssessment(assessment.id, req.body.templateId, professorId);
      return res.redirect(`/assessments/${assessment.id}/oral?message=${encodeURIComponent("Modelo oral vinculado a avaliacao.")}`);
    } catch (error) {
      return res.redirect(`/assessments/${assessment.id}/oral?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.get("/assessments/:id/oral/apply", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    const oralTest = await store.getAssessmentOralTest(assessment.id);
    if (!oralTest) {
      return res.redirect(`/assessments/${assessment.id}/oral?error=${encodeURIComponent("Selecione ou crie um modelo oral antes de aplicar a prova.")}`);
    }
    return res.send(renderOralApplyPage(
      assessment,
      oralTest,
      await store.getAssessmentOralRoster(assessment.id),
      req.query.message || "",
      req.query.error || ""
    ));
  });

  router.get("/assessments/:id/oral/apply/students/:studentId", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    const oralTest = assessment ? await store.getAssessmentOralTest(assessment.id) : null;
    const student = await store.getStudentById(req.params.studentId);
    const rosterItem = oralTest
      ? (await store.getAssessmentOralRoster(assessment.id)).find((item) => item.student_id === Number(req.params.studentId))
      : null;
    if (!assessment || !oralTest || !student || !rosterItem) {
      return res.status(404).send("Prova oral ou aluno nao encontrado.");
    }
    return res.send(renderOralAttemptPage(
      assessment,
      oralTest,
      student,
      await store.getOralAttempt(oralTest.id, student.id),
      req.query.message || "",
      req.query.error || ""
    ));
  });

  router.post("/api/assessments/:id/oral/students/:studentId/draft", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    const oralTest = assessment ? await store.getAssessmentOralTest(assessment.id) : null;
    if (!assessment || !oralTest) {
      return res.status(404).send("Prova oral nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      await store.saveOralAttemptDraft(
        oralTest.id,
        req.params.studentId,
        collectOralAnswers(req.body, oralTest.questions),
        {
          observation: req.body.observation,
          professorId: req.auth.professorId,
        }
      );
      return res.redirect(`/assessments/${assessment.id}/oral/apply/students/${req.params.studentId}?message=${encodeURIComponent("Rascunho oral salvo.")}`);
    } catch (error) {
      return res.redirect(`/assessments/${assessment.id}/oral/apply/students/${req.params.studentId}?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/oral/students/:studentId/complete", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    const oralTest = assessment ? await store.getAssessmentOralTest(assessment.id) : null;
    if (!assessment || !oralTest) {
      return res.status(404).send("Prova oral nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      await store.completeOralAttempt(
        oralTest.id,
        req.params.studentId,
        collectOralAnswers(req.body, oralTest.questions),
        {
          observation: req.body.observation,
          professorId: req.auth.professorId,
          reason: req.body.reason,
        }
      );
      return res.redirect(`/assessments/${assessment.id}/oral/apply?message=${encodeURIComponent("Nota oral calculada e posicionada no campo OT.")}`);
    } catch (error) {
      return res.redirect(`/assessments/${assessment.id}/oral/apply/students/${req.params.studentId}?error=${encodeURIComponent(error.message)}`);
    }
  });
}

module.exports = {
  registerProfessorOralRoutes,
};
