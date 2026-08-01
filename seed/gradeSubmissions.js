/**
 * Runs after the test window closes. Reads every response and the
 * private answer key (both only reachable via the Admin SDK, since
 * firestore.rules blocks all client access to them), computes each
 * candidate's score, and writes a CSV.
 *
 * This is where "correct answers never touch the client" pays off:
 * grading happens here, on your machine, using data no candidate's
 * browser was ever able to see - it's not a matter of trusting them not
 * to look, they structurally couldn't.
 *
 * Note this script also does its own sanitization pass: it only counts
 * an answer as correct if the stored value is exactly the letter the
 * answer key expects. Firestore rules validate the *shape* of a
 * response at write time (known fields, answers is a map) but can't
 * cheaply validate "every value is A/B/C/D" without hardcoding the
 * question list into the rules themselves - so any stray value here
 * simply won't match anything and counts as wrong, which is all the
 * protection this actually needs.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node gradeSubmissions.js
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp();
const db = admin.firestore();

function toCsvValue(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

async function main() {
  const [answerKeySnap, candidatesSnap, responsesSnap] = await Promise.all([
    db.collection('config').doc('answerKey').get(),
    db.collection('candidates').get(),
    db.collection('responses').get(),
  ]);

  if (!answerKeySnap.exists) {
    throw new Error('config/answerKey not found - run seedConfig.js first.');
  }
  const correctAnswers = answerKeySnap.data().answers || {};
  const totalQuestions = Object.keys(correctAnswers).length;

  const candidatesById = new Map();
  candidatesSnap.forEach((doc) => candidatesById.set(doc.id, doc.data()));

  const rows = [['candidateId', 'name', 'email', 'branch', 'score', 'totalQuestions', 'submittedAt']];

  responsesSnap.forEach((doc) => {
    const { candidateId, answers, submittedAt } = doc.data();
    const candidate = candidatesById.get(candidateId) || {};

    let score = 0;
    for (const [questionId, correct] of Object.entries(correctAnswers)) {
      if (answers?.[questionId] === correct) score += 1;
    }

    rows.push([
      candidateId,
      candidate.name || '',
      candidate.email || '',
      candidate.branch || '',
      score,
      totalQuestions,
      submittedAt ? submittedAt.toDate().toISOString() : '',
    ]);
  });

  const csv = rows.map((row) => row.map(toCsvValue).join(',')).join('\n');
  const outPath = path.join(__dirname, 'grades.csv');
  fs.writeFileSync(outPath, csv);

  console.log(`Graded ${responsesSnap.size} submissions out of ${candidatesSnap.size} registered candidates.`);
  console.log(`Wrote ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
