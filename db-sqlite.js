const Database = require("better-sqlite3");
const { validatePoints } = require("./validation");
const { calculateAcademicSummary } = require("./assessment-common");
const { ensureDirectory, initializeSqliteSchema } = require("./db-sqlite-schema");
const {
  normalizeClassFields,
  normalizeClassId,
  normalizeProfessorId,
} = require("./services/class-domain");
const {
  assertActiveAssessmentClass,
  normalizeAssessmentFields,
} = require("./services/assessment-domain");
const {
  normalizeStudentCredentialFields,
  normalizeStudentName,
  parseStudentNames,
} = require("./services/student-domain");
const {
  normalizeAssessmentPerformanceReport,
  normalizeStudentPerformanceProfile,
} = require("./services/performance-domain");
const {
  prepareAssessmentGradeOperations,
} = require("./services/grade-domain");
const {
  assertOralTemplateOwner,
  prepareOralAttemptSave,
} = require("./services/oral-domain");
const {
  buildStudentTotals,
  normalizeStudentIds,
} = require("./services/points-domain");
const {
  createPassword,
  createToken,
  mapClassRow,
  mapAssessmentGradeRow,
  mapAssessmentOralTestRow,
  mapAssessmentPerformanceReport,
  mapAssessmentRow,
  mapGradeRevision,
  mapOralAnswerRow,
  mapOralAttemptRow,
  mapOralQuestionRow,
  mapOralRosterRow,
  mapOralTestTemplateRow,
  mapPerformanceProfile,
  mapPointTransaction,
  mapProfessorRow,
  mapStudentRow,
  slugifyName,
} = require("./db-common");
const {
  normalizeOralTemplatePayload,
} = require("./oral-test-common");

function createSqliteStore(options) {
  const filename = options.filename;
  ensureDirectory(filename);
  const db = new Database(filename);
  initializeSqliteSchema(db, options);

  function getProfessorById(professorId) {
    return mapProfessorRow(
      db.prepare(`
        SELECT id, username, password, display_name
        FROM professors
        WHERE id = ?
      `).get(professorId)
    );
  }

  function getClassById(classId) {
    return mapClassRow(
      db.prepare(`
        SELECT id, book, weekday, start_time, end_time, professor_id, archived_at, created_at
        FROM classes
        WHERE id = ?
      `).get(classId)
    );
  }

  function getAllClasses(options = {}) {
    return db
      .prepare(`
        SELECT id, book, weekday, start_time, end_time, professor_id, archived_at, created_at
        FROM classes
        ${options.includeArchived ? "" : "WHERE archived_at IS NULL"}
        ORDER BY weekday ASC, start_time ASC, book ASC
      `)
      .all()
      .map(mapClassRow);
  }

  function createClass(fields, options = {}) {
    const normalized = normalizeClassFields(fields);
    const professorId = normalizeProfessorId(options.professorId);
    const professor = getProfessorById(professorId);
    if (!professor) {
      throw new Error("Professor nao encontrado.");
    }

    const existing = db.prepare(`
      SELECT id
      FROM classes
      WHERE book = ? AND weekday = ? AND start_time = ? AND end_time = ?
    `).get(normalized.book, normalized.weekday, normalized.startTime, normalized.endTime);

    if (existing) {
      throw new Error("Esta turma ja existe.");
    }

    const result = db.prepare(`
      INSERT INTO classes (book, weekday, start_time, end_time, professor_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(normalized.book, normalized.weekday, normalized.startTime, normalized.endTime, professorId);

    return getClassById(result.lastInsertRowid);
  }

  function updateClass(classId, fields) {
    const numericId = Number(classId);
    const existing = getClassById(numericId);
    if (!existing) {
      throw new Error("Turma nao encontrada.");
    }

    const normalized = normalizeClassFields({
      book: fields.book ?? existing.book,
      weekday: fields.weekday ?? existing.weekday,
      startTime: fields.startTime ?? existing.start_time,
      endTime: fields.endTime ?? existing.end_time,
    });

    const conflict = db.prepare(`
      SELECT id
      FROM classes
      WHERE book = ? AND weekday = ? AND start_time = ? AND end_time = ? AND id != ?
    `).get(normalized.book, normalized.weekday, normalized.startTime, normalized.endTime, numericId);

    if (conflict) {
      throw new Error("Esta turma ja existe.");
    }

    db.prepare(`
      UPDATE classes
      SET book = ?, weekday = ?, start_time = ?, end_time = ?
      WHERE id = ?
    `).run(normalized.book, normalized.weekday, normalized.startTime, normalized.endTime, numericId);

    return getClassById(numericId);
  }

  function archiveClass(classId) {
    const numericId = Number(classId);
    const existing = getClassById(numericId);
    if (!existing) {
      throw new Error("Turma nao encontrada.");
    }

    db.prepare("UPDATE classes SET archived_at = datetime('now') WHERE id = ?").run(numericId);
    return existing;
  }

  function deleteClass(classId) {
    const numericId = Number(classId);
    const existing = getClassById(numericId);
    if (!existing) {
      throw new Error("Turma nao encontrada.");
    }

    const studentCount = db.prepare("SELECT COUNT(*) AS total FROM students WHERE class_id = ?").get(numericId).total;
    if (studentCount > 0) {
      throw new Error("Mova ou exclua os alunos antes de apagar a turma.");
    }
    const assessmentCount = db.prepare("SELECT COUNT(*) AS total FROM assessments WHERE class_id = ?").get(numericId).total;
    if (assessmentCount > 0) {
      throw new Error("Exclua as avaliacoes antes de apagar a turma.");
    }

    db.prepare("DELETE FROM classes WHERE id = ?").run(numericId);
    return existing;
  }

  function resolveClassId(classId) {
    const numericId = normalizeClassId(classId);
    if (numericId === null) {
      return null;
    }

    const classroom = getClassById(numericId);
    if (!classroom) {
      throw new Error("Turma nao encontrada.");
    }

    return classroom.id;
  }

  function createUniqueUsername(baseName) {
    const base = slugifyName(baseName) || "aluno";
    let candidate = base;
    let suffix = 1;
    const lookup = db.prepare("SELECT id FROM students WHERE username = ?");

    while (lookup.get(candidate)) {
      suffix += 1;
      candidate = `${base}_${suffix}`;
    }

    return candidate;
  }

  function createStudent(name, options = {}) {
    const trimmedName = normalizeStudentName(name);

    const token = createToken();
    const username = createUniqueUsername(trimmedName);
    const password = createPassword();
    const classId = resolveClassId(options.classId);

    const result = db.prepare(`
      INSERT INTO students (name, token, username, password, class_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(trimmedName, token, username, password, classId);

    return getStudentById(result.lastInsertRowid);
  }

  function importStudents(names, options = {}) {
    const classId = resolveClassId(options.classId);
    if (!classId) {
      throw new Error("Turma do aluno e obrigatoria.");
    }

    const parsedNames = parseStudentNames(names);

    const createMany = db.transaction((studentNames) =>
      studentNames.map((name) => createStudent(name, { classId }))
    );

    return createMany(parsedNames);
  }

  function getStudentById(id) {
    return mapStudentRow(
      db.prepare(`
        SELECT
          s.id,
          s.name,
          s.token,
          s.username,
          s.password,
          s.created_at,
          s.class_id,
          c.book AS class_book,
          c.weekday AS class_weekday,
          c.start_time AS class_start_time,
          c.end_time AS class_end_time
        FROM students s
        LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.id = ?
      `).get(id)
    );
  }

  function getStudentByToken(token) {
    return mapStudentRow(
      db.prepare(`
        SELECT
          s.id,
          s.name,
          s.token,
          s.username,
          s.password,
          s.created_at,
          s.class_id,
          c.book AS class_book,
          c.weekday AS class_weekday,
          c.start_time AS class_start_time,
          c.end_time AS class_end_time
        FROM students s
        LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.token = ?
      `).get(token)
    );
  }

  function getStudentByUsernameAndToken(token, username) {
    return mapStudentRow(
      db.prepare(`
        SELECT
          s.id,
          s.name,
          s.token,
          s.username,
          s.password,
          s.created_at,
          s.class_id,
          c.book AS class_book,
          c.weekday AS class_weekday,
          c.start_time AS class_start_time,
          c.end_time AS class_end_time
        FROM students s
        LEFT JOIN classes c ON c.id = s.class_id
        WHERE s.token = ? AND s.username = ?
      `).get(token, username)
    );
  }

  function getProfessorByUsername(username) {
    return mapProfessorRow(
      db.prepare(`
        SELECT id, username, password, display_name
        FROM professors
        WHERE username = ?
      `).get(username)
    );
  }

  function getAllStudents() {
    return db
      .prepare(`
        SELECT
          s.id,
          s.name,
          s.token,
          s.username,
          s.created_at,
          s.class_id,
          c.book AS class_book,
          c.weekday AS class_weekday,
          c.start_time AS class_start_time,
          c.end_time AS class_end_time,
          COALESCE(SUM(pt.points), 0) AS total_points,
          COALESCE(SUM(CASE WHEN datetime(pt.created_at) >= datetime('now', '-7 days') THEN pt.points ELSE 0 END), 0) AS recent_points
        FROM students s
        LEFT JOIN classes c ON c.id = s.class_id
        LEFT JOIN point_transactions pt ON pt.student_id = s.id
        GROUP BY s.id
        ORDER BY
          CASE WHEN c.weekday IS NULL THEN 1 ELSE 0 END,
          c.weekday ASC,
          c.start_time ASC,
          c.book ASC,
          total_points DESC,
          s.name ASC
      `)
      .all()
      .map(mapStudentRow);
  }

  function getStudentsWithCredentials() {
    return db
      .prepare(`
        SELECT
          s.id,
          s.name,
          s.token,
          s.username,
          s.password,
          s.created_at,
          s.class_id,
          c.book AS class_book,
          c.weekday AS class_weekday,
          c.start_time AS class_start_time,
          c.end_time AS class_end_time,
          COALESCE(SUM(pt.points), 0) AS total_points,
          COALESCE(SUM(CASE WHEN datetime(pt.created_at) >= datetime('now', '-7 days') THEN pt.points ELSE 0 END), 0) AS recent_points
        FROM students s
        LEFT JOIN classes c ON c.id = s.class_id
        LEFT JOIN point_transactions pt ON pt.student_id = s.id
        GROUP BY s.id
        ORDER BY
          CASE WHEN c.weekday IS NULL THEN 1 ELSE 0 END,
          c.weekday ASC,
          c.start_time ASC,
          c.book ASC,
          s.name ASC
      `)
      .all()
      .map(mapStudentRow);
  }

  function assertStudentFields({ name, username, password, token, classId }, studentId = null) {
    const resolvedClassId = resolveClassId(classId);
    const normalized = normalizeStudentCredentialFields({
      name,
      username,
      password,
      token,
      classId: resolvedClassId,
    });

    const usernameConflict = db.prepare(`
      SELECT id FROM students
      WHERE username = ? AND (? IS NULL OR id != ?)
    `).get(normalized.username, studentId, studentId);

    if (usernameConflict) {
      throw new Error("Este login ja esta em uso.");
    }

    const tokenConflict = db.prepare(`
      SELECT id FROM students
      WHERE token = ? AND (? IS NULL OR id != ?)
    `).get(normalized.token, studentId, studentId);

    if (tokenConflict) {
      throw new Error("Esta URL ja esta em uso.");
    }

    return normalized;
  }

  function updateStudent(studentId, updates) {
    const numericId = Number(studentId);
    const existing = getStudentById(numericId);
    if (!existing) {
      throw new Error("Aluno nao encontrado.");
    }

    const normalized = assertStudentFields(
      {
        name: updates.name ?? existing.name,
        username: updates.username ?? existing.username,
        password: updates.password ?? existing.password,
        token: updates.token ?? existing.token,
        classId: updates.classId ?? existing.class_id,
      },
      numericId
    );

    db.prepare(`
      UPDATE students
      SET name = ?, username = ?, password = ?, token = ?, class_id = ?
      WHERE id = ?
    `).run(
      normalized.name,
      normalized.username,
      normalized.password,
      normalized.token,
      normalized.classId,
      numericId
    );

    return getStudentById(numericId);
  }

  function moveStudents(studentIds, classId) {
    const resolvedClassId = resolveClassId(classId);
    if (!resolvedClassId) {
      throw new Error("Turma de destino obrigatoria.");
    }

    const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
    const normalizedIds = ids
      .map((studentId) => Number(studentId))
      .filter((studentId) => Number.isInteger(studentId) && studentId > 0);

    if (!normalizedIds.length) {
      throw new Error("Selecione pelo menos um aluno.");
    }

    const updateMany = db.transaction((studentIdsToMove) => {
      for (const studentId of studentIdsToMove) {
        if (!getStudentById(studentId)) {
          throw new Error("Aluno nao encontrado.");
        }
        db.prepare("UPDATE students SET class_id = ? WHERE id = ?").run(resolvedClassId, studentId);
      }
    });

    updateMany(normalizedIds);
    return normalizedIds.map(getStudentById);
  }

  function moveClassStudents(fromClassId, toClassId) {
    const sourceClassId = resolveClassId(fromClassId);
    const targetClassId = resolveClassId(toClassId);

    if (!sourceClassId || !targetClassId) {
      throw new Error("Turma de origem e destino sao obrigatorias.");
    }

    if (sourceClassId === targetClassId) {
      throw new Error("Escolha uma turma de destino diferente.");
    }

    const studentCount = db.prepare("SELECT COUNT(*) AS total FROM students WHERE class_id = ?").get(sourceClassId).total;
    if (studentCount <= 0) {
      throw new Error("A turma de origem nao possui alunos.");
    }

    db.prepare("UPDATE students SET class_id = ? WHERE class_id = ?").run(targetClassId, sourceClassId);
    return studentCount;
  }

  function getStudentPerformanceProfile(studentId) {
    const numericId = Number(studentId);
    if (!getStudentById(numericId)) {
      throw new Error("Aluno nao encontrado.");
    }

    return mapPerformanceProfile(
      db.prepare(`
        SELECT student_id, participation, grammar_vocabulary, homework, behavior, comments, updated_at
        FROM student_performance_profiles
        WHERE student_id = ?
      `).get(numericId)
    );
  }

  function updateStudentPerformanceProfile(studentId, profile) {
    const numericId = Number(studentId);
    if (!getStudentById(numericId)) {
      throw new Error("Aluno nao encontrado.");
    }

    const normalized = normalizeStudentPerformanceProfile(profile);

    db.prepare(`
      INSERT INTO student_performance_profiles (
        student_id,
        participation,
        grammar_vocabulary,
        homework,
        behavior,
        comments,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id) DO UPDATE SET
        participation = excluded.participation,
        grammar_vocabulary = excluded.grammar_vocabulary,
        homework = excluded.homework,
        behavior = excluded.behavior,
        comments = excluded.comments,
        updated_at = excluded.updated_at
    `).run(
      numericId,
      normalized.participation,
      normalized.grammarVocabulary,
      normalized.homework,
      normalized.behavior,
      normalized.comments
    );

    return getStudentPerformanceProfile(numericId);
  }

  function getAssessmentById(assessmentId) {
    return mapAssessmentRow(
      db.prepare(`
        SELECT a.*, c.book AS class_book, c.weekday AS class_weekday,
          c.start_time AS class_start_time, c.end_time AS class_end_time,
          c.professor_id AS class_professor_id, c.archived_at AS class_archived_at
        FROM assessments a
        JOIN classes c ON c.id = a.class_id
        WHERE a.id = ?
      `).get(assessmentId)
    );
  }

  function getAssessmentsByClass(classId) {
    return db.prepare(`
      SELECT a.*, c.book AS class_book, c.weekday AS class_weekday,
        c.start_time AS class_start_time, c.end_time AS class_end_time,
        c.professor_id AS class_professor_id,
        COUNT(ag.student_id) AS roster_count,
        SUM(CASE WHEN ag.status = 'pending' THEN 1 ELSE 0 END) AS pending_count
      FROM assessments a
      JOIN classes c ON c.id = a.class_id
      LEFT JOIN assessment_grades ag ON ag.assessment_id = a.id
      WHERE a.class_id = ?
      GROUP BY a.id
      ORDER BY a.sort_order ASC, a.assessment_date ASC, a.id ASC
    `).all(classId).map((row) => ({
      ...mapAssessmentRow(row),
      roster_count: Number(row.roster_count || 0),
      pending_count: Number(row.pending_count || 0),
    }));
  }

  function createAssessment(classId, fields) {
    const classroom = getClassById(resolveClassId(classId));
    assertActiveAssessmentClass(classroom);
    const normalized = normalizeAssessmentFields(fields);
    const create = db.transaction(() => {
      const nextOrder = Number(
        db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM assessments WHERE class_id = ?")
          .get(classroom.id).next_order
      );
      const result = db.prepare(`
        INSERT INTO assessments (class_id, title, description, assessment_date, counts_for_ranking, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        classroom.id,
        normalized.title,
        normalized.description,
        normalized.assessmentDate,
        normalized.countsForRanking ? 1 : 0,
        nextOrder
      );
      db.prepare(`
        INSERT INTO assessment_grades (assessment_id, student_id)
        SELECT ?, id FROM students WHERE class_id = ?
      `).run(result.lastInsertRowid, classroom.id);
      return result.lastInsertRowid;
    });
    return getAssessmentById(create());
  }

  function updateAssessment(assessmentId, fields) {
    const existing = getAssessmentById(assessmentId);
    if (!existing) {
      throw new Error("Avaliacao nao encontrada.");
    }
    assertActiveAssessmentClass(existing);
    if (existing.status !== "draft") {
      throw new Error("Somente avaliacoes em rascunho podem ser editadas.");
    }
    const normalized = normalizeAssessmentFields(fields, existing);
    db.prepare(`
      UPDATE assessments
      SET title = ?, description = ?, assessment_date = ?, counts_for_ranking = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      normalized.title,
      normalized.description,
      normalized.assessmentDate,
      normalized.countsForRanking ? 1 : 0,
      existing.id
    );
    return getAssessmentById(existing.id);
  }

  function deleteAssessment(assessmentId) {
    const existing = getAssessmentById(assessmentId);
    if (!existing) {
      throw new Error("Avaliacao nao encontrada.");
    }
    assertActiveAssessmentClass(existing);
    if (existing.status !== "draft") {
      throw new Error("Somente avaliacoes em rascunho podem ser excluidas.");
    }
    const completedGrades = db.prepare(
      "SELECT COUNT(*) AS total FROM assessment_grades WHERE assessment_id = ? AND status != 'pending'"
    ).get(existing.id).total;
    if (completedGrades > 0) {
      throw new Error("Avaliacao com notas lancadas nao pode ser excluida.");
    }
    const remove = db.transaction(() => {
      const oralTests = db.prepare("SELECT id FROM assessment_oral_tests WHERE assessment_id = ?").all(existing.id);
      for (const oralTest of oralTests) {
        const attempts = db.prepare("SELECT id FROM assessment_oral_attempts WHERE oral_test_id = ?").all(oralTest.id);
        for (const attempt of attempts) {
          db.prepare("DELETE FROM assessment_oral_attempt_revisions WHERE attempt_id = ?").run(attempt.id);
          db.prepare("DELETE FROM assessment_oral_answers WHERE attempt_id = ?").run(attempt.id);
        }
        db.prepare("DELETE FROM assessment_oral_attempts WHERE oral_test_id = ?").run(oralTest.id);
        db.prepare("DELETE FROM assessment_oral_test_questions WHERE oral_test_id = ?").run(oralTest.id);
      }
      db.prepare("DELETE FROM assessment_oral_tests WHERE assessment_id = ?").run(existing.id);
      db.prepare("DELETE FROM assessment_performance_reports WHERE assessment_id = ?").run(existing.id);
      db.prepare("DELETE FROM assessment_grades WHERE assessment_id = ?").run(existing.id);
      db.prepare("DELETE FROM assessments WHERE id = ?").run(existing.id);
    });
    remove();
    return existing;
  }

  function publishAssessment(assessmentId) {
    const existing = getAssessmentById(assessmentId);
    if (!existing) {
      throw new Error("Avaliacao nao encontrada.");
    }
    assertActiveAssessmentClass(existing);
    if (existing.status !== "draft") {
      throw new Error("Somente avaliacoes em rascunho podem ser publicadas.");
    }
    const pending = db.prepare(`
      SELECT COUNT(*) AS total FROM assessment_grades WHERE assessment_id = ? AND status = 'pending'
    `).get(existing.id).total;
    if (pending > 0) {
      throw new Error("Resolva todas as notas pendentes antes de publicar.");
    }
    db.prepare(`
      UPDATE assessments
      SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(existing.id);
    return getAssessmentById(existing.id);
  }

  function archiveAssessment(assessmentId) {
    const existing = getAssessmentById(assessmentId);
    if (!existing) {
      throw new Error("Avaliacao nao encontrada.");
    }
    assertActiveAssessmentClass(existing);
    if (existing.status !== "published") {
      throw new Error("Somente avaliacoes publicadas podem ser arquivadas.");
    }
    db.prepare("UPDATE assessments SET status = 'archived', updated_at = datetime('now') WHERE id = ?")
      .run(existing.id);
    return getAssessmentById(existing.id);
  }

  function getAssessmentGrades(assessmentId) {
    return db.prepare(`
      SELECT ag.*, s.name AS student_name, s.class_id AS current_class_id
      FROM assessment_grades ag
      JOIN students s ON s.id = ag.student_id
      WHERE ag.assessment_id = ?
      ORDER BY s.name COLLATE NOCASE ASC
    `).all(assessmentId).map(mapAssessmentGradeRow);
  }

  function addStudentToAssessment(assessmentId, studentId) {
    const assessment = getAssessmentById(assessmentId);
    const student = getStudentById(studentId);
    if (!assessment || !student) {
      throw new Error("Avaliacao ou aluno nao encontrado.");
    }
    assertActiveAssessmentClass(assessment);
    if (assessment.status !== "draft") {
      throw new Error("Somente avaliacoes em rascunho aceitam novos alunos.");
    }
    if (student.class_id !== assessment.class_id) {
      throw new Error("O aluno nao pertence a turma desta avaliacao.");
    }
    db.prepare("INSERT OR IGNORE INTO assessment_grades (assessment_id, student_id) VALUES (?, ?)")
      .run(assessment.id, student.id);
    return getAssessmentGrades(assessment.id).find((grade) => grade.student_id === student.id);
  }

  function saveAssessmentGrades(assessmentId, gradeInputs, options = {}) {
    const assessment = getAssessmentById(assessmentId);
    if (!assessment) {
      throw new Error("Avaliacao nao encontrada.");
    }
    assertActiveAssessmentClass(assessment);
    if (assessment.status === "archived") {
      throw new Error("Avaliacao arquivada nao pode ser alterada.");
    }
    const currentGrades = getAssessmentGrades(assessment.id);
    const { operations, reason } = prepareAssessmentGradeOperations(
      assessment,
      currentGrades,
      gradeInputs,
      options
    );
    const professorId = options.professorId ? Number(options.professorId) : null;
    const save = db.transaction(() => {
      for (const operation of operations) {
        if (assessment.status === "published" && operation.changed) {
          db.prepare(`
            INSERT INTO assessment_grade_revisions (
              assessment_id, student_id, old_status, old_ot_score, old_wt_score,
              new_status, new_ot_score, new_wt_score, reason, professor_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            assessment.id,
            operation.studentId,
            operation.previous.status,
            operation.previous.ot_score,
            operation.previous.wt_score,
            operation.grade.status,
            operation.grade.ot_score,
            operation.grade.wt_score,
            reason,
            professorId
          );
        }
        db.prepare(`
          UPDATE assessment_grades
          SET status = ?, ot_score = ?, wt_score = ?, teacher_note = ?, updated_at = datetime('now')
          WHERE assessment_id = ? AND student_id = ?
        `).run(
          operation.grade.status,
          operation.grade.ot_score,
          operation.grade.wt_score,
          operation.note,
          assessment.id,
          operation.studentId
        );
      }
      db.prepare("UPDATE assessments SET updated_at = datetime('now') WHERE id = ?").run(assessment.id);
    });
    save();
    return getAssessmentGrades(assessment.id);
  }

  function getAssessmentGradeRevisions(assessmentId, studentId = null) {
    const params = [assessmentId];
    let studentFilter = "";
    if (studentId !== null && studentId !== undefined) {
      studentFilter = "AND r.student_id = ?";
      params.push(studentId);
    }
    return db.prepare(`
      SELECT r.*, s.name AS student_name, p.display_name AS professor_name
      FROM assessment_grade_revisions r
      JOIN students s ON s.id = r.student_id
      LEFT JOIN professors p ON p.id = r.professor_id
      WHERE r.assessment_id = ? ${studentFilter}
      ORDER BY datetime(r.created_at) DESC, r.id DESC
    `).all(...params).map(mapGradeRevision);
  }

  function getStudentAssessments(studentId, options = {}) {
    const publishedOnly = options.publishedOnly !== false;
    return db.prepare(`
      SELECT ag.*, a.title, a.description, a.assessment_date, a.status AS assessment_status,
        a.counts_for_ranking, a.published_at, c.book AS class_book, c.archived_at AS class_archived_at
      FROM assessment_grades ag
      JOIN assessments a ON a.id = ag.assessment_id
      JOIN classes c ON c.id = a.class_id
      WHERE ag.student_id = ? ${publishedOnly ? "AND a.status = 'published'" : ""}
      ORDER BY a.assessment_date ASC, a.sort_order ASC, a.id ASC
    `).all(studentId).map(mapAssessmentGradeRow);
  }

  function getStudentAcademicSummary(studentId) {
    const grades = getStudentAssessments(studentId).filter(
      (grade) => Boolean(grade.counts_for_ranking) && !grade.class_archived_at
    );
    return calculateAcademicSummary(grades);
  }

  function getAssessmentPerformanceReport(assessmentId, studentId) {
    return mapAssessmentPerformanceReport(
      db.prepare(`
        SELECT * FROM assessment_performance_reports
        WHERE assessment_id = ? AND student_id = ?
      `).get(assessmentId, studentId)
    );
  }

  function updateAssessmentPerformanceReport(assessmentId, studentId, report, options = {}) {
    const assessment = getAssessmentById(assessmentId);
    const grade = getAssessmentGrades(assessmentId).find((item) => item.student_id === Number(studentId));
    if (!assessment || !grade) {
      throw new Error("Avaliacao ou aluno nao encontrado.");
    }
    assertActiveAssessmentClass(assessment);
    if (assessment.status === "archived") {
      throw new Error("Avaliacao arquivada nao pode ser alterada.");
    }
    const normalized = normalizeAssessmentPerformanceReport(report);
    db.prepare(`
      INSERT INTO assessment_performance_reports (
        assessment_id, student_id, participation, grammar_vocabulary, homework, behavior,
        comments, updated_by_professor_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(assessment_id, student_id) DO UPDATE SET
        participation = excluded.participation,
        grammar_vocabulary = excluded.grammar_vocabulary,
        homework = excluded.homework,
        behavior = excluded.behavior,
        comments = excluded.comments,
        updated_by_professor_id = excluded.updated_by_professor_id,
        updated_at = excluded.updated_at
    `).run(
      assessment.id, grade.student_id, normalized.participation, normalized.grammarVocabulary,
      normalized.homework, normalized.behavior, normalized.comments, options.professorId || null
    );
    return getAssessmentPerformanceReport(assessment.id, grade.student_id);
  }

  function getOralTemplateQuestions(templateId) {
    return db.prepare(`
      SELECT * FROM oral_test_template_questions
      WHERE template_id = ?
      ORDER BY position ASC, id ASC
    `).all(templateId).map(mapOralQuestionRow);
  }

  function getAssessmentOralQuestions(oralTestId) {
    return db.prepare(`
      SELECT * FROM assessment_oral_test_questions
      WHERE oral_test_id = ?
      ORDER BY position ASC, id ASC
    `).all(oralTestId).map(mapOralQuestionRow);
  }

  function getOralTestTemplates(professorId, options = {}) {
    const includeArchived = Boolean(options.includeArchived);
    return db.prepare(`
      SELECT t.*, COUNT(q.id) AS question_count
      FROM oral_test_templates t
      LEFT JOIN oral_test_template_questions q ON q.template_id = t.id
      WHERE t.professor_id = ? ${includeArchived ? "" : "AND t.archived_at IS NULL"}
      GROUP BY t.id
      ORDER BY t.updated_at DESC, t.id DESC
    `).all(Number(professorId)).map(mapOralTestTemplateRow);
  }

  function getOralTestTemplateById(templateId) {
    const template = mapOralTestTemplateRow(
      db.prepare("SELECT * FROM oral_test_templates WHERE id = ?").get(Number(templateId))
    );
    if (!template) {
      return null;
    }
    return {
      ...template,
      questions: getOralTemplateQuestions(template.id),
    };
  }

  function createOralTestTemplate(professorId, payload) {
    const normalized = normalizeOralTemplatePayload(payload);
    const create = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO oral_test_templates (professor_id, title, description)
        VALUES (?, ?, ?)
      `).run(Number(professorId), normalized.title, normalized.description);
      const insertQuestion = db.prepare(`
        INSERT INTO oral_test_template_questions (template_id, position, prompt, teacher_note)
        VALUES (?, ?, ?, ?)
      `);
      for (const question of normalized.questions) {
        insertQuestion.run(result.lastInsertRowid, question.position, question.prompt, question.teacherNote);
      }
      return result.lastInsertRowid;
    });
    return getOralTestTemplateById(create());
  }

  function updateOralTestTemplate(templateId, payload, options = {}) {
    const template = getOralTestTemplateById(templateId);
    assertOralTemplateOwner(template, options.professorId ?? template?.professor_id);
    const normalized = normalizeOralTemplatePayload(payload);
    const update = db.transaction(() => {
      db.prepare(`
        UPDATE oral_test_templates
        SET title = ?, description = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(normalized.title, normalized.description, template.id);
      db.prepare("DELETE FROM oral_test_template_questions WHERE template_id = ?").run(template.id);
      const insertQuestion = db.prepare(`
        INSERT INTO oral_test_template_questions (template_id, position, prompt, teacher_note)
        VALUES (?, ?, ?, ?)
      `);
      for (const question of normalized.questions) {
        insertQuestion.run(template.id, question.position, question.prompt, question.teacherNote);
      }
    });
    update();
    return getOralTestTemplateById(template.id);
  }

  function archiveOralTestTemplate(templateId, professorId) {
    const template = getOralTestTemplateById(templateId);
    assertOralTemplateOwner(template, professorId);
    db.prepare(`
      UPDATE oral_test_templates
      SET archived_at = COALESCE(archived_at, datetime('now')), updated_at = datetime('now')
      WHERE id = ?
    `).run(template.id);
    return getOralTestTemplateById(template.id);
  }

  function duplicateOralTestTemplate(templateId, professorId) {
    const template = getOralTestTemplateById(templateId);
    assertOralTemplateOwner(template, professorId);
    return createOralTestTemplate(professorId, {
      title: `${template.title} - copia`,
      description: template.description,
      questions: template.questions,
    });
  }

  function getAssessmentOralTestById(oralTestId) {
    const oralTest = mapAssessmentOralTestRow(
      db.prepare("SELECT * FROM assessment_oral_tests WHERE id = ?").get(Number(oralTestId))
    );
    if (!oralTest) {
      return null;
    }
    return {
      ...oralTest,
      questions: getAssessmentOralQuestions(oralTest.id),
    };
  }

  function getAssessmentOralTest(assessmentId) {
    const oralTest = mapAssessmentOralTestRow(
      db.prepare("SELECT * FROM assessment_oral_tests WHERE assessment_id = ?").get(Number(assessmentId))
    );
    if (!oralTest) {
      return null;
    }
    return {
      ...oralTest,
      questions: getAssessmentOralQuestions(oralTest.id),
    };
  }

  function attachOralTemplateToAssessment(assessmentId, templateId, professorId) {
    const assessment = getAssessmentById(assessmentId);
    if (!assessment) {
      throw new Error("Avaliacao nao encontrada.");
    }
    assertActiveAssessmentClass(assessment);
    if (assessment.status !== "draft") {
      throw new Error("Modelo oral so pode ser definido em avaliacao em rascunho.");
    }
    if (Number(assessment.class_professor_id) !== Number(professorId)) {
      throw new Error("Avaliacao nao encontrada.");
    }
    const template = getOralTestTemplateById(templateId);
    assertOralTemplateOwner(template, professorId);
    const existing = getAssessmentOralTest(assessment.id);
    if (existing) {
      const attempts = db.prepare("SELECT COUNT(*) AS total FROM assessment_oral_attempts WHERE oral_test_id = ?")
        .get(existing.id).total;
      if (attempts > 0) {
        throw new Error("Prova oral ja aplicada nao pode trocar de modelo.");
      }
    }

    const attach = db.transaction(() => {
      if (existing) {
        db.prepare("DELETE FROM assessment_oral_test_questions WHERE oral_test_id = ?").run(existing.id);
        db.prepare("DELETE FROM assessment_oral_tests WHERE id = ?").run(existing.id);
      }
      const result = db.prepare(`
        INSERT INTO assessment_oral_tests (
          assessment_id, source_template_id, title, description, created_by_professor_id
        ) VALUES (?, ?, ?, ?, ?)
      `).run(assessment.id, template.id, template.title, template.description, Number(professorId));
      const insertQuestion = db.prepare(`
        INSERT INTO assessment_oral_test_questions (oral_test_id, position, prompt, teacher_note)
        VALUES (?, ?, ?, ?)
      `);
      for (const question of template.questions) {
        insertQuestion.run(result.lastInsertRowid, question.position, question.prompt, question.teacher_note || "");
      }
      return result.lastInsertRowid;
    });

    return getAssessmentOralTestById(attach());
  }

  function getAssessmentOralRoster(assessmentId) {
    const oralTest = getAssessmentOralTest(assessmentId);
    if (!oralTest) {
      return [];
    }
    return db.prepare(`
      SELECT
        s.id AS student_id,
        s.name AS student_name,
        COALESCE(SUM(pt.points), 0) AS total_points,
        ag.status AS grade_status,
        ag.ot_score,
        ag.wt_score,
        attempt.id AS attempt_id,
        attempt.status AS attempt_status,
        attempt.score_hundredths,
        attempt.observation,
        attempt.completed_at
      FROM assessment_grades ag
      JOIN students s ON s.id = ag.student_id
      LEFT JOIN point_transactions pt ON pt.student_id = s.id
      LEFT JOIN assessment_oral_attempts attempt
        ON attempt.oral_test_id = ? AND attempt.student_id = s.id
      WHERE ag.assessment_id = ?
      GROUP BY s.id, ag.status, ag.ot_score, ag.wt_score, attempt.id
      ORDER BY total_points DESC, s.name COLLATE NOCASE ASC
    `).all(oralTest.id, Number(assessmentId)).map(mapOralRosterRow);
  }

  function getOralAttempt(oralTestId, studentId) {
    const attempt = mapOralAttemptRow(
      db.prepare(`
        SELECT * FROM assessment_oral_attempts
        WHERE oral_test_id = ? AND student_id = ?
      `).get(Number(oralTestId), Number(studentId))
    );
    if (!attempt) {
      return null;
    }
    return {
      ...attempt,
      answers: db.prepare(`
        SELECT * FROM assessment_oral_answers
        WHERE attempt_id = ?
        ORDER BY question_id ASC
      `).all(attempt.id).map(mapOralAnswerRow),
    };
  }

  function saveOralAttempt(oralTestId, studentId, answers, options = {}) {
    const oralTest = getAssessmentOralTestById(oralTestId);
    const assessment = oralTest ? getAssessmentById(oralTest.assessment_id) : null;
    const grade = assessment
      ? getAssessmentGrades(assessment.id).find((item) => item.student_id === Number(studentId))
      : null;
    if (!oralTest || !assessment || !grade) {
      throw new Error("Prova oral ou aluno nao encontrado.");
    }
    assertActiveAssessmentClass(assessment);
    if (assessment.status === "archived") {
      throw new Error("Avaliacao arquivada nao pode ser alterada.");
    }

    const previous = getOralAttempt(oralTest.id, studentId);
    const preparedAttempt = prepareOralAttemptSave({
      assessment,
      oralTest,
      previousAttempt: previous,
      answers,
      options,
    });

    const save = db.transaction(() => {
      let attemptId = previous?.id;
      if (previous) {
        db.prepare(`
          UPDATE assessment_oral_attempts
          SET status = ?, score_hundredths = ?, observation = ?,
            completed_at = CASE WHEN ? THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END,
            synced_to_ot_at = CASE WHEN ? THEN COALESCE(synced_to_ot_at, datetime('now')) ELSE synced_to_ot_at END,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          preparedAttempt.status,
          preparedAttempt.score,
          preparedAttempt.observation,
          preparedAttempt.complete ? 1 : 0,
          preparedAttempt.complete ? 1 : 0,
          previous.id
        );
      } else {
        const result = db.prepare(`
          INSERT INTO assessment_oral_attempts (
            oral_test_id, assessment_id, student_id, status, score_hundredths,
            observation, synced_to_ot_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ${preparedAttempt.complete ? "datetime('now')" : "NULL"}, ${preparedAttempt.complete ? "datetime('now')" : "NULL"})
        `).run(
          oralTest.id,
          assessment.id,
          Number(studentId),
          preparedAttempt.status,
          preparedAttempt.score,
          preparedAttempt.observation
        );
        attemptId = result.lastInsertRowid;
      }

      if (preparedAttempt.changedCompletedScore) {
        db.prepare(`
          INSERT INTO assessment_oral_attempt_revisions (
            attempt_id, student_id, old_score_hundredths, new_score_hundredths, reason, professor_id
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          attemptId,
          Number(studentId),
          previous.score_hundredths,
          preparedAttempt.score,
          preparedAttempt.reason || "Alteracao de avaliacao oral",
          options.professorId || null
        );
      }

      db.prepare("DELETE FROM assessment_oral_answers WHERE attempt_id = ?").run(attemptId);
      const insertAnswer = db.prepare(`
        INSERT INTO assessment_oral_answers (attempt_id, question_id, result)
        VALUES (?, ?, ?)
      `);
      for (const answer of preparedAttempt.answered) {
        insertAnswer.run(attemptId, answer.questionId, answer.result);
      }
      if (preparedAttempt.complete) {
        db.prepare(`
          UPDATE assessment_oral_tests
          SET locked_at = COALESCE(locked_at, datetime('now')), updated_at = datetime('now')
          WHERE id = ?
        `).run(oralTest.id);
      }
      return attemptId;
    });

    save();
    return getOralAttempt(oralTest.id, studentId);
  }

  function saveOralAttemptDraft(oralTestId, studentId, answers, options = {}) {
    return saveOralAttempt(oralTestId, studentId, answers, { ...options, complete: false });
  }

  function completeOralAttempt(oralTestId, studentId, answers, options = {}) {
    return saveOralAttempt(oralTestId, studentId, answers, { ...options, complete: true });
  }

  function deleteStudent(studentId) {
    const numericId = Number(studentId);
    const existing = getStudentById(numericId);
    if (!existing) {
      throw new Error("Aluno nao encontrado.");
    }

    const removeStudent = db.transaction((id) => {
      const attempts = db.prepare("SELECT id FROM assessment_oral_attempts WHERE student_id = ?").all(id);
      for (const attempt of attempts) {
        db.prepare("DELETE FROM assessment_oral_attempt_revisions WHERE attempt_id = ?").run(attempt.id);
        db.prepare("DELETE FROM assessment_oral_answers WHERE attempt_id = ?").run(attempt.id);
      }
      db.prepare("DELETE FROM assessment_oral_attempts WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM assessment_grade_revisions WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM assessment_performance_reports WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM assessment_grades WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM student_performance_profiles WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM point_transactions WHERE student_id = ?").run(id);
      db.prepare("DELETE FROM students WHERE id = ?").run(id);
    });

    removeStudent(numericId);
    return existing;
  }

  function addPoints(studentId, category, points, note, options = {}) {
    const student = getStudentById(studentId);
    if (!student) {
      throw new Error("Aluno nao encontrado.");
    }

    const validated = validatePoints(category, points, note);
    const batchId = options.batchId || createToken();
    const result = db.prepare(`
      INSERT INTO point_transactions (student_id, category, points, note, batch_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(studentId, validated.category, validated.points, validated.note, batchId);

    return mapPointTransaction(
      db.prepare(`
        SELECT id, student_id, category, points, note, batch_id, created_at
        FROM point_transactions
        WHERE id = ?
      `).get(result.lastInsertRowid)
    );
  }

  function addPointsBulk(studentIds, category, points, note) {
    const normalizedIds = normalizeStudentIds(studentIds, "Selecione pelo menos um aluno.");

    for (const studentId of normalizedIds) {
      const student = getStudentById(studentId);
      if (!student) {
        throw new Error("Aluno nao encontrado.");
      }
    }

    const batchId = createToken();
    return normalizedIds.map((studentId) => addPoints(studentId, category, points, note, { batchId }));
  }

  function undoLatestPointBatch(studentIds) {
    const normalizedIds = normalizeStudentIds(studentIds, "Nenhum aluno disponivel para desfazer.");

    const placeholders = normalizedIds.map(() => "?").join(",");
    const latest = db.prepare(`
      SELECT id, batch_id
      FROM point_transactions
      WHERE student_id IN (${placeholders})
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1
    `).get(...normalizedIds);

    if (!latest) {
      throw new Error("Nao ha lancamentos para desfazer.");
    }

    const deleteResult = latest.batch_id
      ? db.prepare(`
          DELETE FROM point_transactions
          WHERE batch_id = ? AND student_id IN (${placeholders})
        `).run(latest.batch_id, ...normalizedIds)
      : db.prepare("DELETE FROM point_transactions WHERE id = ?").run(latest.id);

    return deleteResult.changes;
  }

  function getStudentHistory(studentId) {
    return db
      .prepare(`
        SELECT id, student_id, category, points, note, batch_id, created_at
        FROM point_transactions
        WHERE student_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
      `)
      .all(studentId)
      .map(mapPointTransaction);
  }

  function getStudentTotals(studentId) {
    const rows = db.prepare(`
      SELECT category, COALESCE(SUM(points), 0) AS total
      FROM point_transactions
      WHERE student_id = ?
      GROUP BY category
    `).all(studentId);

    return buildStudentTotals(rows);
  }

  function getStudentSummaryByToken(token) {
    const student = getStudentByToken(token);
    if (!student) {
      return null;
    }

    const history = getStudentHistory(student.id);

    return {
      student,
      totals: getStudentTotals(student.id),
      academic: getStudentAcademicSummary(student.id),
      assessments: getStudentAssessments(student.id),
      penalties: history.filter((item) => item.category === "bad_behavior"),
    };
  }

  return {
    db,
    filename,
    createClass,
    updateClass,
    archiveClass,
    deleteClass,
    getClassById,
    getAllClasses,
    createStudent,
    importStudents,
    getStudentById,
    getStudentByToken,
    getStudentByUsernameAndToken,
    getProfessorById,
    getProfessorByUsername,
    getAllStudents,
    getStudentsWithCredentials,
    addPoints,
    addPointsBulk,
    undoLatestPointBatch,
    updateStudent,
    moveStudents,
    moveClassStudents,
    deleteStudent,
    getStudentPerformanceProfile,
    updateStudentPerformanceProfile,
    createAssessment,
    updateAssessment,
    deleteAssessment,
    publishAssessment,
    archiveAssessment,
    getAssessmentById,
    getAssessmentsByClass,
    getAssessmentGrades,
    addStudentToAssessment,
    saveAssessmentGrades,
    getAssessmentGradeRevisions,
    getStudentAssessments,
    getStudentAcademicSummary,
    getAssessmentPerformanceReport,
    updateAssessmentPerformanceReport,
    getOralTestTemplates,
    getOralTestTemplateById,
    createOralTestTemplate,
    updateOralTestTemplate,
    archiveOralTestTemplate,
    duplicateOralTestTemplate,
    attachOralTemplateToAssessment,
    getAssessmentOralTest,
    getAssessmentOralRoster,
    getOralAttempt,
    saveOralAttemptDraft,
    completeOralAttempt,
    getStudentHistory,
    getStudentTotals,
    getStudentSummaryByToken,
    close() {
      db.close();
    },
  };
}

module.exports = {
  createSqliteStore,
};
