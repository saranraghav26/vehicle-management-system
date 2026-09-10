/* =============================================
   seed-admin.js — Seed initial admin user
   WheelWise Vehicle Booking System

   Creates default Admin user securely in the system
   data layer without exposing passwords in code or frontend.

   Default Admin Email: admin@wheelwise.com (or process.env.ADMIN_EMAIL)
   Password: Read from process.env.ADMIN_PASSWORD
   ============================================= */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Utility: Hash password using SHA-256 with salt
function hashPassword(password, salt) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
    return salt + ':' + hash;
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = {
    users: [],
    vehicles: [],
    bookings: []
};

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error('Error reading db.json, creating new database file.');
    }
}

// Initial vehicle data backup from json/vehicles.json if needed
const VEHICLES_JSON = path.join(__dirname, 'json', 'vehicles.json');
if ((!db.vehicles || db.vehicles.length === 0) && fs.existsSync(VEHICLES_JSON)) {
    try {
        const vData = JSON.parse(fs.readFileSync(VEHICLES_JSON, 'utf8'));
        db.vehicles = vData.vehicles || vData || [];
    } catch (e) {
        console.error('Could not seed vehicles from vehicles.json');
    }
}

const adminEmail = (process.env.ADMIN_EMAIL || 'admin@wheelwise.com').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword) {
    console.error('Error: ADMIN_PASSWORD environment variable is required to seed the admin account.');
    console.log('Usage example: ADMIN_PASSWORD="YourSecurePassword" node seed-admin.js');
    process.exit(1);
}

// Check if admin already exists
let admin = (db.users || []).find(u => u.role === 'admin' || u.email.toLowerCase() === adminEmail);
const passwordHash = hashPassword(adminPassword);

if (admin) {
    console.log('Admin user updated:', admin.email);
    admin.role = 'admin';
    admin.status = admin.status || 'active';
    admin.passwordHash = passwordHash;
    admin.updatedAt = new Date().toISOString();
} else {
    admin = {
        userId: 'USR-ADMIN-001',
        name: 'WheelWise System Administrator',
        email: adminEmail,
        phone: '+1 800-555-0199',
        role: 'admin',
        status: 'active',
        passwordHash: passwordHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (!db.users) db.users = [];
    db.users.push(admin);
    console.log('Successfully seeded Admin User!');
    console.log('Email:', adminEmail);
}

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
console.log('Database updated at:', DB_FILE);
