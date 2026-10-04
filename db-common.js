const { randomUUID } = require("node:crypto");

function slugifyName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function createPassword() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "x");
}

function createToken() {
  return randomUUID();
}

function normalizeToken(token) {
  return typeof token === "string" ? token.trim() : "";
}

function normalizeClassValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

const PERFORMANCE_RATINGS = new Set(["otimo", "bom", "precisa_melhorar"]);

function normalizePerformanceRating(value) {
  return PERFORMANCE_RATINGS.has(value) ? value : "bom";
}

function validatePerformanceRating(value) {
  if (!PERFORMANCE_RATINGS.has(value)) {
    throw new Error("Avaliacao de desempenho invalida.");
  }
  return value;
}

function normalizePerformanceComments(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildClassLabel(classroom) {
  if (!classroom) {
    return "Sem turma";
  }

  return `${classroom.book}, ${classroom.weekday}, ${classroom.start_time} \u00E0s ${classroom.end_time}`;
}

function mapClassRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    id: Number(row.id),
    professor_id:
      row.professor_id === null || row.professor_id === undefined ? null : Number(row.professor_id),
    class_label: buildClassLabel(row),
  };
}

function mapProfessorRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    id: Number(row.id),
  };
}

// O Postgres devolve colunas DATE como objeto Date; o SQLite devolve texto.
// Ambos viram "AAAA-MM-DD" para as telas tratarem um formato so.
function normalizeDateOnly(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  return value ? String(value).slice(0, 10) : null;
}

function mapAssessmentRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    assessment_date: normalizeDateOnly(row.assessment_date),
    id: Number(row.id),
    class_id: Number(row.class_id),
    sort_order: Number(row.sort_order || 0),
    counts_for_ranking: Boolean(row.counts_for_ranking),
  };
}

function mapAssessmentGradeRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    ...("assessment_date" in row ? { assessment_date: normalizeDateOnly(row.assessment_date) } : {}),
    assessment_id: Number(row.assessment_id),
    student_id: Number(row.student_id),
    ot_score: row.ot_score === null || row.ot_score === undefined ? null : Number(row.ot_score),
    wt_score: row.wt_score === null || row.wt_score === undefined ? null : Number(row.wt_score),
  };
}

function mapAssessmentPerformanceReport(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    assessment_id: Number(row.assessment_id),
    student_id: Number(row.student_id),
    updated_by_professor_id:
      row.updated_by_professor_id === null || row.updated_by_professor_id === undefined
        ? null
        : Number(row.updated_by_professor_id),
  };
}

function mapOralTestTemplateRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    id: Number(row.id),
    professor_id: Number(row.professor_id),
    question_count:
      row.question_count === undefined || row.question_count === null
        ? undefined
        : Number(row.question_count),
  };
}

function mapOralQuestionRow(row) {
  if (!row) {
    return row;
  }

  const mapped = { ...row };
  for (const field of ["id", "template_id", "oral_test_id", "position"]) {
    if (mapped[field] !== undefined && mapped[field] !== null) {
      mapped[field] = Number(mapped[field]);
    }
  }
  return mapped;
}

function mapAssessmentOralTestRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    id: Number(row.id),
    assessment_id: Number(row.assessment_id),
    source_template_id:
      row.source_template_id === null || row.source_template_id === undefined
        ? null
        : Number(row.source_template_id),
    created_by_professor_id:
      row.created_by_professor_id === null || row.created_by_professor_id === undefined
        ? null
        : Number(row.created_by_professor_id),
  };
}

function mapOralAttemptRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    id: Number(row.id),
    oral_test_id: Number(row.oral_test_id),
    assessment_id: Number(row.assessment_id),
    student_id: Number(row.student_id),
    score_hundredths:
      row.score_hundredths === null || row.score_hundredths === undefined
        ? null
        : Number(row.score_hundredths),
  };
}

function mapOralAnswerRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    attempt_id: Number(row.attempt_id),
    question_id: Number(row.question_id),
  };
}

function mapOralRosterRow(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    student_id: Number(row.student_id),
    total_points: Number(row.total_points || 0),
    ot_score: row.ot_score === null || row.ot_score === undefined ? null : Number(row.ot_score),
    wt_score: row.wt_score === null || row.wt_score === undefined ? null : Number(row.wt_score),
    attempt_id: row.attempt_id === null || row.attempt_id === undefined ? null : Number(row.attempt_id),
    score_hundredths:
      row.score_hundredths === null || row.score_hundredths === undefined
        ? null
        : Number(row.score_hundredths),
  };
}

function mapGradeRevision(row) {
  if (!row) {
    return row;
  }

  const numericFields = [
    "id",
    "assessment_id",
    "student_id",
    "old_ot_score",
    "old_wt_score",
    "new_ot_score",
    "new_wt_score",
    "professor_id",
  ];
  const mapped = { ...row };
  for (const field of numericFields) {
    if (mapped[field] !== null && mapped[field] !== undefined) {
      mapped[field] = Number(mapped[field]);
    }
  }
  return mapped;
}

function mapStudentRow(row) {
  if (!row) {
    return row;
  }

  const normalized = {
    ...row,
    id: Number(row.id),
    class_id: row.class_id === null || row.class_id === undefined ? null : Number(row.class_id),
  };

  if (normalized.total_points !== undefined) {
    normalized.total_points = Number(normalized.total_points);
  }
  if (normalized.recent_points !== undefined) {
    normalized.recent_points = Number(normalized.recent_points);
  }

  return {
    ...normalized,
    class_label:
      normalized.class_id === null
        ? "Sem turma"
        : buildClassLabel({
            book: normalized.class_book,
            weekday: normalized.class_weekday,
            start_time: normalized.class_start_time,
            end_time: normalized.class_end_time,
          }),
  };
}

function mapPointTransaction(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    id: Number(row.id),
    student_id: Number(row.student_id),
    points: Number(row.points),
  };
}

function mapPerformanceProfile(row) {
  if (!row) {
    return {
      participation: "bom",
      grammar_vocabulary: "bom",
      homework: "bom",
      behavior: "bom",
      comments: "",
      updated_at: null,
    };
  }

  return {
    student_id: Number(row.student_id),
    participation: normalizePerformanceRating(row.participation),
    grammar_vocabulary: normalizePerformanceRating(row.grammar_vocabulary),
    homework: normalizePerformanceRating(row.homework),
    behavior: normalizePerformanceRating(row.behavior),
    comments: row.comments || "",
    updated_at: row.updated_at || null,
  };
}

module.exports = {
  buildClassLabel,
  createPassword,
  createToken,
  mapClassRow,
  mapAssessmentGradeRow,
  mapAssessmentPerformanceReport,
  mapAssessmentRow,
  mapGradeRevision,
  mapAssessmentOralTestRow,
  mapOralAnswerRow,
  mapOralAttemptRow,
  mapOralQuestionRow,
  mapOralRosterRow,
  mapOralTestTemplateRow,
  mapPerformanceProfile,
  mapPointTransaction,
  mapProfessorRow,
  mapStudentRow,
  normalizeClassValue,
  normalizeDateOnly,
  normalizePerformanceComments,
  normalizePerformanceRating,
  normalizeToken,
  slugifyName,
  validatePerformanceRating,
};
