const { Schema, model } = require('mongoose');

const authEventSchema = new Schema(
  {
    event_type: {
      type: String,
      required: true,
      enum: [
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'LOCKOUT_TRIGGERED',
        'LOGOUT',
        'STEP_UP_SUCCESS',
        'STEP_UP_FAILURE'
      ]
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    username: {
      type: String,
      default: null
    },
    ip_address: {
      type: String,
      default: null
    },
    user_agent: {
      type: String,
      default: null
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false
  }
);

authEventSchema.index({ event_type: 1, created_at: -1 });
authEventSchema.index({ user_id: 1, created_at: -1 });

module.exports = model('AuthEvent', authEventSchema, 'auth_events');
