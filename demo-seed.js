// Banco de demonstracao do modo visitante: SQLite em memoria com dados ficticios.
// Fica totalmente separado do banco real; o visitante nunca le nem escreve no Postgres.
const crypto = require("node:crypto");
const { createSqliteStore } = require("./db-sqlite");

const DEMO_PROFESSOR_ID = 1;

const CLASSES = [
  {
    fields: { book: "Super Minds 2", weekday: "Sabados", startTime: "09h00", endTime: "10h30" },
    students: ["Ana Beatriz Souza", "Bruno Carvalho", "Camila Ribeiro", "Davi Martins", "Eduarda Lima", "Felipe Rocha", "Giovana Alves", "Heitor Gomes"],
  },
  {
    fields: { book: "Kid's Box 4", weekday: "Quartas", startTime: "14h00", endTime: "15h30" },
    students: ["Isabela Costa", "Joao Pedro Nunes", "Laura Mendes", "Lucas Teixeira", "Manuela Pires", "Miguel Barbosa", "Sofia Araujo"],
  },
  {
    fields: { book: "Teens English 1", weekday: "Sextas", startTime: "18h00", endTime: "19h30" },
    students: ["Arthur Fernandes", "Beatriz Moreira", "Gabriel Cardoso", "Julia Ramos", "Rafael Dias", "Valentina Castro", "Vinicius Monteiro", "Yasmin Freitas"],
  },
];

const ARCHIVED_CLASS = {
  fields: { book: "Super Minds 1", weekday: "Sabados", startTime: "11h00", endTime: "12h30" },
  students: ["Clara Duarte", "Enzo Batista", "Helena Lopes"],
};

const ORAL_QUESTIONS = [
  "What's your name?|My name is ...|1",
  "How old are you?|I'm ... years old.|1",
  "What's your favourite colour? Why?|My favourite colour is ... because ...|2",
  "Describe your family.|There are ... people in my family ...|3",
  "What do you do on weekends?|On weekends I ...|3",
].join("\n");

// Gerador deterministico: os dados de demonstracao sao sempre os mesmos.
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function backdateLatestBatch(store, daysAgo) {
  store.db.prepare(`
    UPDATE point_transactions
    SET created_at = datetime('now', ?)
    WHERE batch_id = (SELECT batch_id FROM point_transactions ORDER BY id DESC LIMIT 1)
  `).run(`-${daysAgo} days`);
}

function seedPoints(store, random, students) {
  const ids = students.map((student) => student.id);
  for (let week = 6; week >= 1; week -= 1) {
    const day = week * 7;
    const present = ids.filter(() => random() > 0.12);
    store.addPointsBulk(present, "presence", 1, "");
    backdateLatestBatch(store, day);
    const homework = present.filter(() => random() > 0.3);
    if (homework.length) {
      store.addPointsBulk(homework, "homework", random() > 0.5 ? 2 : 1, "");
      backdateLatestBatch(store, day - 1);
    }
    const winners = present.filter(() => random() > 0.5);
    if (winners.length) {
      store.addPointsBulk(winners, pick(random, ["games", "challenges"]), pick(random, [5, 10, 15, 20]), "");
      backdateLatestBatch(store, day - 2);
    }
    if (random() > 0.6) {
      store.addPointsBulk([pick(random, ids)], "bad_behavior", 5, pick(random, [
        "Conversa durante a explicacao",
        "Uso do celular em sala",
        "Nao respeitou a vez do colega",
      ]));
      backdateLatestBatch(store, day - 3);
    }
  }
}

function score(random, min, max) {
  return (min + random() * (max - min)).toFixed(1).replace(".", ",");
}

function seedPublishedAssessment(store, random, classroom, students, { title, description, assessmentDate, oralTemplateId }) {
  const assessment = store.createAssessment(classroom.id, { title, description, assessmentDate, countsForRanking: "on" });
  let oralTest = null;
  if (oralTemplateId) {
    oralTest = store.attachOralTemplateToAssessment(assessment.id, oralTemplateId, DEMO_PROFESSOR_ID);
  }

  const grades = students.map((student, index) => {
    if (index === students.length - 1) {
      return { studentId: student.id, status: "absent" };
    }
    if (index === students.length - 2 && students.length > 6) {
      return { studentId: student.id, status: "exempt", teacherNote: "Atestado medico" };
    }
    return { studentId: student.id, status: "graded", otScore: score(random, 6.5, 10), wtScore: score(random, 6, 10) };
  });

  if (oralTest) {
    for (const grade of grades.filter((item) => item.status === "graded")) {
      const answers = oralTest.questions.map((question) => ({
        questionId: question.id,
        result: pick(random, ["correct", "correct", "correct", "half", "wrong"]),
      }));
      store.completeOralAttempt(oralTest.id, grade.studentId, answers, {
        professorId: DEMO_PROFESSOR_ID,
        observation: pick(random, ["Boa pronuncia", "Respondeu com confianca", "Precisa ampliar o vocabulario", ""]),
      });
    }
  }

  store.saveAssessmentGrades(assessment.id, grades, { professorId: DEMO_PROFESSOR_ID });
  for (const grade of grades.filter((item) => item.status === "graded")) {
    store.updateAssessmentPerformanceReport(assessment.id, grade.studentId, {
      participation: pick(random, ["otimo", "bom", "bom"]),
      grammarVocabulary: pick(random, ["otimo", "bom", "precisa_melhorar"]),
      homework: pick(random, ["otimo", "bom", "bom", "precisa_melhorar"]),
      behavior: pick(random, ["otimo", "otimo", "bom"]),
      comments: pick(random, [
        "Participa ativamente das atividades e ajuda os colegas.",
        "Evoluiu bastante na leitura em voz alta neste bimestre.",
        "Pode se dedicar mais as tarefas de casa.",
        "Otima compreensao oral; seguir praticando a escrita.",
      ]),
    }, { professorId: DEMO_PROFESSOR_ID });
  }
  store.publishAssessment(assessment.id);
  return assessment;
}

function createDemoStore() {
  const store = createSqliteStore({
    filename: ":memory:",
    teacherAccounts: [
      {
        id: DEMO_PROFESSOR_ID,
        username: "visitante",
        // Senha aleatoria e descartada: o visitante entra pelo botao, nunca pelo formulario.
        password: crypto.randomBytes(24).toString("hex"),
        displayName: "Professor(a) Visitante",
      },
    ],
  });
  const random = createRandom(20261115);
  const oralTemplate = store.createOralTestTemplate(DEMO_PROFESSOR_ID, {
    title: "Oral Test - Units 1 e 2",
    description: "Perguntas pessoais e descricao da rotina.",
    questionsText: ORAL_QUESTIONS,
  });
  store.createOralTestTemplate(DEMO_PROFESSOR_ID, {
    title: "Oral Test - Units 3 e 4",
    description: "Comida, lugares e passado simples.",
    questionsText: "What did you eat yesterday?|Yesterday I ate ...|2\nWhere do you live?|I live in ...|1\nTell me about your last holiday.|Last holiday I ...|3",
  });

  CLASSES.forEach((definition, index) => {
    const classroom = store.createClass(definition.fields, { professorId: DEMO_PROFESSOR_ID });
    const students = store.importStudents(definition.students.join("\n"), { classId: classroom.id });
    seedPoints(store, random, students);
    seedPublishedAssessment(store, random, classroom, students, {
      title: "Avaliacao 1 - Units 1 e 2",
      description: "Vocabulario de familia, cores e rotina.",
      assessmentDate: "2026-09-26",
      oralTemplateId: index === 0 ? oralTemplate.id : null,
    });
    if (index === 0) {
      const draft = store.createAssessment(classroom.id, {
        title: "Avaliacao 2 - Units 3 e 4",
        description: "Em andamento: notas sendo lancadas.",
        assessmentDate: "2026-11-21",
        countsForRanking: "on",
      });
      store.saveAssessmentGrades(draft.id, students.map((student, position) => (
        position < 3
          ? { studentId: student.id, status: "graded", otScore: score(random, 7, 10), wtScore: score(random, 7, 10) }
          : { studentId: student.id, status: "pending" }
      )), { professorId: DEMO_PROFESSOR_ID });
    }
  });

  const archived = store.createClass(ARCHIVED_CLASS.fields, { professorId: DEMO_PROFESSOR_ID });
  const archivedStudents = store.importStudents(ARCHIVED_CLASS.students.join("\n"), { classId: archived.id });
  seedPoints(store, random, archivedStudents);
  seedPublishedAssessment(store, random, archived, archivedStudents, {
    title: "Avaliacao final - Semestre 1",
    description: "Turma encerrada no semestre anterior.",
    assessmentDate: "2026-06-27",
  });
  store.archiveClass(archived.id);

  return store;
}

let demoStore = null;

// Criado so no primeiro acesso de visitante, para nao pesar no cold start dos professores.
function getDemoStore() {
  demoStore = demoStore || createDemoStore();
  return demoStore;
}

module.exports = {
  DEMO_PROFESSOR_ID,
  createDemoStore,
  getDemoStore,
};
