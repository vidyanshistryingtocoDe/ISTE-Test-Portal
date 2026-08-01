/**
 * One-time (or occasional) admin script that uploads the question bank
 * as TWO Firestore documents:
 *
 *   config/testConfig  - id, text, options only. This is the doc
 *                         candidates' browsers are allowed to read
 *                         (see firestore.rules).
 *   config/answerKey   - questionId -> correctAnswer map. Rules deny
 *                         read/write to everyone; only this script
 *                         (Admin SDK) and seed/gradeSubmissions.js ever
 *                         touch it.
 *
 * This script runs on YOUR machine with a service account key - it
 * never gets deployed to Firebase, so it doesn't need the Blaze plan.
 * Only *deploying compute* (Cloud Functions) needs Blaze; running the
 * Admin SDK locally against Firestore does not.
 *
 * Usage:
 *   1. Firebase console > Project settings > Service accounts >
 *      Generate new private key. Save as serviceAccountKey.json in this
 *      seed/ folder (already gitignored).
 *   2. npm install firebase-admin   (run inside this seed/ folder)
 *   3. GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node seedConfig.js
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp();
const db = admin.firestore();

async function main() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'questions.sample.json'), 'utf8')
  );

  const publicQuestions = raw.map(({ id, text, options }) => ({ id, text, options }));
  const answerMap = Object.fromEntries(raw.map((q) => [q.id, q.correctAnswer]));

  await db.collection('config').doc('testConfig').set({
    registrationOpen: true,
    testOpen: false, // flip to true when the exam window actually starts
    durationSeconds: 15 * 60,
    questions: publicQuestions,
  });

  await db.collection('config').doc('answerKey').set({
    answers: answerMap,
  });

  console.log(`Uploaded ${publicQuestions.length} questions (public) + answer key (private).`);
  console.log('testOpen is false. Flip it with openTest.js when the exam begins.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
