const { requireProfessor } = require("../auth");
const {
  renderDashboard,
  renderGuidePage,
  renderManagementPage,
  renderMyClassesPage,
  renderMyStudentsPage,
  renderPointsPage,
  renderVisualizationsPage,
} = require("../views");
const {
  filterStudentsByScope,
  getProfessorScope,
  normalizeProfessorId,
  normalizeSelectedClassId,
} = require("./professor-scope");
const { getBaseUrl } = require("./professor-route-helpers");

function registerProfessorPageRoutes(router, { store, runtimeConfig }) {
  router.get("/dashboard", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classes, classIds } = await getProfessorScope(store, professorId);
    const selectedClassId = normalizeSelectedClassId(req.query.classId || "", classIds);
    const students = filterStudentsByScope(await store.getAllStudents(), classIds);
    const rankedStudents = await Promise.all(students.map(async (student) => {
      const academic = await store.getStudentAcademicSummary(student.id);
      const academicBonus = runtimeConfig.academicRankingEnabled ? academic.academicBonus : 0;
      return {
        ...student,
        academic,
        academic_bonus: academicBonus,
        ranking_average: runtimeConfig.academicRankingEnabled ? academic.averageScoreHundredths : null,
        ranking_score: Number(student.total_points || 0) + academicBonus,
      };
    }));
    res.send(renderDashboard(rankedStudents, classes, selectedClassId, runtimeConfig.academicRankingEnabled));
  });

  router.get("/add", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classes, classIds } = await getProfessorScope(store, professorId);
    const students = filterStudentsByScope(await store.getAllStudents(), classIds);
    res.send(renderManagementPage(classes, req.query.message || "", req.query.error || "", students));
  });

  router.get("/classes", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classes } = await getProfessorScope(store, professorId);
    res.send(renderMyClassesPage(classes, req.query.message || "", req.query.error || ""));
  });

  router.get("/my-students", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classes, classIds } = await getProfessorScope(store, professorId);
    const selectedClassId = normalizeSelectedClassId(req.query.classId || "", classIds);
    const students = filterStudentsByScope(await store.getAllStudents(), classIds);
    res.send(renderMyStudentsPage(students, classes, selectedClassId));
  });

  router.get("/points", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classes, classIds } = await getProfessorScope(store, professorId);
    const selectedClassId = normalizeSelectedClassId(req.query.classId || "", classIds);
    const students = filterStudentsByScope(await store.getAllStudents(), classIds);

    res.send(
      renderPointsPage(
        students,
        classes,
        selectedClassId,
        req.query.message || "",
        req.query.error || ""
      )
    );
  });

  router.get("/visualizations", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classes, classIds } = await getProfessorScope(store, professorId);
    const selectedClassId = normalizeSelectedClassId(req.query.classId || "", classIds);
    const students = filterStudentsByScope(await store.getStudentsWithCredentials(), classIds);

    res.send(
      renderVisualizationsPage(
        students,
        classes,
        getBaseUrl(req),
        req.query.message || "",
        req.query.error || "",
        selectedClassId
      )
    );
  });

  router.get("/guide", requireProfessor, (req, res) => {
    res.send(renderGuidePage());
  });
}

module.exports = {
  registerProfessorPageRoutes,
};
