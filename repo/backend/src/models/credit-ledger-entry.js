const { Schema, model } = require('mongoose');

const creditLedgerEntrySchema = new Schema(
  {
    ledger_id: { type: Schema.Types.ObjectId, ref: 'CreditLedger', required: true },
    entry_type: {
      type: String,
      enum: ['GRANT', 'DEDUCT', 'ADJUST', 'REVERSE'],
      required: true
    },
    amount: { type: Number, required: true },
    reason_code: { type: String, required: true },
    related_registration_id: { type: Schema.Types.ObjectId, ref: 'Registration', default: null },
    created_by: { type: String, required: true },
    notes: { type: String, default: '' }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false
  }
);

creditLedgerEntrySchema.index({ ledger_id: 1, created_at: -1 });

module.exports = model('CreditLedgerEntry', creditLedgerEntrySchema, 'credit_ledger_entries');
