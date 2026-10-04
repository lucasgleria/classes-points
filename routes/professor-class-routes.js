const { requireProfessor } = require("../auth");
const {
  getProfessorScope,
  normalizeProfessorId,
} = require("./professor-scope");

function registerProfessorClassRoutes(router, { store }) {
  router.post("/api/classes", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const classroom = await store.createClass(
        {
          book: req.body.book,
          weekday: req.body.weekday,
          startTime: req.body.startTime,
          endTime: req.body.endTime,
        },
        { professorId }
      );

      return res.redirect(`/add?message=${encodeURIComponent(`Turma ${classroom.book} criada com sucesso.`)}`);
    } catch (error) {
      return res.redirect(`/add?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/classes/move-students", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const fromClassId = Number(req.body.fromClassId);
      const toClassId = Number(req.body.toClassId);

      if (!Number.isInteger(fromClassId) || !classIds.has(fromClassId)) {
        throw new Error("Turma de origem nao encontrada.");
      }

      if (!Number.isInteger(toClassId) || !classIds.has(toClassId)) {
        throw new Error("Turma de destino nao encontrada.");
      }

      const moved = await store.moveClassStudents(fromClassId, toClassId);
      return res.redirect(`/add?message=${encodeURIComponent(`${moved} aluno(s) movido(s) para a nova turma.`)}`);
    } catch (error) {
      return res.redirect(`/add?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/classes/:id/update", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const classId = Number(req.params.id);

      if (!Number.isInteger(classId) || !classIds.has(classId)) {
        throw new Error("Turma nao encontrada.");
      }

      const classroom = await store.updateClass(classId, {
        book: req.body.book,
        weekday: req.body.weekday,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
      });

      return res.redirect(`/classes?message=${encodeURIComponent(`Turma ${classroom.book} atualizada com sucesso.`)}`);
    } catch (error) {
      return res.redirect(`/classes?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/classes/:id/archive", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const classId = Number(req.params.id);

      if (!Number.isInteger(classId) || !classIds.has(classId)) {
        throw new Error("Turma nao encontrada.");
      }

      const classroom = await store.archiveClass(classId);
      return res.redirect(`/classes?message=${encodeURIComponent(`Turma ${classroom.book} arquivada.`)}`);
    } catch (error) {
      return res.redirect(`/classes?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/classes/:id/delete", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const classId = Number(req.params.id);

      if (!Number.isInteger(classId) || !classIds.has(classId)) {
        throw new Error("Turma nao encontrada.");
      }

      const classroom = await store.deleteClass(classId);
      return res.redirect(`/classes?message=${encodeURIComponent(`Turma ${classroom.book} apagada.`)}`);
    } catch (error) {
      return res.redirect(`/classes?error=${encodeURIComponent(error.message)}`);
    }
  });
}

module.exports = {
  registerProfessorClassRoutes,
};
