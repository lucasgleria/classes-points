function normalizeProfessorId(value) {
  const professorId = Number(value);
  return Number.isInteger(professorId) && professorId > 0 ? professorId : null;
}

async function getProfessorScope(store, professorId, options = {}) {
  const allClasses = await store.getAllClasses(options);
  const classes = allClasses.filter((classroom) => Number(classroom.professor_id || 1) === professorId);
  const classIds = new Set(classes.map((classroom) => classroom.id));

  return {
    classes,
    classIds,
  };
}

function filterStudentsByScope(students, classIds) {
  return students.filter((student) => student.class_id !== null && classIds.has(student.class_id));
}

function normalizeSelectedClassId(selectedClassId, classIds) {
  if (!selectedClassId) {
    return "";
  }

  const numericId = Number(selectedClassId);
  return Number.isInteger(numericId) && classIds.has(numericId) ? String(numericId) : "";
}

function isStudentVisible(student, classIds) {
  return Boolean(student && student.class_id !== null && classIds.has(student.class_id));
}

async function buildPointsRedirectSuffix(store, professorId, rawClassId) {
  const { classIds } = await getProfessorScope(store, professorId);
  const selectedClassId = normalizeSelectedClassId(rawClassId || "", classIds);
  return selectedClassId ? `&classId=${encodeURIComponent(selectedClassId)}` : "";
}

module.exports = {
  buildPointsRedirectSuffix,
  filterStudentsByScope,
  getProfessorScope,
  isStudentVisible,
  normalizeProfessorId,
  normalizeSelectedClassId,
};
