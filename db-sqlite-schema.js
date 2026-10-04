const fs = require("node:fs");
const path = require("node:path");

function ensureDirectory(filename) {
  if (filename === ":memory:") {
    return;
  }

  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initializeSqliteSchema(db, options) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS professors (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      display_name TEXT
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL,
      weekday TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      professor_id INTEGER REFERENCES professors(id),
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(book, weekday, start_time, end_time)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      category TEXT NOT NULL CHECK(category IN ('homework','games','challenges','presence','bad_behavior')),
      points INTEGER NOT NULL,
      note TEXT,
      batch_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_performance_profiles (
      student_id INTEGER PRIMARY KEY REFERENCES students(id),
      participation TEXT NOT NULL DEFAULT 'bom',
      grammar_vocabulary TEXT NOT NULL DEFAULT 'bom',
      homework TEXT NOT NULL DEFAULT 'bom',
      behavior TEXT NOT NULL DEFAULT 'bom',
      comments TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assessment_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      counts_for_ranking INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_grades (
      assessment_id INTEGER NOT NULL REFERENCES assessments(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','graded','absent','exempt')),
      ot_score INTEGER,
      wt_score INTEGER,
      teacher_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (assessment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_performance_reports (
      assessment_id INTEGER NOT NULL REFERENCES assessments(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      participation TEXT NOT NULL,
      grammar_vocabulary TEXT NOT NULL,
      homework TEXT NOT NULL,
      behavior TEXT NOT NULL,
      comments TEXT NOT NULL DEFAULT '',
      updated_by_professor_id INTEGER REFERENCES professors(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (assessment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_grade_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL REFERENCES assessments(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      old_status TEXT NOT NULL,
      old_ot_score INTEGER,
      old_wt_score INTEGER,
      new_status TEXT NOT NULL,
      new_ot_score INTEGER,
      new_wt_score INTEGER,
      reason TEXT NOT NULL,
      professor_id INTEGER REFERENCES professors(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oral_test_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      professor_id INTEGER NOT NULL REFERENCES professors(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oral_test_template_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES oral_test_templates(id),
      position INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      teacher_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_oral_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL UNIQUE REFERENCES assessments(id),
      source_template_id INTEGER REFERENCES oral_test_templates(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by_professor_id INTEGER REFERENCES professors(id),
      locked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_oral_test_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      oral_test_id INTEGER NOT NULL REFERENCES assessment_oral_tests(id),
      position INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      teacher_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_oral_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      oral_test_id INTEGER NOT NULL REFERENCES assessment_oral_tests(id),
      assessment_id INTEGER NOT NULL REFERENCES assessments(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
      score_hundredths INTEGER,
      observation TEXT NOT NULL DEFAULT '',
      synced_to_ot_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(oral_test_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_oral_answers (
      attempt_id INTEGER NOT NULL REFERENCES assessment_oral_attempts(id),
      question_id INTEGER NOT NULL REFERENCES assessment_oral_test_questions(id),
      result TEXT NOT NULL CHECK(result IN ('correct','half','wrong')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_oral_attempt_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES assessment_oral_attempts(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      old_score_hundredths INTEGER,
      new_score_hundredths INTEGER,
      reason TEXT NOT NULL,
      professor_id INTEGER REFERENCES professors(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const professorColumns = db.prepare("PRAGMA table_info(professors)").all();
  if (!professorColumns.some((column) => column.name === "display_name")) {
    db.exec("ALTER TABLE professors ADD COLUMN display_name TEXT");
  }

  const studentColumns = db.prepare("PRAGMA table_info(students)").all();
  if (!studentColumns.some((column) => column.name === "class_id")) {
    db.exec("ALTER TABLE students ADD COLUMN class_id INTEGER REFERENCES classes(id)");
  }

  const classColumns = db.prepare("PRAGMA table_info(classes)").all();
  if (!classColumns.some((column) => column.name === "professor_id")) {
    db.exec("ALTER TABLE classes ADD COLUMN professor_id INTEGER REFERENCES professors(id)");
  }
  if (!classColumns.some((column) => column.name === "archived_at")) {
    db.exec("ALTER TABLE classes ADD COLUMN archived_at TEXT");
  }

  const transactionColumns = db.prepare("PRAGMA table_info(point_transactions)").all();
  if (!transactionColumns.some((column) => column.name === "batch_id")) {
    db.exec("ALTER TABLE point_transactions ADD COLUMN batch_id TEXT");
  }

  for (const table of ["oral_test_template_questions", "assessment_oral_test_questions"]) {
    const questionColumns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!questionColumns.some((column) => column.name === "weight")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN weight INTEGER NOT NULL DEFAULT 1`);
    }
  }

  const upsertProfessor = db.prepare(`
    INSERT INTO professors (id, username, password, display_name)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      password = excluded.password,
      display_name = excluded.display_name
  `);

  for (const teacher of options.teacherAccounts) {
    upsertProfessor.run(teacher.id, teacher.username, teacher.password, teacher.displayName || teacher.username);
  }

  db.prepare("UPDATE classes SET professor_id = 1 WHERE professor_id IS NULL").run();
}

module.exports = {
  ensureDirectory,
  initializeSqliteSchema,
};
