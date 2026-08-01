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
