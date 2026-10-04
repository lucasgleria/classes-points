const {
  normalizePerformanceComments,
  normalizePerformanceRating,
  validatePerformanceRating,
} = require("../db-common");

function normalizeStudentPerformanceProfile(profile) {
  return {
    participation: normalizePerformanceRating(profile.participation),
    grammarVocabulary: normalizePerformanceRating(profile.grammarVocabulary),
    homework: normalizePerformanceRating(profile.homework),
    behavior: normalizePerformanceRating(profile.behavior),
    comments: normalizePerformanceComments(profile.comments),
  };
}

function normalizeAssessmentPerformanceReport(report) {
  return {
    participation: validatePerformanceRating(report.participation),
    grammarVocabulary: validatePerformanceRating(report.grammarVocabulary),
    homework: validatePerformanceRating(report.homework),
    behavior: validatePerformanceRating(report.behavior),
    comments: normalizePerformanceComments(report.comments),
  };
}

module.exports = {
  normalizeAssessmentPerformanceReport,
  normalizeStudentPerformanceProfile,
};
