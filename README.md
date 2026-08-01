# ISTE Test Portal - Firestore backend (Spark / free plan)

Same goals as before - secure against injection, handles 1000+ concurrent
candidates without exhausting quota - but built without Cloud Functions,
since **Cloud Functions requires the Blaze (pay-as-you-go) plan with no
exception for low usage**. This version never needs a billing account.

## What changed from the Cloud Functions version

The frontend now talks to Firestore directly with the client SDK.
Firestore Security Rules (`firestore.rules`) are no longer a backstop
behind an API layer - they're the *entire* security boundary. Every
check that used to be a line of JavaScript in a Cloud Function is now a
line of rules language instead. The one real capability this trades
away: there's no trusted server left to compute a score at submit time,
so grading happens **offline**, via a script you run on your own laptop
after the test (`seed/gradeSubmissions.js`) - which is free regardless
of plan, since nothing about running the Admin SDK locally touches
Firebase's paid tier. Only *deploying compute to Firebase* (Cloud
Functions, App Hosting) requires Blaze; using the Admin SDK from your
own machine does not.

## Data model

| Location | Client access |
|---|---|
| `config/testConfig` | Read-only. Question bank (`id`, `text`, `options` - no answers) + `registrationOpen`/`testOpen` flags. |
| `config/answerKey` | No access at all, ever. `{ questionId: correctAnswer }`. Only touched by `seed/` scripts via the Admin SDK. |
| `candidates/{rollNumber}` | Create-only. Roll number is the doc ID. |
| `responses/{rollNumber}` | Create-only. Same ID as the candidate doc. |

## Injection protection

Same underlying concern as before: Firestore document IDs double as
paths, so an unvalidated roll number containing `/` could make Firestore
read it as a nested path rather than a literal ID - this database's
version of a SQL injection, since it changes *which record* a write
touches. `firestore.rules` closes this the same way the old
`validation.js` did, just enforced by the database itself now:

- `candidateId.matches('^[A-Z0-9-]{3,20}$')` runs on every create,
  server-side, regardless of what any client-side code does or doesn't
  check first.
- Every other field is validated inline in the rule: `branch in [...]`
  is an explicit allow-list, `email.matches(...)` is checked, and
  `keys().hasOnly([...])` means a write containing any field outside
  that exact list - like an attempted `score` override - is rejected
  outright.
- `config/answerKey` has `allow read, write: if false` with no
  conditions whatsoever. There's no code path, correct or malicious,
  client-side or not, that can make Firestore hand that document to a
  browser.

`frontend-integration/validation.js` repeats a subset of these checks in
JS purely so the UI can show a friendly inline error instead of a raw
Firestore error - it is explicitly documented in that file as non-
authoritative, since a client could always bypass it and call Firestore
directly. The rules are what actually holds.

## Handling 1000+ concurrent users without exhausting quota

Spark's Firestore quota: **50,000 reads/day, 20,000 writes/day**, reset
daily. One thing that's easy to undercount: every `get()`/`exists()`
call *inside a security rule* is billed as a read too, not just the
client's own reads. For a single test day, 1000 candidates:

| Operation | Reads | Writes |
|---|---|---|
| Registration - 1 write, plus the rule's `get(config/testConfig)` + `exists(candidates/id)` checks | 2,000 | 1,000 |
| Questions - each candidate's own `getDoc(config/testConfig)` | 1,000 | - |
| Submission - 1 write, plus the rule's `exists(candidates/id)` + `get(config/testConfig)` + `exists(responses/id)` checks | 3,000 | 1,000 |
| **Total** | **~6,000** | **~2,000** |

That's about 12% of the daily read quota and 10% of the daily write
quota - comfortable headroom even if the estimate is off by 2-3x, and
nowhere near the point where Spark would shut the product off for the
rest of the day. The bursty pattern (many candidates submitting near
the timer's end) doesn't change this math - Firestore's daily quota
doesn't care about the shape of traffic within the day, only the total.

If you were ever running something bigger - multiple test sessions
per day, or several thousand candidates - this is exactly the point
where you'd want the Blaze-plan Cloud Functions version instead, since
Blaze's no-cost quotas are higher and don't hard-stop your app when
exceeded (you'd just pay a small amount for the overage).

## App Check

Firestore rules check `request.app != null` on every read/write, which
is satisfied by `initializeAppCheck()` in `firebaseClient.js`. This is
free on both plans and is what stops a script or bot from hammering
Firestore with fake registrations/submissions to run up your daily
quota - it rejects requests that don't carry a token proving they came
from your actual deployed web app, before they ever reach a rule
evaluation.

**Important**: after registering your app with reCAPTCHA v3 in the
console, App Check starts in **monitor mode**. Verify real traffic is
generating valid tokens (console > App Check > Firestore > metrics)
before switching it to **Enforce** - enforcing too early, before your
frontend is actually deployed with `initializeAppCheck()` wired up, will
lock out every request including your own testing.

## Setup

1. **Create/select a Firebase project**, enable **Firestore** (Native
   mode) - **stay on the Spark plan**, no billing account needed.

2. **Enable App Check**: console > Build > App Check > register your
   web app with reCAPTCHA v3, copy the site key into your frontend's
   `.env`.

3. **Install the Firebase CLI** if you don't have it:
   ```
   npm install -g firebase-tools
   firebase login
   ```

4. From this `iste-backend-spark/` folder:
   ```
   firebase use --add          # select your project
   ```

5. **Deploy the rules**:
   ```
   firebase deploy --only firestore:rules
   ```

6. **Seed the question bank** (edit `seed/questions.sample.json` first
   with your real questions and answers):
   ```
   cd seed
   npm install firebase-admin
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node seedConfig.js
   cd ..
   ```
   Get `serviceAccountKey.json` from console > Project settings >
   Service accounts > Generate new private key. Never commit it
   (already gitignored).

7. **Wire up the frontend**: follow
   `frontend-integration/INTEGRATION_NOTES.md`.

8. **Enforce App Check** for Firestore in the console once you've
   confirmed real traffic works (see the App Check section above).

9. **Open the test** when the exam window starts:
   ```
   cd seed
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node openTest.js test open
   ```

10. **Close it** afterwards:
    ```
    node openTest.js test close
    ```

11. **Grade submissions**:
    ```
    GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node gradeSubmissions.js
    ```
    Writes `seed/grades.csv` with candidateId, name, email, branch,
    score, totalQuestions, submittedAt.

## Files

```
iste-backend-spark/
├── firebase.json
├── firestore.rules            # the entire security boundary now
├── firestore.indexes.json     # empty - no queries need indexes
├── seed/
│   ├── questions.sample.json    # replace with your real questions + answers
│   ├── seedConfig.js            # splits into config/testConfig + config/answerKey
│   ├── openTest.js              # flips registrationOpen/testOpen
│   └── gradeSubmissions.js      # offline grading -> grades.csv
└── frontend-integration/
    ├── firebaseClient.js         # Firebase app + Firestore + App Check
    ├── validation.js             # client-side UX checks (not authoritative)
    ├── testApi.js                # drop-in replacement for the placeholder
    ├── .env.example
    └── INTEGRATION_NOTES.md
```
