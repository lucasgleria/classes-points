const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fc = require("fast-check");
const request = require("supertest");
const { createDatabase } = require("../db");
const { getRuntimeConfig } = require("../config");
const { validatePoints } = require("../validation");
const { verifyProfessor, verifyStudent } = require("../auth");
const { createApp } = require("../app");

const runtimeConfig = getRuntimeConfig();
const teacherAccounts = runtimeConfig.teacherAccounts;

function createTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "points-codex-"));
  return {
    dir,
    filename: path.join(dir, "test.sqlite"),
  };
}

function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function createStoreFixture() {
  const temp = createTempDb();
  const store = createDatabase({ filename: temp.filename });
  return { store, temp };
}

function createClassFixture(store, overrides = {}) {
  return store.createClass(
    {
      book: overrides.book || "Super Minds 1",
      weekday: overrides.weekday || "Sábados",
      startTime: overrides.startTime || "10h45",
      endTime: overrides.endTime || "12h45",
    },
    overrides.professorId ? { professorId: overrides.professorId } : {}
  );
}

test("Feature: english-class-points, Property 1: credenciais invalidas sao sempre rejeitadas", async () => {
  const { store, temp } = createStoreFixture();
  const validStudent = store.createStudent("Ana");

  await fc.assert(
    fc.asyncProperty(
      fc.string(),
      fc.string(),
      fc.string().filter((value) => value !== validStudent.username),
      fc.string().filter((value) => value !== validStudent.password),
      async (profUser, profPassword, studentUser, studentPassword) => {
        fc.pre(
          !teacherAccounts.some(
            (account) => account.username === profUser && account.password === profPassword
          )
        );
        assert.equal(await verifyProfessor(store, profUser, profPassword), null);
        assert.equal(await verifyStudent(store, validStudent.token, studentUser, studentPassword), null);
      }
    ),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 2: dashboard ordenado por pontuacao decrescente", async () => {
  const { store, temp } = createStoreFixture();

  await fc.assert(
    fc.asyncProperty(fc.uniqueArray(fc.integer({ min: -100, max: 100 }), { minLength: 1, maxLength: 12 }), async (totals) => {
      totals.forEach((total, index) => {
        const student = store.createStudent(`Aluno ${index}`);
        if (total !== 0) {
          store.addPoints(student.id, total > 0 ? "games" : "bad_behavior", Math.abs(total), total > 0 ? "" : "nota");
        }
      });

      const listedTotals = store.getAllStudents().map((student) => student.total_points);
      const expected = [...listedTotals].sort((a, b) => b - a);
      assert.deepEqual(listedTotals, expected);

      store.db.exec("DELETE FROM point_transactions; DELETE FROM students;");
    }),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 3: totais por aluno sao calculados corretamente", async () => {
  const { store, temp } = createStoreFixture();

  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          category: fc.constantFrom("homework", "games", "challenges", "presence", "bad_behavior"),
          points: fc.integer({ min: 1, max: 100 }),
          note: fc.string(),
        }),
        { minLength: 1, maxLength: 30 }
      ),
      async (entries) => {
        const student = store.createStudent("Aluno Totais");
        const expected = {
          homework: 0,
          games: 0,
          challenges: 0,
          presence: 0,
          bad_behavior: 0,
          total: 0,
        };

        for (const entry of entries) {
          try {
            const note = entry.category === "bad_behavior" ? entry.note || "motivo" : null;
            const tx = store.addPoints(student.id, entry.category, entry.points, note);
            expected[tx.category] += tx.points;
            expected.total += tx.points;
          } catch {}
        }

        assert.deepEqual(store.getStudentTotals(student.id), expected);
        store.db.exec("DELETE FROM point_transactions; DELETE FROM students;");
      }
    ),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 4: criacao de aluno inicializa com pontuacao zero", async () => {
  const { store, temp } = createStoreFixture();

  await fc.assert(
    fc.asyncProperty(fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0), async (name) => {
      const student = store.createStudent(name);
      assert.equal(store.getStudentTotals(student.id).total, 0);
      store.db.exec("DELETE FROM students;");
    }),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 5: nome vazio ou so espacos e rejeitado", async () => {
  const { store, temp } = createStoreFixture();

  await fc.assert(
    fc.asyncProperty(fc.string().filter((value) => value.trim().length === 0), async (name) => {
      assert.throws(() => store.createStudent(name), /Nome do aluno/);
    }),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 6: round trip de persistencia de aluno", async () => {
  const { store, temp } = createStoreFixture();

  await fc.assert(
    fc.asyncProperty(fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0), async (name) => {
      const student = store.createStudent(name);
      const fetched = store.getStudentByToken(student.token);
      assert.equal(fetched.name, student.name.trim());
      assert.equal(fetched.token, student.token);
      assert.equal(fetched.username, student.username);
      store.db.exec("DELETE FROM students;");
    }),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 7: validacao de intervalo para games e challenges", async () => {
  await fc.assert(
    fc.asyncProperty(fc.constantFrom("games", "challenges"), fc.integer({ min: -200, max: 200 }), async (category, points) => {
      if (points >= 1 && points <= 100) {
        const result = validatePoints(category, points, "");
        assert.equal(result.points, points);
      } else {
        assert.throws(() => validatePoints(category, points, ""));
      }
    }),
    { numRuns: 100 }
  );
});

test("Feature: english-class-points, Property 8: bad behavior exige justificativa e intervalo valido", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: -200, max: 200 }), fc.string(), async (points, note) => {
      if (points >= 1 && points <= 100 && note.trim()) {
        const result = validatePoints("bad_behavior", points, note);
        assert.equal(result.points, -points);
        assert.equal(result.note, note.trim());
      } else {
        assert.throws(() => validatePoints("bad_behavior", points, note));
      }
    }),
    { numRuns: 100 }
  );
});

test("Feature: english-class-points, Property 9: round trip de persistencia de transacao", async () => {
  const { store, temp } = createStoreFixture();
  const student = store.createStudent("Aluno Historico");

  await fc.assert(
    fc.asyncProperty(fc.record({
      category: fc.constantFrom("homework", "games", "challenges", "presence", "bad_behavior"),
      homeworkPoints: fc.constantFrom(1, 2),
      generalPoints: fc.integer({ min: 1, max: 100 }),
      note: fc.string(),
    }), async ({ category, homeworkPoints, generalPoints, note }) => {
        store.db.exec("DELETE FROM point_transactions;");
        const points = category === "homework" ? homeworkPoints : generalPoints;
        const payloadNote = category === "bad_behavior" ? note.trim() || "motivo" : null;
        const transaction = store.addPoints(student.id, category, points, payloadNote);
        const history = store.getStudentHistory(student.id);
        assert.equal(history[0].id, transaction.id);
        assert.equal(history[0].category, transaction.category);
        assert.equal(history[0].points, transaction.points);
      }),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 10: historico em ordem cronologica decrescente", async () => {
  const { store, temp } = createStoreFixture();
  const student = store.createStudent("Aluno Ordem");

  await fc.assert(
    fc.asyncProperty(fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 20 }), async (values) => {
      store.db.exec("DELETE FROM point_transactions;");
      values.forEach((value) => {
        store.addPoints(student.id, "games", value, null);
      });
      const history = store.getStudentHistory(student.id);
      for (let index = 1; index < history.length; index += 1) {
        assert.ok(history[index - 1].id > history[index].id);
      }
    }),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 11: isolamento de dados entre alunos", async () => {
  const temp = createTempDb();
  const store = createDatabase({ filename: temp.filename });
  const firstStudent = store.createStudent("Alice");
  const secondStudent = store.createStudent("Bob");
  store.addPoints(firstStudent.id, "games", 10, null);
  store.addPoints(secondStudent.id, "bad_behavior", 4, "Conversa paralela");
  const { app } = createApp({ store, sessionSecret: "test-secret" });

  await fc.assert(
    fc.asyncProperty(fc.boolean(), async (useWrongToken) => {
      const agent = request.agent(app);
      await agent
        .post(`/student/${firstStudent.token}/login`)
        .type("form")
        .send({ username: firstStudent.username, password: firstStudent.password })
        .expect(302);

      const targetToken = useWrongToken ? secondStudent.token : firstStudent.token;
      const response = await agent.get(`/student/${targetToken}/view`);
      if (useWrongToken) {
        assert.equal(response.status, 403);
      } else {
        assert.equal(response.status, 200);
        assert.match(response.text, /Alice/);
        assert.doesNotMatch(response.text, /Bob/);
      }
    }),
    { numRuns: 100 }
  );

  store.close();
  cleanupDir(temp.dir);
});

test("Professor permanece autenticado entre instancias diferentes do app", async () => {
  const { store, temp } = createStoreFixture();
  const firstApp = createApp({ store, sessionSecret: "test-secret" }).app;

  const loginResponse = await request(firstApp)
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  const authCookie = loginResponse.headers["set-cookie"];
  assert.ok(Array.isArray(authCookie));
  assert.match(authCookie[0], /points-codex\.auth=/);

  const secondApp = createApp({ store, sessionSecret: "test-secret" }).app;
  const page = await request(secondApp)
    .get("/dashboard")
    .set("Cookie", authCookie)
    .expect(200);

  assert.match(page.text, /Rankings por turma/);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor acessa guia do sistema pelo painel lateral", async () => {
  const { store, temp } = createStoreFixture();
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await request(app).get("/guide").expect(302).expect("Location", "/");

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  const page = await agent.get("/guide").expect(200);
  assert.match(page.text, /Guia do sistema/);
  assert.match(page.text, /Dashboard/);
  assert.match(page.text, /Cadastros/);
  assert.match(page.text, /Pontuacao/);
  assert.match(page.text, /Visualizacoes/);
  assert.match(page.text, /Minhas Turmas/);
  assert.match(page.text, /Meus alunos/);
  assert.match(page.text, /href="\/guide">Guia/);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor visualiza turmas em aba separada dos cadastros", async () => {
  const { store, temp } = createStoreFixture();
  createClassFixture(store, { book: "Super Minds 4" });
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  const addPage = await agent.get("/add").expect(200);
  assert.match(addPage.text, /Nova turma/);
  assert.match(addPage.text, /Novo aluno/);
  assert.match(addPage.text, /Importar lista de alunos/);
  assert.match(addPage.text, /Mover turma completa/);
  assert.ok(addPage.text.indexOf("Importar lista de alunos") > addPage.text.indexOf("Novo aluno"));
  assert.doesNotMatch(addPage.text, /Salvar turma/);

  const classesPage = await agent.get("/classes").expect(200);
  assert.match(classesPage.text, /Minhas Turmas/);
  assert.match(classesPage.text, /Super Minds 4/);
  assert.match(classesPage.text, /Salvar turma/);
  assert.match(classesPage.text, /href="\/classes">Minhas Turmas/);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor cria e edita ficha de desempenho individual sem expor ao aluno", async () => {
  const { store, temp } = createStoreFixture();
  const classroom = createClassFixture(store);
  const student = store.createStudent("Sofia", { classId: classroom.id });
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const professorAgent = request.agent(app);
  const studentAgent = request.agent(app);

  await request(app).get(`/students/${student.id}/performance`).expect(302).expect("Location", "/");

  await studentAgent
    .post(`/student/${student.token}/login`)
    .type("form")
    .send({ username: student.username, password: student.password })
    .expect(302);
  await studentAgent.get(`/students/${student.id}/performance`).expect(302).expect("Location", "/");

  await professorAgent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  const dashboard = await professorAgent.get("/dashboard").expect(200);
  assert.doesNotMatch(dashboard.text, /href="\/students\/\d+\/performance">Ficha/);

  const myStudents = await professorAgent.get("/my-students").expect(200);
  assert.match(myStudents.text, /Meus alunos/);
  assert.match(myStudents.text, new RegExp(`href="/students/${student.id}/details">Detalhes`));
  assert.match(myStudents.text, new RegExp(`href="/students/${student.id}/performance">Ficha`));

  store.addPoints(student.id, "games", 12, null);
  store.addPoints(student.id, "bad_behavior", 3, "Conversa durante a atividade.");
  const assessment = store.createAssessment(classroom.id, {
    title: "Avaliacao Unit 1",
    description: "Speaking and writing",
  });
  store.saveAssessmentGrades(assessment.id, [
    { studentId: student.id, status: "graded", otScore: "9,00", wtScore: "8,00" },
  ]);

  const detailsPage = await professorAgent.get(`/students/${student.id}/details`).expect(200);
  assert.match(detailsPage.text, /Detalhes do aluno/);
  assert.match(detailsPage.text, /Senha/);
  assert.match(detailsPage.text, new RegExp(`/student/${student.token}`));
  assert.match(detailsPage.text, /Notas de provas/);
  assert.match(detailsPage.text, /Avaliacoes do aluno/);
  assert.match(detailsPage.text, /Avaliacao Unit 1/);
  assert.match(detailsPage.text, /Speaking and writing/);
  assert.match(detailsPage.text, /9,00/);
  assert.match(detailsPage.text, /8,00/);
  assert.match(detailsPage.text, /8,50/);
  assert.match(detailsPage.text, /Resumo de pontos/);
  assert.match(detailsPage.text, /Historico completo/);
  assert.match(detailsPage.text, /Games/);
  assert.match(detailsPage.text, /\+12 pts/);
  assert.match(detailsPage.text, /Bad Behavior/);
  assert.match(detailsPage.text, /-3 pts/);
  assert.match(detailsPage.text, /Conversa durante a atividade/);
  assert.doesNotMatch(detailsPage.text, /Avaliacao do professor/);

  const emptyPage = await professorAgent.get(`/students/${student.id}/performance`).expect(200);
  assert.match(emptyPage.text, /Ficha de Desempenho/);
  assert.match(emptyPage.text, /Avaliacao do professor/);
  assert.match(emptyPage.text, /Participa&ccedil;&atilde;o/);
  assert.doesNotMatch(emptyPage.text, /Historico completo/);

  await professorAgent
    .post(`/students/${student.id}/performance`)
    .type("form")
    .send({
      participation: "otimo",
      grammarVocabulary: "bom",
      homework: "precisa_melhorar",
      behavior: "bom",
      comments: "Precisa revisar tarefas antes da aula.",
    })
    .expect(302);

  const profile = store.getStudentPerformanceProfile(student.id);
  assert.equal(profile.participation, "otimo");
  assert.equal(profile.homework, "precisa_melhorar");
  assert.equal(profile.comments, "Precisa revisar tarefas antes da aula.");

  const studentView = await studentAgent.get(`/student/${student.token}/view`).expect(200);
  assert.doesNotMatch(studentView.text, /Ficha de Desempenho/);
  assert.doesNotMatch(studentView.text, /Precisa revisar tarefas/);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor consegue criar turma e aluno usando cookie em nova instancia", async () => {
  const { store, temp } = createStoreFixture();
  const loginApp = createApp({ store, sessionSecret: "test-secret" }).app;

  const loginResponse = await request(loginApp)
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  const authCookie = loginResponse.headers["set-cookie"];
  const classApp = createApp({ store, sessionSecret: "test-secret" }).app;

  await request(classApp)
    .post("/api/classes")
    .set("Cookie", authCookie)
    .type("form")
    .send({
      book: "Super Minds 2",
      weekday: "Segunda-feira",
      startTime: "18h00",
      endTime: "19h00",
    })
    .expect(302);

  const classroom = store.getAllClasses()[0];
  assert.equal(classroom.book, "Super Minds 2");

  const studentApp = createApp({ store, sessionSecret: "test-secret" }).app;
  await request(studentApp)
    .post("/api/students")
    .set("Cookie", authCookie)
    .type("form")
    .send({
      name: "Aluno Mobile",
      classId: String(classroom.id),
    })
    .expect(302);

  const [student] = store.getAllStudents();
  assert.equal(student.name, "Aluno Mobile");
  assert.equal(student.class_id, classroom.id);

  store.close();
  cleanupDir(temp.dir);
});

test("Rosana consegue autenticar com as credenciais dedicadas", async () => {
  const { store, temp } = createStoreFixture();
  const { app } = createApp({ store, sessionSecret: "test-secret" });

  await request(app)
    .post("/login")
    .type("form")
    .send({ username: "Rosana", password: "Rosa123" })
    .expect(302)
    .expect("Location", "/dashboard");

  assert.ok(await verifyProfessor(store, "Rosana", "Rosa123"));

  store.close();
  cleanupDir(temp.dir);
});

test("Aluno permanece autenticado entre instancias diferentes do app", async () => {
  const { store, temp } = createStoreFixture();
  const classroom = createClassFixture(store);
  const student = store.createStudent("Julia", { classId: classroom.id });
  const loginApp = createApp({ store, sessionSecret: "test-secret" }).app;

  const loginResponse = await request(loginApp)
    .post(`/student/${student.token}/login`)
    .type("form")
    .send({ username: student.username, password: student.password })
    .expect(302);

  const authCookie = loginResponse.headers["set-cookie"];
  const viewApp = createApp({ store, sessionSecret: "test-secret" }).app;
  const page = await request(viewApp)
    .get(`/student/${student.token}/view`)
    .set("Cookie", authCookie)
    .expect(200);

  assert.match(page.text, /Julia/);

  store.close();
  cleanupDir(temp.dir);
});

test("Feature: english-class-points, Property 12: persistencia sobrevive a reinicio", async () => {
  const temp = createTempDb();

  await fc.assert(
    fc.asyncProperty(fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0), fc.integer({ min: 1, max: 100 }), async (name, points) => {
      const firstStore = createDatabase({ filename: temp.filename });
      firstStore.db.exec("DELETE FROM point_transactions; DELETE FROM students;");
      const student = firstStore.createStudent(name);
      firstStore.addPoints(student.id, "games", points, null);
      const token = student.token;
      firstStore.close();

      const secondStore = createDatabase({ filename: temp.filename });
      const fetched = secondStore.getStudentByToken(token);
      assert.equal(fetched.name, name.trim());
      assert.equal(secondStore.getStudentTotals(fetched.id).total, points);
      secondStore.close();
    }),
    { numRuns: 100 }
  );

  cleanupDir(temp.dir);
});

test("Professor pode editar URL, login e senha do aluno em visualizacoes", async () => {
  const { store, temp } = createStoreFixture();
  const classroom = createClassFixture(store);
  const student = store.createStudent("Carla", { classId: classroom.id });
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  await agent
    .post(`/api/students/${student.id}/update`)
    .type("form")
    .send({
      name: "Carla Souza",
      classId: String(classroom.id),
      username: "carla.souza",
      password: "nova123",
      token: "carla-souza-2026",
    })
    .expect(302);

  const updatedStudent = store.getStudentByToken("carla-souza-2026");
  assert.equal(updatedStudent.name, "Carla Souza");
  assert.equal(updatedStudent.username, "carla.souza");
  assert.equal(updatedStudent.password, "nova123");
  assert.equal(store.getStudentByToken(student.token), undefined);
  assert.ok(await verifyStudent(store, "carla-souza-2026", "carla.souza", "nova123"));

  const page = await agent.get("/visualizations").expect(200);
  assert.match(page.text, /Visualizações/);
  assert.match(page.text, /carla-souza-2026/);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor visualiza dashboard agrupado por turma", async () => {
  const { store, temp } = createStoreFixture();
  const classA = createClassFixture(store, { book: "Super Minds 1" });
  const classB = createClassFixture(store, { book: "Guess What 2", startTime: "13h00", endTime: "15h00" });
  store.createStudent("Ana", { classId: classA.id });
  store.createStudent("Bruno", { classId: classB.id });

  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  const page = await agent.get("/dashboard").expect(200);
  assert.match(page.text, /Super Minds 1/);
  assert.match(page.text, /Guess What 2/);
  assert.match(page.text, /Rankings por turma/);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor pode lançar a mesma categoria para vários alunos de uma vez", async () => {
  const { store, temp } = createStoreFixture();
  const classroom = createClassFixture(store);
  const firstStudent = store.createStudent("Ana", { classId: classroom.id });
  const secondStudent = store.createStudent("Bruno", { classId: classroom.id });
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  await agent
    .post("/api/points")
    .type("form")
    .send({
      studentIds: [String(firstStudent.id), String(secondStudent.id)],
      category: "presence",
      points: "1",
      note: "",
    })
    .expect(302);

  assert.equal(store.getStudentTotals(firstStudent.id).presence, 1);
  assert.equal(store.getStudentTotals(secondStudent.id).presence, 1);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor pode excluir aluno e apagar histórico associado", async () => {
  const { store, temp } = createStoreFixture();
  const classroom = createClassFixture(store);
  const student = store.createStudent("Marina", { classId: classroom.id });
  store.addPoints(student.id, "games", 10, null);
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  await agent
    .post(`/api/students/${student.id}/delete`)
    .type("form")
    .send({})
    .expect(302);

  assert.equal(store.getStudentById(student.id), undefined);
  assert.deepEqual(store.getStudentHistory(student.id), []);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor pode importar alunos em massa e mover alunos entre turmas", async () => {
  const { store, temp } = createStoreFixture();
  const classA = createClassFixture(store, { book: "Super Minds 1" });
  const classB = createClassFixture(store, { book: "Guess What 2", startTime: "13h00", endTime: "15h00" });
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  await agent
    .post("/api/students/import")
    .type("form")
    .send({
      classId: String(classA.id),
      names: "Ana\nBruno, Carla",
    })
    .expect(302);

  const imported = store.getAllStudents();
  assert.equal(imported.length, 3);
  assert.ok(imported.every((student) => student.class_id === classA.id));

  await agent
    .post("/api/students/move")
    .type("form")
    .send({
      studentIds: [String(imported[0].id), String(imported[1].id)],
      classId: String(classB.id),
    })
    .expect(302);

  assert.equal(store.getStudentById(imported[0].id).class_id, classB.id);
  assert.equal(store.getStudentById(imported[1].id).class_id, classB.id);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor pode mover turma completa para outra turma", async () => {
  const { store, temp } = createStoreFixture();
  const classA = createClassFixture(store, { book: "Super Minds 1" });
  const classB = createClassFixture(store, { book: "Super Minds 2", startTime: "13h00", endTime: "15h00" });
  const firstStudent = store.createStudent("Ana", { classId: classA.id });
  const secondStudent = store.createStudent("Bruno", { classId: classA.id });
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  await agent
    .post("/api/classes/move-students")
    .type("form")
    .send({
      fromClassId: String(classA.id),
      toClassId: String(classB.id),
    })
    .expect(302)
    .expect("Location", /\/add\?message=/);

  assert.equal(store.getStudentById(firstStudent.id).class_id, classB.id);
  assert.equal(store.getStudentById(secondStudent.id).class_id, classB.id);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor pode desfazer o ultimo lancamento em lote", async () => {
  const { store, temp } = createStoreFixture();
  const classroom = createClassFixture(store);
  const firstStudent = store.createStudent("Ana", { classId: classroom.id });
  const secondStudent = store.createStudent("Bruno", { classId: classroom.id });
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  await agent
    .post("/api/points")
    .type("form")
    .send({
      classId: String(classroom.id),
      studentIds: [String(firstStudent.id), String(secondStudent.id)],
      category: "presence",
      points: "1",
      note: "",
    })
    .expect(302);

  assert.equal(store.getStudentTotals(firstStudent.id).presence, 1);
  assert.equal(store.getStudentTotals(secondStudent.id).presence, 1);

  await agent.post("/api/points/undo").type("form").send({}).expect(302);

  assert.equal(store.getStudentTotals(firstStudent.id).presence, 0);
  assert.equal(store.getStudentTotals(secondStudent.id).presence, 0);

  store.close();
  cleanupDir(temp.dir);
});

test("Professor pode editar, arquivar e apagar turmas vazias", async () => {
  const { store, temp } = createStoreFixture();
  const classroom = createClassFixture(store);
  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const agent = request.agent(app);

  await agent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  await agent
    .post(`/api/classes/${classroom.id}/update`)
    .type("form")
    .send({
      book: "Super Minds 3",
      weekday: "Terca-feira",
      startTime: "15h00",
      endTime: "16h00",
    })
    .expect(302)
    .expect("Location", /\/classes\?message=/);

  assert.equal(store.getClassById(classroom.id).book, "Super Minds 3");

  await agent
    .post(`/api/classes/${classroom.id}/archive`)
    .type("form")
    .send({})
    .expect(302)
    .expect("Location", /\/classes\?message=/);
  assert.equal(store.getAllClasses().some((item) => item.id === classroom.id), false);

  const emptyClass = createClassFixture(store, { book: "Empty Class", startTime: "17h00", endTime: "18h00" });
  await agent
    .post(`/api/classes/${emptyClass.id}/delete`)
    .type("form")
    .send({})
    .expect(302)
    .expect("Location", /\/classes\?message=/);
  assert.equal(store.getClassById(emptyClass.id), undefined);

  store.close();
  cleanupDir(temp.dir);
});

test("Professores enxergam somente as proprias turmas e alunos", async () => {
  const { store, temp } = createStoreFixture();
  const classLucas = createClassFixture(store, { book: "Super Minds 1", professorId: 1 });
  const classRosana = createClassFixture(store, {
    book: "Guess What 2",
    weekday: "Segunda-feira",
    startTime: "14h00",
    endTime: "15h00",
    professorId: 2,
  });
  const studentLucas = store.createStudent("Ana Lucas", { classId: classLucas.id });
  const studentRosana = store.createStudent("Bia Rosana", { classId: classRosana.id });
  store.addPoints(studentLucas.id, "games", 10, null);
  store.addPoints(studentRosana.id, "presence", 1, null);

  const { app } = createApp({ store, sessionSecret: "test-secret" });
  const lucasAgent = request.agent(app);
  const rosanaAgent = request.agent(app);

  await lucasAgent
    .post("/login")
    .type("form")
    .send({ username: runtimeConfig.teacherUsername, password: runtimeConfig.teacherPassword })
    .expect(302);

  await rosanaAgent
    .post("/login")
    .type("form")
    .send({ username: "Rosana", password: "Rosa123" })
    .expect(302);

  const lucasDashboard = await lucasAgent.get("/dashboard").expect(200);
  assert.match(lucasDashboard.text, /Ana Lucas/);
  assert.doesNotMatch(lucasDashboard.text, /Bia Rosana/);

  const rosanaDashboard = await rosanaAgent.get("/dashboard").expect(200);
  assert.match(rosanaDashboard.text, /Bia Rosana/);
  assert.doesNotMatch(rosanaDashboard.text, /Ana Lucas/);

  const rosanaStudents = await rosanaAgent.get("/api/students").expect(200);
  assert.equal(rosanaStudents.body.length, 1);
  assert.equal(rosanaStudents.body[0].id, studentRosana.id);

  await rosanaAgent
    .post("/api/points")
    .type("form")
    .send({
      classId: String(classLucas.id),
      studentIds: [String(studentLucas.id)],
      category: "presence",
      points: "1",
      note: "",
    })
    .expect(302)
    .expect("Location", /error=/);

  assert.equal(store.getStudentTotals(studentLucas.id).presence, 0);

  const hiddenHistory = await rosanaAgent.get(`/api/students/${studentLucas.id}/history`).expect(404);
  assert.equal(hiddenHistory.body.error, "Aluno nao encontrado.");
  await rosanaAgent.get(`/students/${studentLucas.id}/details`).expect(404);
  await rosanaAgent.get(`/students/${studentLucas.id}/performance`).expect(404);

  await rosanaAgent
    .post(`/students/${studentLucas.id}/performance`)
    .type("form")
    .send({
      participation: "otimo",
      grammarVocabulary: "otimo",
      homework: "otimo",
      behavior: "otimo",
      comments: "Tentativa indevida.",
    })
    .expect(404);
  assert.equal(store.getStudentPerformanceProfile(studentLucas.id).comments, "");

  store.close();
  cleanupDir(temp.dir);
});
