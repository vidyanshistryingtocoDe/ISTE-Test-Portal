# Wiring this into ISTE-TEST-PORTAL-main (Spark plan)

1. Install the client SDK (no other dependency needed - there's no
   `firebase/functions` import in this version):
   ```
   npm install firebase
   ```

2. Copy three files into `src/api/`:
   - `firebaseClient.js`
   - `validation.js`
   - `testApi.js` (overwrite the placeholder)

3. Copy `.env.example` to `.env` in the project root and fill in values
   from the Firebase console.

4. `Registration.jsx`, `Instructions.jsx`, and `Test.jsx` don't need any
   changes - same three exported function names and shapes as always.

5. Behavior differences from the placeholder worth knowing:
   - `getQuestions()` now throws if the test isn't open or Firestore is
     unreachable. `Test.jsx`'s existing try/catch around `loadQuestions()`
     already handles this via `loadError`.
   - Neither `registerCandidate()` nor `submitAnswers()` ever throw for
     "expected" failures (duplicate registration, already submitted,
     test closed) - they resolve with `{ success: false, message }`,
     matching what Registration.jsx and Test.jsx already check for.

6. One thing that's genuinely different from a server-backed setup:
   there's no live score shown anywhere, because nothing untrusted (the
   browser) is ever allowed to know the correct answers. If you want
   candidates to see a score, you'd need to reveal answers to the
   client at that point, which defeats the "answers are secret" and
   "candidates can't tamper with their own results" property this
   design has right now. Scores come out of `seed/gradeSubmissions.js`
   after the test.
