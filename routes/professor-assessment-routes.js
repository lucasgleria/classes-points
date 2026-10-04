const { requireProfessor } = require("../auth");
const { generatePerformancePdf } = require("../performance-pdf");
const {
  renderAssessmentGradesPage,
  renderAssessmentPerformancePage,
  renderAssessmentsPage,
} = require("../views");
const {
  assertAssessmentWritable,
  getScopedAssessment,
} = require("./assessment-access");
const {
  getProfessorScope,
  normalizeProfessorId,
  normalizeSelectedClassId,
} = require("./professor-scope");

function registerProfessorAssessmentRoutes(router, { store, runtimeConfig }) {
  router.get("/assessments", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classes, classIds } = await getProfessorScope(store, professorId);
    const selectedClassId = normalizeSelectedClassId(req.query.classId || "", classIds);
    const assessments = selectedClassId ? await store.getAssessmentsByClass(selectedClassId) : [];
    return res.send(renderAssessmentsPage(classes, selectedClassId, assessments, req.query.message || "", req.query.error || ""));
  });

  router.get("/assessments/history", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classes } = await getProfessorScope(store, professorId, { includeArchived: true });
    const archivedClasses = classes.filter((classroom) => classroom.archived_at);
    const archivedClassIds = new Set(archivedClasses.map((classroom) => classroom.id));
    const selectedClassId = normalizeSelectedClassId(req.query.classId || "", archivedClassIds);
    const assessments = selectedClassId ? await store.getAssessmentsByClass(selectedClassId) : [];
    return res.send(renderAssessmentsPage(archivedClasses, selectedClassId, assessments, req.query.message || "", req.query.error || "", true));
  });

  router.get("/assessments/:id/grades", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    const grades = await store.getAssessmentGrades(assessment.id);
    const rosterIds = new Set(grades.map((grade) => grade.student_id));
    const candidates = (await store.getAllStudents()).filter(
      (student) => student.class_id === assessment.class_id && !rosterIds.has(student.id)
    );
    const oralTest = await store.getAssessmentOralTest(assessment.id);
    const oralResults = oralTest
      ? Object.fromEntries(
        (await store.getAssessmentOralRoster(assessment.id))
          .filter((item) => item.attempt_status === "completed")
          .map((item) => [String(item.student_id), item])
      )
      : {};
    return res.send(renderAssessmentGradesPage(
      assessment,
      grades,
      await store.getAssessmentGradeRevisions(assessment.id),
      candidates,
      oralResults,
      req.query.message || "",
      req.query.error || ""
    ));
  });

  router.get("/assessments/:id/students/:studentId/performance", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    const student = await store.getStudentById(req.params.studentId);
    const grade = assessment
      ? (await store.getAssessmentGrades(assessment.id)).find((item) => item.student_id === Number(req.params.studentId))
      : null;
    if (!assessment || !student || !grade) {
      return res.status(404).send("Avaliacao ou aluno nao encontrado.");
    }
    return res.send(renderAssessmentPerformancePage(
      assessment,
      grade,
      student,
      await store.getAssessmentPerformanceReport(assessment.id, student.id),
      await store.getStudentPerformanceProfile(student.id),
      req.query.message || "",
      req.query.error || ""
    ));
  });

  router.get("/assessments/:id/students/:studentId/performance.pdf", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    const student = await store.getStudentById(req.params.studentId);
    const grade = assessment
      ? (await store.getAssessmentGrades(assessment.id)).find((item) => item.student_id === Number(req.params.studentId))
      : null;
    const report = assessment
      ? await store.getAssessmentPerformanceReport(assessment.id, req.params.studentId)
      : null;
    const professor = await store.getProfessorById(req.auth.professorId);
    if (!assessment || !student || !grade || grade.status !== "graded" || !report || !professor) {
      return res.status(404).send("Salve a ficha da avaliacao antes de gerar o PDF.");
    }
    let pdf;
    try {
      pdf = await generatePerformancePdf({
        assessment,
        grade,
        student,
        report,
        professor,
        timezone: runtimeConfig.reportTimezone,
        city: runtimeConfig.reportCity,
      });
    } catch (error) {
      return res.status(500).send(error.message);
    }
    const safeName = student.name.replace(/[^a-z0-9]+/gi, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Ficha_desempenho_${safeName}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(pdf);
  });

  router.post("/api/assessments", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    try {
      const { classIds } = await getProfessorScope(store, professorId);
      const classId = Number(req.body.classId);
      if (!classIds.has(classId)) {
        throw new Error("Turma nao encontrada.");
      }
      const assessment = await store.createAssessment(classId, {
        title: req.body.title,
        description: req.body.description,
        assessmentDate: req.body.assessmentDate,
        countsForRanking: req.body.countsForRanking === "1",
      });
      return res.redirect(`/assessments/${assessment.id}/grades?message=${encodeURIComponent("Avaliacao criada com a lista atual da turma.")}`);
    } catch (error) {
      return res.redirect(`/assessments?classId=${encodeURIComponent(req.body.classId || "")}&error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/grades", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      const grades = await store.getAssessmentGrades(assessment.id);
      await store.saveAssessmentGrades(
        assessment.id,
        grades.map((grade) => {
          const status = req.body[`status_${grade.student_id}`];
          return {
            studentId: grade.student_id,
            status,
            otScore: status === "graded" ? req.body[`ot_${grade.student_id}`] : "",
            wtScore: status === "graded" ? req.body[`wt_${grade.student_id}`] : "",
            teacherNote: req.body[`note_${grade.student_id}`],
          };
        }),
        { professorId: req.auth.professorId, reason: req.body.reason }
      );
      return res.redirect(`/assessments/${assessment.id}/grades?message=${encodeURIComponent("Notas salvas com sucesso.")}`);
    } catch (error) {
      return res.redirect(`/assessments/${assessment.id}/grades?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/update", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      await store.updateAssessment(assessment.id, {
        title: req.body.title,
        description: req.body.description,
        assessmentDate: req.body.assessmentDate,
        countsForRanking: req.body.countsForRanking === "1",
      });
      return res.redirect(`/assessments?classId=${assessment.class_id}&message=${encodeURIComponent("Avaliacao atualizada.")}`);
    } catch (error) {
      return res.redirect(`/assessments?classId=${assessment.class_id}&error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/students", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      await store.addStudentToAssessment(assessment.id, req.body.studentId);
      return res.redirect(`/assessments/${assessment.id}/grades?message=${encodeURIComponent("Aluno adicionado a avaliacao.")}`);
    } catch (error) {
      return res.redirect(`/assessments/${assessment.id}/grades?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/publish", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      await store.publishAssessment(assessment.id);
      return res.redirect(`/assessments?classId=${assessment.class_id}&message=${encodeURIComponent("Avaliacao publicada.")}`);
    } catch (error) {
      return res.redirect(`/assessments?classId=${assessment.class_id}&error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/archive", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      await store.archiveAssessment(assessment.id);
      return res.redirect(`/assessments?classId=${assessment.class_id}&message=${encodeURIComponent("Avaliacao arquivada.")}`);
    } catch (error) {
      return res.redirect(`/assessments?classId=${assessment.class_id}&error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/delete", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      await store.deleteAssessment(assessment.id);
      return res.redirect(`/assessments?classId=${assessment.class_id}&message=${encodeURIComponent("Avaliacao excluida.")}`);
    } catch (error) {
      return res.redirect(`/assessments?classId=${assessment.class_id}&error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/assessments/:id/students/:studentId/performance", requireProfessor, async (req, res) => {
    const assessment = await getScopedAssessment(store, req);
    if (!assessment) {
      return res.status(404).send("Avaliacao nao encontrada.");
    }
    try {
      assertAssessmentWritable(assessment);
      await store.updateAssessmentPerformanceReport(assessment.id, req.params.studentId, {
        participation: req.body.participation,
        grammarVocabulary: req.body.grammarVocabulary,
        homework: req.body.homework,
        behavior: req.body.behavior,
        comments: req.body.comments,
      }, { professorId: req.auth.professorId });
      return res.redirect(`/assessments/${assessment.id}/students/${req.params.studentId}/performance?message=${encodeURIComponent("Ficha da avaliacao salva.")}`);
    } catch (error) {
      return res.redirect(`/assessments/${assessment.id}/students/${req.params.studentId}/performance?error=${encodeURIComponent(error.message)}`);
    }
  });
}

module.exports = {
  registerProfessorAssessmentRoutes,
};
