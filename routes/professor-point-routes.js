const { requireProfessor } = require("../auth");
const {
  buildPointsRedirectSuffix,
  filterStudentsByScope,
  getProfessorScope,
  normalizeProfessorId,
} = require("./professor-scope");

function registerProfessorPointRoutes(router, { store }) {
  router.post("/api/points", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);

    try {
      const { classIds } = await getProfessorScope(store, professorId);
      const scopedStudentIds = new Set(
        filterStudentsByScope(await store.getAllStudents(), classIds).map((student) => student.id)
      );
      const requestedStudentIds = (Array.isArray(req.body.studentIds) ? req.body.studentIds : [req.body.studentIds])
        .map((studentId) => Number(studentId))
        .filter((studentId) => Number.isInteger(studentId) && studentId > 0);

      if (!requestedStudentIds.length || requestedStudentIds.some((studentId) => !scopedStudentIds.has(studentId))) {
        throw new Error("Selecione apenas alunos das suas turmas.");
      }

      await store.addPointsBulk(req.body.studentIds, req.body.category, req.body.points, req.body.note);
      const selectedClassSuffix = await buildPointsRedirectSuffix(store, professorId, req.body.classId);
      return res.redirect(`/points?message=${encodeURIComponent("Pontuacao registrada com sucesso.")}${selectedClassSuffix}`);
    } catch (error) {
      const selectedClassSuffix = await buildPointsRedirectSuffix(store, professorId, req.body.classId);
      return res.redirect(`/points?error=${encodeURIComponent(error.message)}${selectedClassSuffix}`);
    }
  });

  router.post("/api/points/undo", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const scopedStudentIds = filterStudentsByScope(await store.getAllStudents(), classIds).map((student) => student.id);
      const removed = await store.undoLatestPointBatch(scopedStudentIds);
      return res.redirect(`/points?message=${encodeURIComponent(`${removed} lancamento(s) desfeito(s).`)}`);
    } catch (error) {
      return res.redirect(`/points?error=${encodeURIComponent(error.message)}`);
    }
  });
}

module.exports = {
  registerProfessorPointRoutes,
};
