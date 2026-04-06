export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-key',
  expiresIn: '7d', // Keep users logged in for a week
  saltRounds: 10,  // For bcrypt password hashing
};