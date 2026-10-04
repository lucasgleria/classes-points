const express = require("express");
const { requireStudent, verifyStudent } = require("../auth");
const { renderStudentLogin, renderStudentView } = require("../views");

function createStudentRouter(store, auth) {
  const router = express.Router();

  router.get("/student/:token", async (req, res) => {
    const student = await store.getStudentByToken(req.params.token);
    if (
      req.auth &&
      req.auth.role === "student" &&
      req.auth.studentId &&
      req.auth.studentToken === req.params.token &&
      student &&
      student.id === req.auth.studentId
    ) {
      return res.redirect(`/student/${req.params.token}/view`);
    }

    const error = req.query.error === "invalid" ? "Credenciais invalidas." : "";
    return res.send(renderStudentLogin(student, error));
  });

  router.post("/student/:token/login", async (req, res) => {
    const student = await verifyStudent(store, req.params.token, req.body.username, req.body.password);
    if (!student) {
      return res.redirect(`/student/${req.params.token}?error=invalid`);
    }

    auth.setStudent(res, student);
    return res.redirect(`/student/${student.token}/view`);
  });

  router.get("/student/:token/view", requireStudent, async (req, res) => {
    const summary = await store.getStudentSummaryByToken(req.params.token);
    if (!summary || summary.student.id !== req.auth.studentId) {
      return res.status(403).send("Acesso negado.");
    }
    return res.send(renderStudentView(summary));
  });

  router.get("/student/:token/logout", (req, res) => {
    auth.clear(res);
    return res.redirect(`/student/${req.params.token}`);
  });

  return router;
}

module.exports = {
  createStudentRouter,
};
