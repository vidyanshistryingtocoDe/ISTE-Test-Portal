const ALLOWED_BRANCHES = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'OTHER'];
const ID_PATTERN = /^[A-Z0-9-]{3,20}$/;
const OPTION_KEYS = ['A', 'B', 'C', 'D'];

function sanitizeText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

export function validateRegistration(formData) {
  const name = sanitizeText(formData.name);
  const rollNumber = sanitizeText(formData.rollNumber).toUpperCase();
  const email = sanitizeText(formData.email).toLowerCase();
  const branch = formData.branch;

  if (name.length < 3 || name.length > 100 || !/^[A-Za-z .'-]+$/.test(name)) {
    return { ok: false, message: 'Enter a valid name (letters, spaces, ., \', - only).' };
  }
  if (!ID_PATTERN.test(rollNumber)) {
    return { ok: false, message: 'Roll number must be 3-20 letters, digits, or hyphens.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  if (!ALLOWED_BRANCHES.includes(branch)) {
    return { ok: false, message: 'Select a valid branch.' };
  }

  return { ok: true, data: { name, rollNumber, email, branch } };
}

export function validateSubmission({ candidateId, answers }) {
  const cleanId = sanitizeText(candidateId).toUpperCase();
  if (!ID_PATTERN.test(cleanId)) {
    return { ok: false, message: 'Invalid candidate id - please register again.' };
  }
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    return { ok: false, message: 'Invalid answers payload.' };
  }

  // Drop anything that isn't a recognised A/B/C/D value before it ever
  // reaches Firestore - purely a data-quality nicety here, since the
  // real safety net (rules can't overwrite another candidate's doc,
  // can't be submitted twice, can't happen while the test is closed) is
  // already enforced server-side regardless of what this produces.
  const cleanAnswers = {};
  for (const [questionId, value] of Object.entries(answers)) {
    if (typeof value === 'string' && OPTION_KEYS.includes(value)) {
      cleanAnswers[questionId] = value;
    }
  }

  return { ok: true, data: { candidateId: cleanId, answers: cleanAnswers } };
}
