const bcrypt = require('bcryptjs');
const config = require('../config');

const hasComplexity = (password) => {
  if (typeof password !== 'string') {
    return false;
  }

  const checks = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
  return checks.every((pattern) => pattern.test(password));
};

const validatePasswordStrength = (password) => {
  if (typeof password !== 'string' || password.length < config.auth.minPasswordLength) {
    return {
      valid: false,
      message: `password must be at least ${config.auth.minPasswordLength} characters`
    };
  }

  if (!hasComplexity(password)) {
    return {
      valid: false,
      message: 'password must include uppercase, lowercase, number, and symbol'
    };
  }

  return { valid: true };
};

const hashPassword = async (password) => bcrypt.hash(password, 12);
const verifyPassword = async (password, hash) => bcrypt.compare(password, hash);

module.exports = {
  validatePasswordStrength,
  hashPassword,
  verifyPassword
};
