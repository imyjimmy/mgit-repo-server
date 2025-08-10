const mysql = require('mysql2/promise');

// Database configuration based on your Docker setup
const dbConfig = {
  host: process.env.NODE_ENV === 'production' ? 'mgitreposerver-mgit-repo-server_appointments_mysql_1' : 'mgit-repo-server_appointments_mysql_1',
  port: 3306,
  user: 'user',
  password: 'password', 
  database: 'easyappointments',
  charset: 'utf8mb4',
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

// Create connection pool for better performance
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log('pool: ', pool);

module.exports = { pool, dbConfig };