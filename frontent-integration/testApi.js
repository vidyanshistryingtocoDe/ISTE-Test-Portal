import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient.js';
import { validateRegistration, validateSubmission } from './validation.js';

/**
 * @param {{ name: string, rollNumber: string, email: string, branch: string }} formData
 * @returns {Promise<{ success: boolean, candidateId?: string, message?: string }>}
 */
export async function registerCandidate(formData) {
  const validated = validateRegistration(formData);
  if (!validated.ok) {
    return { success: false, message: validated.message };
  }
  const { name, rollNumber, email, branch } = validated.data;

  try {
    // setDoc on a document that doesn't exist yet is evaluated by
    // Firestore as a "create" - matches the `allow create` rule. If the
    // roll number is already registered, this same call is evaluated as
    // an "update" instead, which firestore.rules unconditionally denies
    // - so the SDK throws permission-denied and we can tell the
    // candidate exactly what happened.
    await setDoc(doc(db, 'candidates', rollNumber), {
      name,
      rollNumber,
      email,
      branch,
      status: 'registered',
      registeredAt: serverTimestamp(),
    });

    return { success: true, candidateId: rollNumber, message: 'Registration successful.' };
  } catch (err) {
    if (err?.code === 'permission-denied') {
      return {
        success: false,
        message: 'This roll number is already registered, or registration is currently closed.',
      };
    }
    return { success: false, message: 'Registration failed. Please try again.' };
  }
}

/**
 * @returns {Promise<Array<{ id: string, text: string, options: { A: string, B: string, C: string, D: string } }>>}
 */
export async function getQuestions() {
  const snap = await getDoc(doc(db, 'config', 'testConfig'));
  if (!snap.exists()) {
    throw new Error('Test configuration not found. Contact the test administrator.');
  }
  const config = snap.data();
  if (config.testOpen === false) {
    throw new Error('The test is not open yet.');
  }
  // config/testConfig never contains correctAnswer - that lives only in
  // config/answerKey, which firestore.rules makes unreadable by any
  // client - so there's no field-stripping to do here, unlike the
  // Cloud Functions version.
  return Array.isArray(config.questions) ? config.questions : [];
}

/**
 * @param {{ candidateId?: string, answers: Record<string, string> }} payload
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function submitAnswers(payload) {
  const validated = validateSubmission(payload);
  if (!validated.ok) {
    return { success: false, message: validated.message };
  }
  const { candidateId, answers } = validated.data;

  try {
    await setDoc(doc(db, 'responses', candidateId), {
      candidateId,
      answers,
      submittedAt: serverTimestamp(),
    });
    return { success: true, message: 'Submission successful.' };
  } catch (err) {
    if (err?.code === 'permission-denied') {
      return {
        success: false,
        message: 'This test has already been submitted, the test is closed, or the candidate is not registered.',
      };
    }
    return { success: false, message: 'Submission failed. Please try again.' };
  }
}
