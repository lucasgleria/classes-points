function normalizeStudentIds(studentIds, emptyMessage) {
  const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
  const normalizedIds = ids
    .map((studentId) => Number(studentId))
    .filter((studentId) => Number.isInteger(studentId) && studentId > 0);

  if (!normalizedIds.length) {
    throw new Error(emptyMessage);
  }

  return normalizedIds;
}

function buildStudentTotals(rows) {
  const totals = {
    homework: 0,
    games: 0,
    challenges: 0,
    presence: 0,
    bad_behavior: 0,
    total: 0,
  };

  for (const row of rows) {
    totals[row.category] = Number(row.total);
    totals.total += Number(row.total);
  }

  return totals;
}

module.exports = {
  buildStudentTotals,
  normalizeStudentIds,
};
