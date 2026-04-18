const { Schema, model } = require('mongoose');
const { ROLES } = require('../constants/roles');

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 64,
      trim: true,
      lowercase: true
    },
    password_hash: {
      type: String,
      required: true
    },
    roles: {
      type: [String],
      enum: ROLES,
      default: []
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'DISABLED'],
      default: 'ACTIVE'
    },
    failed_login_count: {
      type: Number,
      default: 0
    },
    failed_login_window_started_at: {
      type: Date,
      default: null
    },
    lockout_until: {
      type: Date,
      default: null
    },
    last_login_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ roles: 1 });

module.exports = model('User', userSchema, 'users');
