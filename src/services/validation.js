'use strict';
/** Input validation shared by all routes (same rules as the front-end forms). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(value, max = 255) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function normaliseEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

function isValidPhone(phone) {
  if (phone === undefined || phone === null || phone === '') return true; // optional
  if (typeof phone !== 'string') return false;
  const digits = phone.replace(/\s/g, '');
  return /^\d{1,15}$/.test(digits);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 72;
}

/** Returns the first error message, or null when the payload is valid. */
function validateRegistration({ full_name: fullName, email, password, phone }) {
  if (!isNonEmptyString(fullName, 120) || !email || !password) {
    return 'Full name, email and password are required.';
  }
  if (!isValidEmail(normaliseEmail(email))) return 'Please enter a valid email address.';
  if (!isValidPassword(password)) return 'Password must be between 6 and 72 characters.';
  if (!isValidPhone(phone)) return 'Phone must contain digits only, max 15 characters.';
  return null;
}

function validateQuery({ full_name: fullName, email, phone, query_message: message }) {
  if (!isNonEmptyString(fullName, 120) || !email || !isNonEmptyString(message, 5000)) {
    return 'Full name, email and query are required.';
  }
  if (!isValidEmail(normaliseEmail(email))) return 'Please enter a valid email address.';
  if (!isValidPhone(phone)) return 'Phone must contain digits only, max 15 characters.';
  return null;
}

const PAYMENT_METHODS = ['Credit Card', 'PayPal', 'Afterpay'];

function validateDelivery(body) {
  const required = ['full_name', 'email', 'address', 'city', 'postcode', 'payment_method'];
  if (required.some((f) => !isNonEmptyString(body[f], 255))) return 'All delivery fields are required.';
  if (!isValidEmail(normaliseEmail(body.email))) return 'Please enter a valid email address.';
  if (!/^\d{4}$/.test(String(body.postcode).trim())) return 'Postcode must be 4 digits.';
  if (!PAYMENT_METHODS.includes(body.payment_method)) return 'Unsupported payment method.';
  return null;
}

module.exports = {
  normaliseEmail,
  isValidEmail,
  isValidPhone,
  isValidPassword,
  validateRegistration,
  validateQuery,
  validateDelivery,
  PAYMENT_METHODS,
};
