const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  DEFAULT_REPORT_CITY,
  DEFAULT_REPORT_TIMEZONE,
  getRuntimeConfig,
} = require("../config");

test("Feature 00: configuracoes academicas iniciam com valores seguros", () => {
  const config = getRuntimeConfig({});

  assert.equal(config.academicRankingEnabled, false);
  assert.equal(config.reportTimezone, DEFAULT_REPORT_TIMEZONE);
  assert.equal(config.reportCity, DEFAULT_REPORT_CITY);
  assert.equal(config.databaseProvider, "sqlite");
  assert.equal(config.databaseFilename, path.join(__dirname, "..", "data", "points.sqlite"));
});

test("Feature 00: configuracoes academicas aceitam valores do ambiente", () => {
  const config = getRuntimeConfig({
    ACADEMIC_RANKING_ENABLED: "TRUE",
    REPORT_TIMEZONE: "  UTC  ",
    REPORT_CITY: "  Sao Paulo  ",
    TEACHER_USERNAME: "Professor Teste",
    TEACHER_PASSWORD: "senha-teste",
  });

  assert.equal(config.academicRankingEnabled, true);
  assert.equal(config.reportTimezone, "UTC");
  assert.equal(config.reportCity, "Sao Paulo");
  assert.equal(config.teacherUsername, "Professor Teste");
});

test("Feature 00: valores vazios preservam os padroes de relatorio", () => {
  const config = getRuntimeConfig({
    ACADEMIC_RANKING_ENABLED: "false",
    REPORT_TIMEZONE: " ",
    REPORT_CITY: "",
  });

  assert.equal(config.academicRankingEnabled, false);
  assert.equal(config.reportTimezone, DEFAULT_REPORT_TIMEZONE);
  assert.equal(config.reportCity, DEFAULT_REPORT_CITY);
});
