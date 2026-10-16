const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    if (process.env.NODE_ENV !== 'test') {
      console.log('MongoDB connected');
    }
  } catch (err) {
    console.error('Database connection error:', err.message);
    if (process.env.NODE_ENV === 'test') {
      throw err;
    }
    process.exit(1);
  }
};

module.exports = connectDB;