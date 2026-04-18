const { Schema, model } = require('mongoose');

const creditLedgerSchema = new Schema(
  {
    participant_id: { type: String, required: true },
    program_type: { type: String, required: true },
    balance: { type: Number, default: 0 }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
  }
);

creditLedgerSchema.index({ participant_id: 1, program_type: 1 }, { unique: true });

module.exports = model('CreditLedger', creditLedgerSchema, 'credit_ledgers');
