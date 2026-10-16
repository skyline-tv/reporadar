const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

function sanitizeUser(user) {
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
}

function signToken(userId) {
  if (!process.env.JWT_SECRET) {
    const err = new Error('JWT_SECRET is not configured');
    err.statusCode = 500;
    throw err;
  }
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Register a new user
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = signToken(user._id);

    res.status(201).send({
      message: 'Signup Successfull',
      user: sanitizeUser(user),
      token
    });
  } catch (err) {
    console.error('Register error:', err.message);
    const status = err.statusCode || 500;
    res.status(status).send(status === 500 ? 'Something went wrong' : err.message);
  }
};

// Login an existing user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send('Please provide email and password');
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send('No user found with this email');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send('Invalid password');
    }

    const token = signToken(user._id);

    res.status(200).send({
      message: 'Login successful',
      user: sanitizeUser(user),
      token
    });
  } catch (err) {
    console.error('Login error:', err.message);
    const status = err.statusCode || 500;
    res.status(status).send(status === 500 ? 'Something went wrong' : err.message);
  }
};
