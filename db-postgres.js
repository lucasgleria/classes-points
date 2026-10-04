const { neon } = require("@neondatabase/serverless");
const { validatePoints } = require("./validation");
const { calculateAcademicSummary } = require("./assessment-common");
const { initializePostgresSchema } = require("./db-postgres-schema");
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

function createPostgresStore(options) {
  const sql = neon(options.connectionString);
  let initPromise = null;

  // Uma falha transitoria de conexao no cold start nao pode travar a instancia:
  // se a inicializacao falhar, a proxima requisicao tenta de novo.
  function ensureSchema() {
    if (!initPromise) {
      initPromise = initializePostgresSchema(sql, options).catch((error) => {
        initPromise = null;
        throw error;
      });
    }
    return initPromise;
  }

  ensureSchema().catch((error) => {
    console.error("Falha ao inicializar o banco Postgres:", error);
  });

  async function query(text, params = []) {
    await ensureSchema();
    return sql.query(text, params);
  }

  async function queryOne(text, params = []) {
    const rows = await query(text, params);
    return rows[0];
  }

  async function getProfessorById(professorId) {
    return mapProfessorRow(
      await queryOne(
        `
          SELECT id, username, password, display_name
          FROM professors
          WHERE id = $1
        `,
        [professorId]
      )
    );
  }

  async function getClassById(classId) {
    return mapClassRow(
      await queryOne(
        `
          SELECT id, book, weekday, start_time, end_time, professor_id, archived_at, created_at
          FROM classes
          WHERE id = $1
        `,
        [classId]
      )
    );
  }

  async function getAllClasses(options = {}) {
    return (await query(`
      SELECT id, book, weekday, start_time, end_time, professor_id, archived_at, created_at
      FROM classes
      ${options.includeArchived ? "" : "WHERE archived_at IS NULL"}
      ORDER BY weekday ASC, start_time ASC, book ASC
    `)).map(mapClassRow);
  }

  async function createClass(fields, options = {}) {
    const normalized = normalizeClassFields(fields);
    const professorId = normalizeProfessorId(options.professorId);
    const professor = await getProfessorById(professorId);
    if (!professor) {
      throw new Error("Professor nao encontrado.");
    }

    const existing = await queryOne(
      `
        SELECT id
        FROM classes
        WHERE book = $1 AND weekday = $2 AND start_time = $3 AND end_time = $4
      `,
      [normalized.book, normalized.weekday, normalized.startTime, normalized.endTime]
    );

    if (existing) {
      throw new Error("Esta turma ja existe.");
    }

    return mapClassRow(
      await queryOne(
        `
          INSERT INTO classes (book, weekday, start_time, end_time, professor_id)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, book, weekday, start_time, end_time, professor_id, created_at
        `,
        [normalized.book, normalized.weekday, normalized.startTime, normalized.endTime, professorId]
      )
    );
  }

  async function updateClass(classId, fields) {
    const numericId = Number(classId);
    const existing = await getClassById(numericId);
    if (!existing) {
      throw new Error("Turma nao encontrada.");
    }

    const normalized = normalizeClassFields({
      book: fields.book ?? existing.book,
      weekday: fields.weekday ?? existing.weekday,
      startTime: fields.startTime ?? existing.start_time,
      endTime: fields.endTime ?? existing.end_time,
    });

    const conflict = await queryOne(
      `
        SELECT id
        FROM classes
        WHERE book = $1 AND weekday = $2 AND start_time = $3 AND end_time = $4 AND id <> $5
      `,
      [normalized.book, normalized.weekday, normalized.startTime, normalized.endTime, numericId]
    );

    if (conflict) {
      throw new Error("Esta turma ja existe.");
    }

    return mapClassRow(
      await queryOne(
        `
          UPDATE classes
          SET book = $1, weekday = $2, start_time = $3, end_time = $4
          WHERE id = $5
          RETURNING id, book, weekday, start_time, end_time, professor_id, created_at
        `,
        [normalized.book, normalized.weekday, normalized.startTime, normalized.endTime, numericId]
      )
    );
  }

  async function archiveClass(classId) {
    const numericId = Number(classId);
    const existing = await getClassById(numericId);
    if (!existing) {
      throw new Error("Turma nao encontrada.");
    }

    await query("UPDATE classes SET archived_at = NOW() WHERE id = $1", [numericId]);
    return existing;
  }

  async function deleteClass(classId) {
    const numericId = Number(classId);
    const existing = await getClassById(numericId);
    if (!existing) {
      throw new Error("Turma nao encontrada.");
    }

    const countRow = await queryOne("SELECT COUNT(*)::int AS total FROM students WHERE class_id = $1", [numericId]);
    if (countRow.total > 0) {
      throw new Error("Mova ou exclua os alunos antes de apagar a turma.");
    }
    const assessmentCount = await queryOne("SELECT COUNT(*)::int AS total FROM assessments WHERE class_id = $1", [numericId]);
    if (assessmentCount.total > 0) {
      throw new Error("Exclua as avaliacoes antes de apagar a turma.");
    }

    await query("DELETE FROM classes WHERE id = $1", [numericId]);
    return existing;
  }

  async function resolveClassId(classId) {
    const numericId = normalizeClassId(classId);
    if (numericId === null) {
      return null;
    }

    const classroom = await getClassById(numericId);
    if (!classroom) {
      throw new Error("Turma nao encontrada.");
    }

    return classroom.id;
  }

  async function createUniqueUsername(baseName) {
    const base = slugifyName(baseName) || "aluno";
    let candidate = base;
    let suffix = 1;

    while (await queryOne("SELECT id FROM students WHERE username = $1", [candidate])) {
      suffix += 1;
      candidate = `${base}_${suffix}`;
    }

    return candidate;
  }

  async function createStudent(name, options = {}) {
    const trimmedName = normalizeStudentName(name);

    const token = createToken();
    const username = await createUniqueUsername(trimmedName);
    const password = createPassword();
    const classId = await resolveClassId(options.classId);

    const inserted = await queryOne(
      `
        INSERT INTO students (name, token, username, password, class_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [trimmedName, token, username, password, classId]
    );

    return getStudentById(inserted.id);
  }

  async function importStudents(names, options = {}) {
    const classId = await resolveClassId(options.classId);
    if (!classId) {
      throw new Error("Turma do aluno e obrigatoria.");
    }

    const parsedNames = parseStudentNames(names);

    const created = [];
    for (const name of parsedNames) {
      created.push(await createStudent(name, { classId }));
    }
    return created;
  }

  async function getStudentById(id) {
    return mapStudentRow(
      await queryOne(
        `
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
          WHERE s.id = $1
        `,
        [id]
      )
    );
  }

  async function getStudentByToken(token) {
    return mapStudentRow(
      await queryOne(
        `
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
          WHERE s.token = $1
        `,
        [token]
      )
    );
  }

  async function getStudentByUsernameAndToken(token, username) {
    return mapStudentRow(
      await queryOne(
        `
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
          WHERE s.token = $1 AND s.username = $2
        `,
        [token, username]
      )
    );
  }

  async function getProfessorByUsername(username) {
    return mapProfessorRow(
      await queryOne(
        `
          SELECT id, username, password, display_name
          FROM professors
          WHERE username = $1
        `,
        [username]
      )
    );
  }

  async function getAllStudents() {
    return (await query(`
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
        COALESCE(SUM(pt.points), 0)::int AS total_points,
        COALESCE(SUM(CASE WHEN pt.created_at >= NOW() - INTERVAL '7 days' THEN pt.points ELSE 0 END), 0)::int AS recent_points
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN point_transactions pt ON pt.student_id = s.id
      GROUP BY
        s.id,
        s.name,
        s.token,
        s.username,
        s.created_at,
        s.class_id,
        c.book,
        c.weekday,
        c.start_time,
        c.end_time
      ORDER BY
        CASE WHEN c.weekday IS NULL THEN 1 ELSE 0 END,
        c.weekday ASC,
        c.start_time ASC,
        c.book ASC,
        total_points DESC,
        s.name ASC
    `)).map(mapStudentRow);
  }

  async function getStudentsWithCredentials() {
    return (await query(`
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
        COALESCE(SUM(pt.points), 0)::int AS total_points,
        COALESCE(SUM(CASE WHEN pt.created_at >= NOW() - INTERVAL '7 days' THEN pt.points ELSE 0 END), 0)::int AS recent_points
      FROM students s
      LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN point_transactions pt ON pt.student_id = s.id
      GROUP BY
        s.id,
        s.name,
        s.token,
        s.username,
        s.password,
        s.created_at,
        s.class_id,
        c.book,
        c.weekday,
        c.start_time,
        c.end_time
      ORDER BY
        CASE WHEN c.weekday IS NULL THEN 1 ELSE 0 END,
        c.weekday ASC,
        c.start_time ASC,
        c.book ASC,
        s.name ASC
    `)).map(mapStudentRow);
  }

  async function assertStudentFields({ name, username, password, token, classId }, studentId = null) {
    const resolvedClassId = await resolveClassId(classId);
    const normalized = normalizeStudentCredentialFields({
      name,
      username,
      password,
      token,
      classId: resolvedClassId,
    });

    const usernameConflict = await queryOne(
      `
        SELECT id
        FROM students
        WHERE username = $1 AND ($2::INTEGER IS NULL OR id <> $2)
      `,
      [normalized.username, studentId]
    );

    if (usernameConflict) {
      throw new Error("Este login ja esta em uso.");
    }

    const tokenConflict = await queryOne(
      `
        SELECT id
        FROM students
        WHERE token = $1 AND ($2::INTEGER IS NULL OR id <> $2)
      `,
      [normalized.token, studentId]
    );

    if (tokenConflict) {
      throw new Error("Esta URL ja esta em uso.");
    }

    return normalized;
  }

  async function updateStudent(studentId, updates) {
    const numericId = Number(studentId);
    const existing = await getStudentById(numericId);
    if (!existing) {
      throw new Error("Aluno nao encontrado.");
    }

    const normalized = await assertStudentFields(
      {
        name: updates.name ?? existing.name,
        username: updates.username ?? existing.username,
        password: updates.password ?? existing.password,
        token: updates.token ?? existing.token,
        classId: updates.classId ?? existing.class_id,
      },
      numericId
    );

    await query(
      `
        UPDATE students
        SET name = $1, username = $2, password = $3, token = $4, class_id = $5
        WHERE id = $6
      `,
      [
        normalized.name,
        normalized.username,
        normalized.password,
        normalized.token,
        normalized.classId,
        numericId,
      ]
    );

    return getStudentById(numericId);
  }

  async function moveStudents(studentIds, classId) {
    const resolvedClassId = await resolveClassId(classId);
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

    const existingIds = await query("SELECT id FROM students WHERE id = ANY($1::int[])", [normalizedIds]);
    if (existingIds.length !== normalizedIds.length) {
      throw new Error("Aluno nao encontrado.");
    }

    await query("UPDATE students SET class_id = $1 WHERE id = ANY($2::int[])", [resolvedClassId, normalizedIds]);
    return Promise.all(normalizedIds.map((studentId) => getStudentById(studentId)));
  }

  async function moveClassStudents(fromClassId, toClassId) {
    const sourceClassId = await resolveClassId(fromClassId);
    const targetClassId = await resolveClassId(toClassId);

    if (!sourceClassId || !targetClassId) {
      throw new Error("Turma de origem e destino sao obrigatorias.");
    }

    if (sourceClassId === targetClassId) {
      throw new Error("Escolha uma turma de destino diferente.");
    }

    const countRow = await queryOne("SELECT COUNT(*)::int AS total FROM students WHERE class_id = $1", [sourceClassId]);
    if (countRow.total <= 0) {
      throw new Error("A turma de origem nao possui alunos.");
    }

    await query("UPDATE students SET class_id = $1 WHERE class_id = $2", [targetClassId, sourceClassId]);
    return countRow.total;
  }

  async function getStudentPerformanceProfile(studentId) {
    const numericId = Number(studentId);
    if (!(await getStudentById(numericId))) {
      throw new Error("Aluno nao encontrado.");
    }

    return mapPerformanceProfile(
      await queryOne(
        `
          SELECT student_id, participation, grammar_vocabulary, homework, behavior, comments, updated_at
          FROM student_performance_profiles
          WHERE student_id = $1
        `,
        [numericId]
      )
    );
  }

  async function updateStudentPerformanceProfile(studentId, profile) {
    const numericId = Number(studentId);
    if (!(await getStudentById(numericId))) {
      throw new Error("Aluno nao encontrado.");
    }

    const normalized = normalizeStudentPerformanceProfile(profile);

    return mapPerformanceProfile(
      await queryOne(
        `
          INSERT INTO student_performance_profiles (
            student_id,
            participation,
            grammar_vocabulary,
            homework,
            behavior,
            comments,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (student_id) DO UPDATE
          SET participation = EXCLUDED.participation,
              grammar_vocabulary = EXCLUDED.grammar_vocabulary,
              homework = EXCLUDED.homework,
              behavior = EXCLUDED.behavior,
              comments = EXCLUDED.comments,
              updated_at = EXCLUDED.updated_at
          RETURNING student_id, participation, grammar_vocabulary, homework, behavior, comments, updated_at
        `,
        [
          numericId,
          normalized.participation,
          normalized.grammarVocabulary,
          normalized.homework,
          normalized.behavior,
          normalized.comments,
        ]
      )
    );
  }

  async function getAssessmentById(assessmentId) {
    return mapAssessmentRow(await queryOne(`
      SELECT a.*, c.book AS class_book, c.weekday AS class_weekday,
        c.start_time AS class_start_time, c.end_time AS class_end_time,
        c.professor_id AS class_professor_id, c.archived_at AS class_archived_at
      FROM assessments a JOIN classes c ON c.id = a.class_id WHERE a.id = $1
    `, [assessmentId]));
  }

  async function getAssessmentsByClass(classId) {
    return (await query(`
      SELECT a.*, c.book AS class_book, c.weekday AS class_weekday,
        c.start_time AS class_start_time, c.end_time AS class_end_time,
        c.professor_id AS class_professor_id, COUNT(ag.student_id)::int AS roster_count,
        COUNT(*) FILTER (WHERE ag.status = 'pending')::int AS pending_count
      FROM assessments a JOIN classes c ON c.id = a.class_id
      LEFT JOIN assessment_grades ag ON ag.assessment_id = a.id
      WHERE a.class_id = $1 GROUP BY a.id, c.id
      ORDER BY a.sort_order ASC, a.assessment_date ASC, a.id ASC
    `, [classId])).map((row) => ({
      ...mapAssessmentRow(row),
      roster_count: Number(row.roster_count || 0),
      pending_count: Number(row.pending_count || 0),
    }));
  }

  async function createAssessment(classId, fields) {
    const classroom = await getClassById(await resolveClassId(classId));
    assertActiveAssessmentClass(classroom);
    const normalized = normalizeAssessmentFields(fields);
    const inserted = await queryOne(`
      WITH new_assessment AS (
        INSERT INTO assessments (class_id, title, description, assessment_date, counts_for_ranking, sort_order)
        VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM assessments WHERE class_id = $1))
        RETURNING id, class_id
      ), roster AS (
        INSERT INTO assessment_grades (assessment_id, student_id)
        SELECT new_assessment.id, students.id FROM new_assessment
        JOIN students ON students.class_id = new_assessment.class_id
        RETURNING assessment_id
      )
      SELECT id FROM new_assessment
    `, [classroom.id, normalized.title, normalized.description, normalized.assessmentDate, normalized.countsForRanking]);
    return getAssessmentById(inserted.id);
  }

  async function updateAssessment(assessmentId, fields) {
    const existing = await getAssessmentById(assessmentId);
    if (!existing) throw new Error("Avaliacao nao encontrada.");
    assertActiveAssessmentClass(existing);
    if (existing.status !== "draft") throw new Error("Somente avaliacoes em rascunho podem ser editadas.");
    const normalized = normalizeAssessmentFields(fields, existing);
    await query(`UPDATE assessments SET title=$1, description=$2, assessment_date=$3, counts_for_ranking=$4, updated_at=NOW() WHERE id=$5`,
      [normalized.title, normalized.description, normalized.assessmentDate, normalized.countsForRanking, existing.id]);
    return getAssessmentById(existing.id);
  }

  async function deleteAssessment(assessmentId) {
    const existing = await getAssessmentById(assessmentId);
    if (!existing) throw new Error("Avaliacao nao encontrada.");
    assertActiveAssessmentClass(existing);
    if (existing.status !== "draft") throw new Error("Somente avaliacoes em rascunho podem ser excluidas.");
    const completedGrades = await queryOne("SELECT COUNT(*)::int AS total FROM assessment_grades WHERE assessment_id=$1 AND status!='pending'", [existing.id]);
    if (completedGrades.total > 0) throw new Error("Avaliacao com notas lancadas nao pode ser excluida.");
    const oralTests = await query("SELECT id FROM assessment_oral_tests WHERE assessment_id=$1", [existing.id]);
    for (const oralTest of oralTests) {
      const attempts = await query("SELECT id FROM assessment_oral_attempts WHERE oral_test_id=$1", [oralTest.id]);
      for (const attempt of attempts) {
        await query("DELETE FROM assessment_oral_attempt_revisions WHERE attempt_id=$1", [attempt.id]);
        await query("DELETE FROM assessment_oral_answers WHERE attempt_id=$1", [attempt.id]);
      }
      await query("DELETE FROM assessment_oral_attempts WHERE oral_test_id=$1", [oralTest.id]);
      await query("DELETE FROM assessment_oral_test_questions WHERE oral_test_id=$1", [oralTest.id]);
    }
    await query("DELETE FROM assessment_oral_tests WHERE assessment_id=$1", [existing.id]);
    await ensureSchema();
    await sql.transaction((txn) => [
      txn`DELETE FROM assessment_performance_reports WHERE assessment_id = ${existing.id}`,
      txn`DELETE FROM assessment_grades WHERE assessment_id = ${existing.id}`,
      txn`DELETE FROM assessments WHERE id = ${existing.id}`,
    ]);
    return existing;
  }

  async function publishAssessment(assessmentId) {
    const existing = await getAssessmentById(assessmentId);
    if (!existing) throw new Error("Avaliacao nao encontrada.");
    assertActiveAssessmentClass(existing);
    if (existing.status !== "draft") throw new Error("Somente avaliacoes em rascunho podem ser publicadas.");
    const pending = await queryOne("SELECT COUNT(*)::int AS total FROM assessment_grades WHERE assessment_id=$1 AND status='pending'", [existing.id]);
    if (pending.total > 0) throw new Error("Resolva todas as notas pendentes antes de publicar.");
    await query("UPDATE assessments SET status='published', published_at=NOW(), updated_at=NOW() WHERE id=$1", [existing.id]);
    return getAssessmentById(existing.id);
  }

  async function archiveAssessment(assessmentId) {
    const existing = await getAssessmentById(assessmentId);
    if (!existing) throw new Error("Avaliacao nao encontrada.");
    assertActiveAssessmentClass(existing);
    if (existing.status !== "published") throw new Error("Somente avaliacoes publicadas podem ser arquivadas.");
    await query("UPDATE assessments SET status='archived', updated_at=NOW() WHERE id=$1", [existing.id]);
    return getAssessmentById(existing.id);
  }

  async function getAssessmentGrades(assessmentId) {
    return (await query(`
      SELECT ag.*, s.name AS student_name, s.class_id AS current_class_id
      FROM assessment_grades ag JOIN students s ON s.id=ag.student_id
      WHERE ag.assessment_id=$1 ORDER BY s.name ASC
    `, [assessmentId])).map(mapAssessmentGradeRow);
  }

  async function addStudentToAssessment(assessmentId, studentId) {
    const assessment = await getAssessmentById(assessmentId);
    const student = await getStudentById(studentId);
    if (!assessment || !student) throw new Error("Avaliacao ou aluno nao encontrado.");
    assertActiveAssessmentClass(assessment);
    if (assessment.status !== "draft") throw new Error("Somente avaliacoes em rascunho aceitam novos alunos.");
    if (student.class_id !== assessment.class_id) throw new Error("O aluno nao pertence a turma desta avaliacao.");
    await query("INSERT INTO assessment_grades (assessment_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [assessment.id, student.id]);
    return (await getAssessmentGrades(assessment.id)).find((grade) => grade.student_id === student.id);
  }

  async function saveAssessmentGrades(assessmentId, gradeInputs, options = {}) {
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) throw new Error("Avaliacao nao encontrada.");
    assertActiveAssessmentClass(assessment);
    if (assessment.status === "archived") throw new Error("Avaliacao arquivada nao pode ser alterada.");
    const currentGrades = await getAssessmentGrades(assessment.id);
    const { operations, reason } = prepareAssessmentGradeOperations(
      assessment,
      currentGrades,
      gradeInputs,
      options
    );
    await ensureSchema();
    await sql.transaction((txn) => operations.flatMap((operation) => {
      const queries = [];
      if (assessment.status === "published" && operation.changed) {
        queries.push(txn`
          INSERT INTO assessment_grade_revisions (assessment_id,student_id,old_status,old_ot_score,old_wt_score,new_status,new_ot_score,new_wt_score,reason,professor_id)
          VALUES (${assessment.id},${operation.studentId},${operation.previous.status},${operation.previous.ot_score},${operation.previous.wt_score},${operation.grade.status},${operation.grade.ot_score},${operation.grade.wt_score},${reason},${options.professorId || null})
        `);
      }
      queries.push(txn`
        UPDATE assessment_grades SET status=${operation.grade.status}, ot_score=${operation.grade.ot_score},
          wt_score=${operation.grade.wt_score}, teacher_note=${operation.note}, updated_at=NOW()
        WHERE assessment_id=${assessment.id} AND student_id=${operation.studentId}
      `);
      return queries;
    }));
    await query("UPDATE assessments SET updated_at=NOW() WHERE id=$1", [assessment.id]);
    return getAssessmentGrades(assessment.id);
  }

  async function getAssessmentGradeRevisions(assessmentId, studentId = null) {
    const params = [assessmentId];
    let filter = "";
    if (studentId !== null && studentId !== undefined) {
      filter = "AND r.student_id=$2";
      params.push(studentId);
    }
    return (await query(`
      SELECT r.*, s.name AS student_name, p.display_name AS professor_name
      FROM assessment_grade_revisions r JOIN students s ON s.id=r.student_id
      LEFT JOIN professors p ON p.id=r.professor_id
      WHERE r.assessment_id=$1 ${filter} ORDER BY r.created_at DESC, r.id DESC
    `, params)).map(mapGradeRevision);
  }

  async function getStudentAssessments(studentId, options = {}) {
    const publishedOnly = options.publishedOnly !== false;
    return (await query(`
      SELECT ag.*, a.title, a.description, a.assessment_date, a.status AS assessment_status,
        a.counts_for_ranking, a.published_at, c.book AS class_book, c.archived_at AS class_archived_at
      FROM assessment_grades ag JOIN assessments a ON a.id=ag.assessment_id
      JOIN classes c ON c.id=a.class_id
      WHERE ag.student_id=$1 ${publishedOnly ? "AND a.status='published'" : ""}
      ORDER BY a.assessment_date ASC, a.sort_order ASC, a.id ASC
    `, [studentId])).map(mapAssessmentGradeRow);
  }

  async function getStudentAcademicSummary(studentId) {
    const grades = (await getStudentAssessments(studentId)).filter(
      (grade) => Boolean(grade.counts_for_ranking) && !grade.class_archived_at
    );
    return calculateAcademicSummary(grades);
  }

  async function getAssessmentPerformanceReport(assessmentId, studentId) {
    return mapAssessmentPerformanceReport(await queryOne(
      "SELECT * FROM assessment_performance_reports WHERE assessment_id=$1 AND student_id=$2",
      [assessmentId, studentId]
    ));
  }

  async function updateAssessmentPerformanceReport(assessmentId, studentId, report, options = {}) {
    const assessment = await getAssessmentById(assessmentId);
    const grade = assessment ? (await getAssessmentGrades(assessmentId)).find((item) => item.student_id === Number(studentId)) : null;
    if (!assessment || !grade) throw new Error("Avaliacao ou aluno nao encontrado.");
    assertActiveAssessmentClass(assessment);
    if (assessment.status === "archived") throw new Error("Avaliacao arquivada nao pode ser alterada.");
    const normalized = normalizeAssessmentPerformanceReport(report);
    return mapAssessmentPerformanceReport(await queryOne(`
      INSERT INTO assessment_performance_reports (assessment_id,student_id,participation,grammar_vocabulary,homework,behavior,comments,updated_by_professor_id,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (assessment_id,student_id) DO UPDATE SET participation=EXCLUDED.participation,
        grammar_vocabulary=EXCLUDED.grammar_vocabulary, homework=EXCLUDED.homework, behavior=EXCLUDED.behavior,
        comments=EXCLUDED.comments, updated_by_professor_id=EXCLUDED.updated_by_professor_id, updated_at=EXCLUDED.updated_at
      RETURNING *
    `, [assessment.id, grade.student_id, normalized.participation, normalized.grammarVocabulary, normalized.homework, normalized.behavior, normalized.comments, options.professorId || null]));
  }

  async function getOralTemplateQuestions(templateId) {
    return (await query(`
      SELECT * FROM oral_test_template_questions
      WHERE template_id=$1
      ORDER BY position ASC, id ASC
    `, [templateId])).map(mapOralQuestionRow);
  }

  async function getAssessmentOralQuestions(oralTestId) {
    return (await query(`
      SELECT * FROM assessment_oral_test_questions
      WHERE oral_test_id=$1
      ORDER BY position ASC, id ASC
    `, [oralTestId])).map(mapOralQuestionRow);
  }

  async function getOralTestTemplates(professorId, options = {}) {
    const includeArchived = Boolean(options.includeArchived);
    return (await query(`
      SELECT t.*, COUNT(q.id)::int AS question_count
      FROM oral_test_templates t
      LEFT JOIN oral_test_template_questions q ON q.template_id=t.id
      WHERE t.professor_id=$1 ${includeArchived ? "" : "AND t.archived_at IS NULL"}
      GROUP BY t.id
      ORDER BY t.updated_at DESC, t.id DESC
    `, [professorId])).map(mapOralTestTemplateRow);
  }

  async function getOralTestTemplateById(templateId) {
    const template = mapOralTestTemplateRow(await queryOne("SELECT * FROM oral_test_templates WHERE id=$1", [templateId]));
    if (!template) return null;
    return { ...template, questions: await getOralTemplateQuestions(template.id) };
  }

  async function createOralTestTemplate(professorId, payload) {
    const normalized = normalizeOralTemplatePayload(payload);
    const inserted = await queryOne(`
      INSERT INTO oral_test_templates (professor_id,title,description)
      VALUES ($1,$2,$3) RETURNING id
    `, [professorId, normalized.title, normalized.description]);
    for (const question of normalized.questions) {
      await query(`
        INSERT INTO oral_test_template_questions (template_id,position,prompt,teacher_note,weight)
        VALUES ($1,$2,$3,$4,$5)
      `, [inserted.id, question.position, question.prompt, question.teacherNote, question.weight]);
    }
    return getOralTestTemplateById(inserted.id);
  }

  async function updateOralTestTemplate(templateId, payload, options = {}) {
    const template = await getOralTestTemplateById(templateId);
    assertOralTemplateOwner(template, options.professorId ?? template?.professor_id);
    const normalized = normalizeOralTemplatePayload(payload);
    await query("UPDATE oral_test_templates SET title=$1, description=$2, updated_at=NOW() WHERE id=$3", [normalized.title, normalized.description, template.id]);
    await query("DELETE FROM oral_test_template_questions WHERE template_id=$1", [template.id]);
    for (const question of normalized.questions) {
      await query(`
        INSERT INTO oral_test_template_questions (template_id,position,prompt,teacher_note,weight)
        VALUES ($1,$2,$3,$4,$5)
      `, [template.id, question.position, question.prompt, question.teacherNote, question.weight]);
    }
    return getOralTestTemplateById(template.id);
  }

  async function archiveOralTestTemplate(templateId, professorId) {
    const template = await getOralTestTemplateById(templateId);
    assertOralTemplateOwner(template, professorId);
    await query("UPDATE oral_test_templates SET archived_at=COALESCE(archived_at,NOW()), updated_at=NOW() WHERE id=$1", [template.id]);
    return getOralTestTemplateById(template.id);
  }

  async function duplicateOralTestTemplate(templateId, professorId) {
    const template = await getOralTestTemplateById(templateId);
    assertOralTemplateOwner(template, professorId);
    return createOralTestTemplate(professorId, {
      title: `${template.title} - copia`,
      description: template.description,
      questions: template.questions,
    });
  }

  async function getAssessmentOralTestById(oralTestId) {
    const oralTest = mapAssessmentOralTestRow(await queryOne("SELECT * FROM assessment_oral_tests WHERE id=$1", [oralTestId]));
    if (!oralTest) return null;
    return { ...oralTest, questions: await getAssessmentOralQuestions(oralTest.id) };
  }

  async function getAssessmentOralTest(assessmentId) {
    const oralTest = mapAssessmentOralTestRow(await queryOne("SELECT * FROM assessment_oral_tests WHERE assessment_id=$1", [assessmentId]));
    if (!oralTest) return null;
    return { ...oralTest, questions: await getAssessmentOralQuestions(oralTest.id) };
  }

  async function attachOralTemplateToAssessment(assessmentId, templateId, professorId) {
    const assessment = await getAssessmentById(assessmentId);
    if (!assessment) throw new Error("Avaliacao nao encontrada.");
    assertActiveAssessmentClass(assessment);
    if (assessment.status !== "draft") throw new Error("Modelo oral so pode ser definido em avaliacao em rascunho.");
    if (Number(assessment.class_professor_id) !== Number(professorId)) throw new Error("Avaliacao nao encontrada.");
    const template = await getOralTestTemplateById(templateId);
    assertOralTemplateOwner(template, professorId);
    const existing = await getAssessmentOralTest(assessment.id);
    if (existing) {
      const attempts = await queryOne("SELECT COUNT(*)::int AS total FROM assessment_oral_attempts WHERE oral_test_id=$1", [existing.id]);
      if (attempts.total > 0) throw new Error("Prova oral ja aplicada nao pode trocar de modelo.");
      await query("DELETE FROM assessment_oral_test_questions WHERE oral_test_id=$1", [existing.id]);
      await query("DELETE FROM assessment_oral_tests WHERE id=$1", [existing.id]);
    }
    const inserted = await queryOne(`
      INSERT INTO assessment_oral_tests (assessment_id,source_template_id,title,description,created_by_professor_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING id
    `, [assessment.id, template.id, template.title, template.description, professorId]);
    for (const question of template.questions) {
      await query(`
        INSERT INTO assessment_oral_test_questions (oral_test_id,position,prompt,teacher_note,weight)
        VALUES ($1,$2,$3,$4,$5)
      `, [inserted.id, question.position, question.prompt, question.teacher_note || "", question.weight || 1]);
    }
    return getAssessmentOralTestById(inserted.id);
  }

  async function getAssessmentOralRoster(assessmentId) {
    const oralTest = await getAssessmentOralTest(assessmentId);
    if (!oralTest) return [];
    return (await query(`
      SELECT s.id AS student_id, s.name AS student_name, COALESCE(SUM(pt.points),0)::int AS total_points,
        ag.status AS grade_status, ag.ot_score, ag.wt_score,
        attempt.id AS attempt_id, attempt.status AS attempt_status, attempt.score_hundredths,
        attempt.observation, attempt.completed_at
      FROM assessment_grades ag
      JOIN students s ON s.id=ag.student_id
      LEFT JOIN point_transactions pt ON pt.student_id=s.id
      LEFT JOIN assessment_oral_attempts attempt ON attempt.oral_test_id=$1 AND attempt.student_id=s.id
      WHERE ag.assessment_id=$2
      GROUP BY s.id, ag.status, ag.ot_score, ag.wt_score, attempt.id
      ORDER BY total_points DESC, s.name ASC
    `, [oralTest.id, assessmentId])).map(mapOralRosterRow);
  }

  async function getOralAttempt(oralTestId, studentId) {
    const attempt = mapOralAttemptRow(await queryOne(`
      SELECT * FROM assessment_oral_attempts WHERE oral_test_id=$1 AND student_id=$2
    `, [oralTestId, studentId]));
    if (!attempt) return null;
    return {
      ...attempt,
      answers: (await query("SELECT * FROM assessment_oral_answers WHERE attempt_id=$1 ORDER BY question_id ASC", [attempt.id])).map(mapOralAnswerRow),
    };
  }

  async function saveOralAttempt(oralTestId, studentId, answers, options = {}) {
    const oralTest = await getAssessmentOralTestById(oralTestId);
    const assessment = oralTest ? await getAssessmentById(oralTest.assessment_id) : null;
    const grade = assessment ? (await getAssessmentGrades(assessment.id)).find((item) => item.student_id === Number(studentId)) : null;
    if (!oralTest || !assessment || !grade) throw new Error("Prova oral ou aluno nao encontrado.");
    assertActiveAssessmentClass(assessment);
    if (assessment.status === "archived") throw new Error("Avaliacao arquivada nao pode ser alterada.");
    const previous = await getOralAttempt(oralTest.id, studentId);
    const preparedAttempt = prepareOralAttemptSave({
      assessment,
      oralTest,
      previousAttempt: previous,
      answers,
      options,
    });

    let attemptId = previous?.id;
    if (previous) {
      await query(`
        UPDATE assessment_oral_attempts
        SET status=$1, score_hundredths=$2, observation=$3,
          completed_at=CASE WHEN $4 THEN COALESCE(completed_at,NOW()) ELSE completed_at END,
          synced_to_ot_at=CASE WHEN $4 THEN COALESCE(synced_to_ot_at,NOW()) ELSE synced_to_ot_at END,
          updated_at=NOW()
        WHERE id=$5
      `, [
        preparedAttempt.status,
        preparedAttempt.score,
        preparedAttempt.observation,
        preparedAttempt.complete,
        previous.id,
      ]);
    } else {
      const inserted = await queryOne(`
        INSERT INTO assessment_oral_attempts (
          oral_test_id, assessment_id, student_id, status, score_hundredths,
          observation, synced_to_ot_at, completed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,${preparedAttempt.complete ? "NOW()" : "NULL"},${preparedAttempt.complete ? "NOW()" : "NULL"})
        RETURNING id
      `, [
        oralTest.id,
        assessment.id,
        Number(studentId),
        preparedAttempt.status,
        preparedAttempt.score,
        preparedAttempt.observation,
      ]);
      attemptId = inserted.id;
    }
    if (preparedAttempt.changedCompletedScore) {
      await query(`
        INSERT INTO assessment_oral_attempt_revisions (attempt_id,student_id,old_score_hundredths,new_score_hundredths,reason,professor_id)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [
        attemptId,
        Number(studentId),
        previous.score_hundredths,
        preparedAttempt.score,
        preparedAttempt.reason || "Alteracao de avaliacao oral",
        options.professorId || null,
      ]);
    }
    await query("DELETE FROM assessment_oral_answers WHERE attempt_id=$1", [attemptId]);
    for (const answer of preparedAttempt.answered) {
      await query(`
        INSERT INTO assessment_oral_answers (attempt_id,question_id,result)
        VALUES ($1,$2,$3)
      `, [attemptId, answer.questionId, answer.result]);
    }
    if (preparedAttempt.complete) {
      await query("UPDATE assessment_oral_tests SET locked_at=COALESCE(locked_at,NOW()), updated_at=NOW() WHERE id=$1", [oralTest.id]);
    }
    return getOralAttempt(oralTest.id, studentId);
  }

  async function saveOralAttemptDraft(oralTestId, studentId, answers, options = {}) {
    return saveOralAttempt(oralTestId, studentId, answers, { ...options, complete: false });
  }

  async function completeOralAttempt(oralTestId, studentId, answers, options = {}) {
    return saveOralAttempt(oralTestId, studentId, answers, { ...options, complete: true });
  }

  async function deleteStudent(studentId) {
    const numericId = Number(studentId);
    const existing = await getStudentById(numericId);
    if (!existing) {
      throw new Error("Aluno nao encontrado.");
    }

    await ensureSchema();
    const attempts = await query("SELECT id FROM assessment_oral_attempts WHERE student_id=$1", [numericId]);
    for (const attempt of attempts) {
      await query("DELETE FROM assessment_oral_attempt_revisions WHERE attempt_id=$1", [attempt.id]);
      await query("DELETE FROM assessment_oral_answers WHERE attempt_id=$1", [attempt.id]);
    }
    await query("DELETE FROM assessment_oral_attempts WHERE student_id=$1", [numericId]);
    await sql.transaction((txn) => [
      txn`DELETE FROM assessment_grade_revisions WHERE student_id = ${numericId}`,
      txn`DELETE FROM assessment_performance_reports WHERE student_id = ${numericId}`,
      txn`DELETE FROM assessment_grades WHERE student_id = ${numericId}`,
      txn`DELETE FROM student_performance_profiles WHERE student_id = ${numericId}`,
      txn`DELETE FROM point_transactions WHERE student_id = ${numericId}`,
      txn`DELETE FROM students WHERE id = ${numericId}`,
    ]);

    return existing;
  }

  async function addPoints(studentId, category, points, note, options = {}) {
    const student = await getStudentById(studentId);
    if (!student) {
      throw new Error("Aluno nao encontrado.");
    }

    const validated = validatePoints(category, points, note);
    const batchId = options.batchId || createToken();
    return mapPointTransaction(
      await queryOne(
        `
          INSERT INTO point_transactions (student_id, category, points, note, batch_id)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, student_id, category, points, note, batch_id, created_at
        `,
        [studentId, validated.category, validated.points, validated.note, batchId]
      )
    );
  }

  async function addPointsBulk(studentIds, category, points, note) {
    const normalizedIds = normalizeStudentIds(studentIds, "Selecione pelo menos um aluno.");

    const validated = validatePoints(category, points, note);
    const existingIds = await query(
      "SELECT id FROM students WHERE id = ANY($1::int[]) ORDER BY id ASC",
      [normalizedIds]
    );

    if (existingIds.length !== normalizedIds.length) {
      throw new Error("Aluno nao encontrado.");
    }

    await ensureSchema();
    const batchId = createToken();
    const insertedRows = await sql.transaction((txn) =>
      normalizedIds.map((studentId) =>
        txn`
          INSERT INTO point_transactions (student_id, category, points, note, batch_id)
          VALUES (${studentId}, ${validated.category}, ${validated.points}, ${validated.note}, ${batchId})
          RETURNING id, student_id, category, points, note, batch_id, created_at
        `
      )
    );

    return insertedRows.map((rows) => mapPointTransaction(rows[0]));
  }

  async function undoLatestPointBatch(studentIds) {
    const normalizedIds = normalizeStudentIds(studentIds, "Nenhum aluno disponivel para desfazer.");

    const latest = await queryOne(
      `
        SELECT id, batch_id
        FROM point_transactions
        WHERE student_id = ANY($1::int[])
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [normalizedIds]
    );

    if (!latest) {
      throw new Error("Nao ha lancamentos para desfazer.");
    }

    const result = latest.batch_id
      ? await query(
          "DELETE FROM point_transactions WHERE batch_id = $1 AND student_id = ANY($2::int[]) RETURNING id",
          [latest.batch_id, normalizedIds]
        )
      : await query("DELETE FROM point_transactions WHERE id = $1 RETURNING id", [latest.id]);

    return result.length;
  }

  async function getStudentHistory(studentId) {
    return (await query(
      `
        SELECT id, student_id, category, points, note, batch_id, created_at
        FROM point_transactions
        WHERE student_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [studentId]
    )).map(mapPointTransaction);
  }

  async function getStudentTotals(studentId) {
    const rows = await query(
      `
        SELECT category, COALESCE(SUM(points), 0)::int AS total
        FROM point_transactions
        WHERE student_id = $1
        GROUP BY category
      `,
      [studentId]
    );

    return buildStudentTotals(rows);
  }

  async function getStudentSummaryByToken(token) {
    const student = await getStudentByToken(token);
    if (!student) {
      return null;
    }

    const history = await getStudentHistory(student.id);

    return {
      student,
      totals: await getStudentTotals(student.id),
      academic: await getStudentAcademicSummary(student.id),
      assessments: await getStudentAssessments(student.id),
      penalties: history.filter((item) => item.category === "bad_behavior"),
    };
  }

  return {
    db: null,
    filename: null,
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
    async close() {},
  };
}

module.exports = {
  createPostgresStore,
};
