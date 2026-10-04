const { requireProfessor } = require("../auth");
const {
  renderStudentDetailsPage,
  renderStudentHistoryPage,
  renderStudentPerformancePage,
} = require("../views");
const {
  filterStudentsByScope,
  getProfessorScope,
  isStudentVisible,
  normalizeProfessorId,
} = require("./professor-scope");
const { buildCredentialsMessage } = require("./professor-route-helpers");

function registerProfessorStudentRoutes(router, { store }) {
  router.get("/students/:id/history", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classIds } = await getProfessorScope(store, professorId);
    const student = await store.getStudentById(req.params.id);
    if (!isStudentVisible(student, classIds)) {
      return res.status(404).send("Aluno nao encontrado.");
    }

    return res.send(renderStudentHistoryPage(student, await store.getStudentHistory(student.id)));
  });

  router.get("/students/:id/details", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classIds } = await getProfessorScope(store, professorId);
    const student = await store.getStudentById(req.params.id);
    if (!isStudentVisible(student, classIds)) {
      return res.status(404).send("Aluno nao encontrado.");
    }

    return res.send(
      renderStudentDetailsPage(
        student,
        await store.getStudentTotals(student.id),
        await store.getStudentHistory(student.id),
        req.query.message || "",
        req.query.error || "",
        await store.getStudentAcademicSummary(student.id),
        await store.getStudentAssessments(student.id, { publishedOnly: false })
      )
    );
  });

  router.get("/students/:id/performance", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classIds } = await getProfessorScope(store, professorId);
    const student = await store.getStudentById(req.params.id);
    if (!isStudentVisible(student, classIds)) {
      return res.status(404).send("Aluno nao encontrado.");
    }

    return res.send(
      renderStudentPerformancePage(
        student,
        await store.getStudentPerformanceProfile(student.id),
        req.query.message || "",
        req.query.error || ""
      )
    );
  });

  router.post("/students/:id/performance", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classIds } = await getProfessorScope(store, professorId);
    const student = await store.getStudentById(req.params.id);
    if (!isStudentVisible(student, classIds)) {
      return res.status(404).send("Aluno nao encontrado.");
    }

    try {
      await store.updateStudentPerformanceProfile(student.id, {
        participation: req.body.participation,
        grammarVocabulary: req.body.grammarVocabulary,
        homework: req.body.homework,
        behavior: req.body.behavior,
        comments: req.body.comments,
      });

      return res.redirect(
        `/students/${student.id}/performance?message=${encodeURIComponent("Ficha salva com sucesso.")}`
      );
    } catch (error) {
      return res.redirect(
        `/students/${student.id}/performance?error=${encodeURIComponent(error.message)}`
      );
    }
  });

  router.post("/api/students", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const selectedClassId = Number(req.body.classId);

      if (!Number.isInteger(selectedClassId) || !classIds.has(selectedClassId)) {
        throw new Error("Turma nao encontrada.");
      }

      const student = await store.createStudent(req.body.name, { classId: req.body.classId });
      const message = buildCredentialsMessage(student);
      return res.redirect(`/add?message=${encodeURIComponent(message)}`);
    } catch (error) {
      return res.redirect(`/add?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/students/import", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const selectedClassId = Number(req.body.classId);

      if (!Number.isInteger(selectedClassId) || !classIds.has(selectedClassId)) {
        throw new Error("Turma nao encontrada.");
      }

      const students = await store.importStudents(req.body.names, { classId: selectedClassId });
      return res.redirect(`/add?message=${encodeURIComponent(`${students.length} aluno(s) importado(s) com sucesso.`)}`);
    } catch (error) {
      return res.redirect(`/add?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/students/move", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const scopedStudentIds = new Set(
        filterStudentsByScope(await store.getAllStudents(), classIds).map((student) => student.id)
      );
      const selectedClassId = Number(req.body.classId);
      const requestedStudentIds = (Array.isArray(req.body.studentIds) ? req.body.studentIds : [req.body.studentIds])
        .map((studentId) => Number(studentId))
        .filter((studentId) => Number.isInteger(studentId) && studentId > 0);

      if (!Number.isInteger(selectedClassId) || !classIds.has(selectedClassId)) {
        throw new Error("Turma de destino nao encontrada.");
      }

      if (!requestedStudentIds.length || requestedStudentIds.some((studentId) => !scopedStudentIds.has(studentId))) {
        throw new Error("Selecione apenas alunos das suas turmas.");
      }

      const moved = await store.moveStudents(requestedStudentIds, selectedClassId);
      return res.redirect(`/add?message=${encodeURIComponent(`${moved.length} aluno(s) movido(s) com sucesso.`)}`);
    } catch (error) {
      return res.redirect(`/add?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/students/:id/update", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const existingStudent = await store.getStudentById(req.params.id);
      const selectedClassId = Number(req.body.classId);

      if (!isStudentVisible(existingStudent, classIds)) {
        throw new Error("Aluno nao encontrado.");
      }

      if (!Number.isInteger(selectedClassId) || !classIds.has(selectedClassId)) {
        throw new Error("Turma nao encontrada.");
      }

      const student = await store.updateStudent(req.params.id, {
        name: req.body.name,
        username: req.body.username,
        password: req.body.password,
        token: req.body.token,
        classId: req.body.classId,
      });

      return res.redirect(
        `/visualizations?message=${encodeURIComponent(`Dados de ${student.name} atualizados com sucesso.`)}`
      );
    } catch (error) {
      return res.redirect(`/visualizations?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.post("/api/students/:id/delete", requireProfessor, async (req, res) => {
    try {
      const professorId = normalizeProfessorId(req.auth.professorId);
      const { classIds } = await getProfessorScope(store, professorId);
      const existingStudent = await store.getStudentById(req.params.id);

      if (!isStudentVisible(existingStudent, classIds)) {
        throw new Error("Aluno nao encontrado.");
      }

      const student = await store.deleteStudent(req.params.id);
      return res.redirect(
        `/visualizations?message=${encodeURIComponent(`Aluno ${student.name} removido com todos os pontos.`)}`
      );
    } catch (error) {
      return res.redirect(`/visualizations?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.get("/api/students", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classIds } = await getProfessorScope(store, professorId);
    res.json(filterStudentsByScope(await store.getAllStudents(), classIds));
  });

  router.get("/api/students/:id/history", requireProfessor, async (req, res) => {
    const professorId = normalizeProfessorId(req.auth.professorId);
    const { classIds } = await getProfessorScope(store, professorId);
    const student = await store.getStudentById(req.params.id);

    if (!isStudentVisible(student, classIds)) {
      return res.status(404).json({ error: "Aluno nao encontrado." });
    }

    return res.json(await store.getStudentHistory(student.id));
  });
}

module.exports = {
  registerProfessorStudentRoutes,
};
