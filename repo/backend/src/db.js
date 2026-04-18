const mongoose = require('mongoose');
const { logInfo, logError } = require('./lib/logger');

const state = {
  connected: false,
  lastError: null,
  retrying: false
};

const connectWithRetry = async (mongoUri) => {
  if (state.retrying) {
    return;
  }
  state.retrying = true;

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    state.connected = true;
    state.lastError = null;
    state.retrying = false;
    logInfo('db', { message: 'MongoDB connected' });
  } catch (error) {
    state.connected = false;
    state.lastError = error.message;
    state.retrying = false;
    logError('db', { message: 'MongoDB connection failed. Retrying in 5s...', error });
    setTimeout(() => connectWithRetry(mongoUri), 5000);
  }
};

mongoose.connection.on('disconnected', () => {
  state.connected = false;
});

mongoose.connection.on('connected', () => {
  state.connected = true;
  state.lastError = null;
});

mongoose.connection.on('error', (error) => {
  state.lastError = error?.message || 'Unknown MongoDB connection error';
});

const isDbReady = () => state.connected && mongoose.connection.readyState === 1;

module.exports = {
  connectWithRetry,
  isDbReady,
  dbState: state,
  mongoose
};
