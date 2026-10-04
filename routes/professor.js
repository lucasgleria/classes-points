const express = require("express");
const { registerProfessorAssessmentRoutes } = require("./professor-assessment-routes");
const { registerProfessorAuthRoutes } = require("./professor-auth-routes");
const { registerProfessorClassRoutes } = require("./professor-class-routes");
const { registerProfessorOralRoutes } = require("./professor-oral-routes");
const { registerProfessorPageRoutes } = require("./professor-page-routes");
const { registerProfessorPointRoutes } = require("./professor-point-routes");
const { registerProfessorStudentRoutes } = require("./professor-student-routes");

function createProfessorRouter(store, auth, runtimeConfig = {}) {
  const router = express.Router();
  const deps = { store, auth, runtimeConfig };

  registerProfessorAuthRoutes(router, deps);
  registerProfessorPageRoutes(router, deps);
  registerProfessorAssessmentRoutes(router, deps);
  registerProfessorOralRoutes(router, deps);
  registerProfessorStudentRoutes(router, deps);
  registerProfessorClassRoutes(router, deps);
  registerProfessorPointRoutes(router, deps);

  return router;
}

module.exports = {
  createProfessorRouter,
};
