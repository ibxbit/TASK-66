const CreditLedger = require('../models/credit-ledger');
const CreditLedgerEntry = require('../models/credit-ledger-entry');

const ledgerDeltaByType = (entryType, amount) => {
  if (entryType === 'GRANT' || entryType === 'ADJUST' || entryType === 'REVERSE') {
    return amount;
  }
  if (entryType === 'DEDUCT') {
    return -Math.abs(amount);
  }
  return 0;
};

const applyCreditEntry = async ({
  participantId,
  programType,
  entryType,
  amount,
  reasonCode,
  relatedRegistrationId = null,
  createdBy,
  notes = ''
}) => {
  const ledger = await CreditLedger.findOneAndUpdate(
    { participant_id: String(participantId), program_type: String(programType) },
    {
      $setOnInsert: {
        participant_id: String(participantId),
        program_type: String(programType),
        balance: 0
      }
    },
    { upsert: true, new: true }
  );

  const delta = ledgerDeltaByType(entryType, amount);
  ledger.balance += delta;
  await ledger.save();

  const entry = await CreditLedgerEntry.create({
    ledger_id: ledger._id,
    entry_type: entryType,
    amount,
    reason_code: reasonCode,
    related_registration_id: relatedRegistrationId,
    created_by: String(createdBy),
    notes
  });

  return {
    ledger,
    entry,
    delta
  };
};

module.exports = {
  applyCreditEntry
};
