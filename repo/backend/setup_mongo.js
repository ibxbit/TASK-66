const mongoose = require('mongoose');

async function setupMongoUser() {
  try {
    // Connect to MongoDB without authentication
    await mongoose.connect('mongodb://localhost:27017/admin', {
      serverSelectionTimeoutMS: 5000
    });
    console.log('Connected to MongoDB');

    // Get the admin database
    const db = mongoose.connection.db;
    const adminDb = db.admin();

    try {
      // Create the user with root privileges using the correct method
      const adminDb = db.admin();
      await adminDb.command({
        createUser: 'museum_user',
        pwd: 'museum_pass',
        roles: [{ role: 'root', db: 'admin' }]
      });
      console.log('User museum_user created successfully');
    } catch (error) {
      if (error.code === 51003) {
        console.log('User museum_user already exists');
      } else {
        throw error;
      }
    }

    // Test the connection with authentication
    await mongoose.disconnect();
    await mongoose.connect('mongodb://museum_user:museum_pass@localhost:27017/museum_ops?authSource=admin', {
      serverSelectionTimeoutMS: 5000
    });
    console.log('Authenticated connection test successful');

    await mongoose.disconnect();
    console.log('MongoDB setup complete');
    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  }
}

setupMongoUser();
