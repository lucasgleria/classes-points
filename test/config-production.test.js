const test = require("node:test");
const assert = require("node:assert/strict");
const { getRuntimeConfig } = require("../config");

const PRODUCTION_ENV = { VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" };
const SECRET = "s".repeat(32);
const ACCOUNTS = JSON.stringify([
  { id: 1, username: "Professor Um", password: "senha-um" },
  { id: 2, username: "Professor Dois", password: "senha-dois" },
]);

test("Producao: exige TEACHER_ACCOUNTS em vez de senhas do codigo", () => {
  assert.throws(() => getRuntimeConfig({ ...PRODUCTION_ENV, SESSION_SECRET: SECRET }), /TEACHER_ACCOUNTS/);
  assert.throws(
    () => getRuntimeConfig({ ...PRODUCTION_ENV, SESSION_SECRET: SECRET, TEACHER_PASSWORD: "x" }),
    /TEACHER_ACCOUNTS/
  );
});

test("Producao: exige SESSION_SECRET forte", () => {
  assert.throws(() => getRuntimeConfig({ ...PRODUCTION_ENV, TEACHER_ACCOUNTS: ACCOUNTS }), /SESSION_SECRET/);
  assert.throws(
    () => getRuntimeConfig({ ...PRODUCTION_ENV, TEACHER_ACCOUNTS: ACCOUNTS, SESSION_SECRET: "curto" }),
    /SESSION_SECRET/
  );
});

test("Producao: usa apenas as contas e o segredo do ambiente", () => {
  const config = getRuntimeConfig({ ...PRODUCTION_ENV, TEACHER_ACCOUNTS: ACCOUNTS, SESSION_SECRET: SECRET });

  assert.deepEqual(config.teacherAccounts.map((account) => account.username), ["Professor Um", "Professor Dois"]);
  assert.equal(config.teacherPassword, "senha-um");
  assert.equal(config.sessionSecret, SECRET);
});

test("Desenvolvimento: usa apenas senhas e segredo marcados como de desenvolvimento", () => {
  const config = getRuntimeConfig({});

  assert.ok(config.teacherAccounts.every((account) => account.password.startsWith("dev-")));
  assert.match(config.sessionSecret, /development/);
});
