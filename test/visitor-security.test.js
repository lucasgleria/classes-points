const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");
const { createDatabase } = require("../db");
const { getRuntimeConfig } = require("../config");
const { createApp } = require("../app");
const { requireProfessor } = require("../auth");
const { createDemoStore } = require("../demo-seed");
const { hashPassword, isPasswordHash, resolveStoredPassword, verifyPassword } = require("../password-hash");

const teacher = getRuntimeConfig().teacherAccounts[0];
const MARKER = "AlunoRealMarcador";

// Banco "real" com um aluno marcador: nenhum caminho do visitante pode exibi-lo.
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "points-visitor-"));
  const store = createDatabase({ filename: path.join(dir, "test.sqlite") });
  const classroom = store.createClass(
    { book: "Turma Real", weekday: "Segundas", startTime: "08h00", endTime: "09h00" },
    { professorId: teacher.id }
  );
  const student = store.createStudent(MARKER, { classId: classroom.id });
  store.addPoints(student.id, "games", 10, "nota real");
  const demoStore = createDemoStore();
  const { app } = createApp({ store, sessionSecret: "test-secret", visitor: { getStore: () => demoStore } });
  return {
    app,
    store,
    demoStore,
    classroom,
    student,
    close() {
      store.close();
      demoStore.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function visitorAgent(app) {
  const agent = request.agent(app);
  const entry = await agent.get("/demo");
  assert.equal(entry.status, 303);
  assert.equal(entry.headers.location, "/dashboard");
  return agent;
}

function countRows(store) {
  return Object.fromEntries(
    store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
      .map(({ name }) => [name, store.db.prepare(`SELECT COUNT(*) AS total FROM "${name}"`).get().total])
  );
}

test("Visitante: navega pelas telas com dados ficticios e nunca ve dados reais", async () => {
  const context = fixture();
  const agent = await visitorAgent(context.app);
  const demoClass = context.demoStore.getAllClasses().find((classroom) => classroom.book === "Super Minds 2");
  const demoStudent = context.demoStore.getStudentsByProfessor(1)[0];
  const assessment = context.demoStore.getAssessmentsByClass(demoClass.id)
    .find((item) => item.status === "published" && context.demoStore.getAssessmentOralTest(item.id));
  const graded = context.demoStore.getAssessmentGrades(assessment.id).find((grade) => grade.status === "graded");

  const pages = [
    "/dashboard", "/add", "/classes", "/my-students", "/points", "/visualizations", "/guide",
    `/assessments?classId=${demoClass.id}`, "/assessments/history", `/assessments/${assessment.id}/grades`,
    `/assessments/${assessment.id}/oral`, `/assessments/${assessment.id}/oral/apply`,
    `/assessments/${assessment.id}/students/${graded.student_id}/performance`,
    `/students/${demoStudent.id}/details`, `/students/${demoStudent.id}/history`, "/api/students",
    `/student/${demoStudent.token}`, `/student/${demoStudent.token}/view`,
  ];
  for (const page of pages) {
    const response = await agent.get(page);
    assert.equal(response.status, 200, page);
    assert.doesNotMatch(response.text, new RegExp(MARKER), page);
  }

  const dashboard = await agent.get("/dashboard");
  assert.match(dashboard.text, /data-visitor="true"/);
  assert.match(dashboard.text, /Modo visitante/);
  assert.match(dashboard.text, /Super Minds 2/);

  const pdf = await agent.get(`/assessments/${assessment.id}/students/${graded.student_id}/performance.pdf`);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers["content-type"], /pdf/);
  context.close();
});

test("Visitante: rota desconhecida ou id real termina em 404, sem cair nas rotas reais", async () => {
  const context = fixture();
  const agent = await visitorAgent(context.app);
  for (const page of [`/students/${context.student.id + 1000}/details`, "/rota-que-nao-existe", "/api/students/999999/history"]) {
    const response = await agent.get(page);
    assert.notEqual(response.status, 200, page);
    assert.doesNotMatch(response.text, new RegExp(MARKER), page);
  }
  context.close();
});

test("Visitante: toda acao de escrita e recusada e nenhum banco muda", async () => {
  const context = fixture();
  const agent = await visitorAgent(context.app);
  const demoBefore = countRows(context.demoStore);
  const realBefore = countRows(context.store);
  const demoStudent = context.demoStore.getStudentsByProfessor(1)[0];
  const demoClass = context.demoStore.getAllClasses()[0];
  const assessment = context.demoStore.getAssessmentsByClass(demoClass.id)[0];

  const writes = [
    ["/api/points", { studentIds: [demoStudent.id], category: "games", points: "10", note: "", classId: demoClass.id }],
    ["/api/points/undo", {}],
    ["/api/students", { name: "Invasor", classId: demoClass.id }],
    ["/api/students/import", { names: "A\nB", classId: demoClass.id }],
    [`/api/students/${demoStudent.id}/delete`, {}],
    [`/api/students/${demoStudent.id}/update`, { name: "X", username: "x", password: "x", token: "x", classId: demoClass.id }],
    ["/api/classes", { book: "Nova", weekday: "Seg", startTime: "1", endTime: "2" }],
    [`/api/classes/${demoClass.id}/delete`, {}],
    [`/api/classes/${demoClass.id}/archive`, {}],
    ["/api/assessments", { classId: demoClass.id, title: "Nova" }],
    [`/api/assessments/${assessment.id}/delete`, {}],
    [`/api/assessments/${assessment.id}/archive`, {}],
    [`/api/assessments/${assessment.id}/grades`, { reason: "x" }],
    [`/student/${demoStudent.token}/login`, { username: demoStudent.username, password: demoStudent.password }],
    ["/login", { username: teacher.username, password: teacher.password }],
  ];
  for (const [url, body] of writes) {
    const response = await agent.post(url).type("form").send(body);
    assert.equal(response.status, 303, url);
    assert.match(decodeURIComponent(response.headers.location), /Modo visitante/, url);
  }
  for (const method of ["put", "patch", "delete"]) {
    const response = await agent[method]("/api/students/1");
    assert.equal(response.status, 303, method);
  }

  assert.deepEqual(countRows(context.demoStore), demoBefore);
  assert.deepEqual(countRows(context.store), realBefore);
  context.close();
});

test("Visitante: cookie de visitante nao abre rotas reais quando o modo visitante falha", async () => {
  const context = fixture();
  const agent = await visitorAgent(context.app);
  const cookie = agent.jar.getCookies({ domain: "127.0.0.1", path: "/", secure: false, script: false })[0];
  assert.ok(cookie);
  const payload = JSON.parse(Buffer.from(cookie.value.split(".")[0], "base64url").toString("utf8"));
  assert.equal(payload.role, "visitor");
  assert.equal(payload.professorId, undefined);

  let redirectedTo = null;
  requireProfessor({ auth: payload }, { redirect: (target) => { redirectedTo = target; } }, () => assert.fail("visitante passou no requireProfessor real"));
  assert.equal(redirectedTo, "/");
  context.close();
});

test("Seguranca: nomes, notas e mensagens da URL sao escapados (XSS)", async () => {
  const context = fixture();
  const evil = "<script>alert(1)</script>";
  const xssStudent = context.store.createStudent(`Aluno ${evil}`, { classId: context.classroom.id });
  context.store.addPoints(xssStudent.id, "bad_behavior", 2, `<img src=x onerror=alert(2)>`);
  const agent = request.agent(context.app);
  await agent.post("/login").type("form").send({ username: teacher.username, password: teacher.password }).expect(302);

  const pages = [
    "/dashboard", "/points", "/my-students", "/visualizations", "/add",
    `/students/${xssStudent.id}/details`, `/students/${xssStudent.id}/history`,
    `/points?error=${encodeURIComponent(evil)}`, `/add?message=${encodeURIComponent(evil)}`,
    `/classes?error=${encodeURIComponent(evil)}`,
  ];
  assert.match((await agent.get("/dashboard")).text, /Aluno &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  for (const page of pages) {
    const response = await agent.get(page);
    assert.equal(response.status, 200, page);
    assert.doesNotMatch(response.text, /<script>alert/, page);
    assert.doesNotMatch(response.text, /<img src=x/, page);
  }
  context.close();
});

test("Seguranca: limite de tentativas bloqueia a 6a tentativa e o sucesso zera o contador", async () => {
  const context = fixture();
  const agent = request.agent(context.app);
  const login = (password) => agent.post("/login").type("form").send({ username: teacher.username, password });

  const ok = await login(teacher.password);
  assert.equal(ok.headers.location, "/dashboard");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login("senha-errada")).headers.location, "/?error=invalid");
  }
  assert.equal((await login(teacher.password)).headers.location, "/?error=blocked", "senha certa tambem bloqueada");
  assert.match((await request(context.app).get("/?error=blocked")).text, /Muitas tentativas/);

  context.store.clearLoginFailures([`prof:${teacher.username.toLowerCase()}`]);
  assert.equal((await login(teacher.password)).headers.location, "/dashboard");

  const student = context.student;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await agent.post(`/student/${student.token}/login`).type("form").send({ username: student.username, password: "x" });
  }
  const blocked = await agent.post(`/student/${student.token}/login`).type("form").send({ username: student.username, password: student.password });
  assert.match(blocked.headers.location, /error=blocked/);
  context.close();
});

test("Seguranca: senha do professor fica com hash, confere e nao e regravada sem necessidade", () => {
  const context = fixture();
  const stored = context.store.db.prepare("SELECT password FROM professors WHERE id = ?").get(teacher.id).password;
  assert.equal(isPasswordHash(stored), true);
  assert.notEqual(stored, teacher.password);
  assert.equal(verifyPassword(teacher.password, stored), true);
  assert.equal(verifyPassword(`${teacher.password}x`, stored), false);
  assert.equal(resolveStoredPassword(teacher.password, stored), stored);
  const other = hashPassword("outra-senha");
  assert.notEqual(resolveStoredPassword(teacher.password, other), other);
  assert.equal(verifyPassword("legado", "legado"), true);
  const freshHash = hashPassword("senha-de-outro-processo");
  assert.equal(resolveStoredPassword("senha-de-outro-processo", freshHash), freshHash, "hash valido e mantido");
  context.close();
});

test("Seguranca: cabecalhos de protecao e POST de outro site recusado", async () => {
  const context = fixture();
  const response = await request(context.app).get("/");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["referrer-policy"], "same-origin");
  assert.equal(response.headers["x-powered-by"], undefined);

  const crossSite = await request(context.app).post("/login").set("Origin", "https://site-malicioso.example")
    .type("form").send({ username: teacher.username, password: teacher.password });
  assert.equal(crossSite.status, 403);
  context.close();
});
