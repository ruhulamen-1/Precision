import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import _ from 'lodash';
import nodemailer from 'nodemailer';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'precision-secret-key';

const authenticateJWT = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  
  app.use('/api', (req, res, next) => {
    console.log(`[TOP-LEVEL-API-DEBUG] ${req.method} ${req.url}`);
    next();
  });
  
  app.get('/api/health-check', (req, res) => {
    res.json({ message: 'Server is healthy' });
  });
  
  // Helper to save base64 image to file
  const saveImageToFile = (base64Str: string, projectName: string, date: string) => {
    try {
      if (!base64Str || !base64Str.startsWith('data:image')) return base64Str;
      
      const matches = base64Str.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) return base64Str;

      const extension = matches[1];
      const data = Buffer.from(matches[2], 'base64');
      
      // Create project and date specific folder
      const safeProjectName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const relativePath = path.join('uploads', safeProjectName, date);
      const absolutePath = path.join(process.cwd(), relativePath);
      
      if (!fs.existsSync(absolutePath)) {
        fs.mkdirSync(absolutePath, { recursive: true });
      }

      const uniqueId = Math.random().toString(36).substring(2, 11) + Date.now();
      const fileName = `${uniqueId}.${extension}`;
      const filePath = path.join(absolutePath, fileName);
      
      fs.writeFileSync(filePath, data);
      
      // Return the public URL path
      return `/uploads/${safeProjectName}/${date}/${fileName}`;
    } catch (err) {
      console.error('Error saving image file:', err);
      return base64Str;
    }
  };

  // Serve uploads folder statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const apiRouter = express.Router();
  app.use('/api', apiRouter);

  // MySQL Connection Configuration
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'project_visits',
    connectTimeout: 5000, // 5 seconds timeout
  };

  let pool: mysql.Pool | null = null;
  let useMemoryStore = true; // Default to true until DB is connected
  const DATA_FILE = path.join(process.cwd(), 'local-fallback-data.json');

  let defaultData = {
    projects: [],
    settings: {
      title: 'Data Surveillance Hub',
      location: 'Central Monitoring System',
      status: 'Live',
      completion: 100,
      image: 'https://media.istockphoto.com/id/1831868102/photo/dart-in-the-center-of-dartboard.jpg?s=612x612&w=0&k=20&c=EPKUN-O98zLrZJRWvi7XdJhdOhBbtqbBvX7lWe737J0='
    },
    entries: [],
    visits: [],
    itIssues: [],
    deviceCredentials: [],
    cameraStatus: [],
    salesPersonVisits: [],
    salesTeams: [],
    salesEmployees: [],
    saleableProjects: [],
    allEmployees: [],
    inventoryConfig: [],
    kpiData: [],
    rubbishVerification: [],
    reportNotes: [
      "1. The Per Day Average Working Hours for each individual has been calculated based on the number of actual working days, respectively. This allows a fair comparison between the two months.",
      "2. Individuals showing Negative (Red color) values in the comparison had lower average working hours in current month compared to last month.",
      "3. Those with Positive (Green color) values had higher working hours in current month than in last month.",
      "4. This method ensures accurate performance tracking aligned with each month's effective working days."
    ]
  };

  const loadLocalData = () => {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      }
    } catch (e) {
      console.error('Error loading local data file', e);
    }
    return defaultData;
  };

  const saveLocalData = (data) => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Error saving local data file', e);
    }
  };

  let localData = loadLocalData();

  // Async DB Init
  const initDB = async () => {
    try {
      console.log('Attempting to connect to MySQL database...');
      // Explicitly set charset in pool config
      pool = mysql.createPool({
        ...dbConfig,
        charset: 'utf8mb4',
        dateStrings: ['DATE', 'DATETIME']
      });
      
      let connection;
      try {
        connection = await pool.getConnection();
        console.log('MySQL Connected successfully to database:', dbConfig.database);
      } catch (err: any) {
        if (err.code === 'ER_BAD_DB_ERROR') {
          console.log(`Database ${dbConfig.database} does not exist. Attempting to create it...`);
          const tempPool = mysql.createPool({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            connectTimeout: 5000,
          });
          const tempConn = await tempPool.getConnection();
          await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
          tempConn.release();
          await tempPool.end();
          
          connection = await pool.getConnection();
          console.log('MySQL Connected successfully after creating database.');
        } else {
          throw err;
        }
      }

      console.log('Verifying/Creating database tables...');
      
      // Ensure columns exist (Migrations)
      try {
        await connection.query('ALTER TABLE kpi_data ADD COLUMN IF NOT EXISTS emp_id VARCHAR(50) AFTER sl');
      } catch (e) { /* Column might already exist or table doesn't exist yet */ }
      
      try {
        await connection.query('ALTER TABLE sales_person_visits ADD COLUMN IF NOT EXISTS employee_id VARCHAR(255) AFTER slNo');
      } catch (e) { /* Column might already exist or table doesn't exist yet */ }

      try {
        await connection.query("ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'New Upload'");
      } catch (e) { /* Column might already exist or table doesn't exist yet */ }

      try {
        await connection.query('ALTER TABLE employee_visits ADD COLUMN IF NOT EXISTS images JSON');
      } catch (e) { /* Column might already exist */ }

      try {
        await connection.query('ALTER TABLE activity_entries ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL DEFAULT NULL');
        await connection.query('ALTER TABLE activity_entries ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) DEFAULT NULL');
      } catch (e) { /* Column might already exist or table doesn't exist yet */ }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS employee_visits (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE NOT NULL,
          visitorName VARCHAR(255) NOT NULL,
          department VARCHAR(255),
          designation VARCHAR(255),
          projectName VARCHAR(255) NOT NULL,
          entryTime VARCHAR(10),
          outTime VARCHAR(10),
          duration VARCHAR(20),
          remarks TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS visit_book (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE NOT NULL,
          projectName VARCHAR(255) NOT NULL,
          images JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_visit (date, projectName)
        )
      `);
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          employeeId VARCHAR(255),
          designation VARCHAR(255),
          department VARCHAR(255),
          division VARCHAR(255),
          role VARCHAR(50) DEFAULT 'user',
          permissions JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const [userRows] = await connection.query('SELECT id FROM users WHERE email = ?', ['ruhulamen.credence@gmail.com']);
      if (Array.isArray(userRows) && userRows.length === 0) {
        const defaultPermissions = {
          dashboard: { view: true },
          projectVisit: { view: true, edit: true },
          lastVisitedProjects: { view: true },
          projectCase: { view: true, edit: true },
          projectCasesList: { view: true },
          profile: { view: true, edit: true },
          adminPanel: { view: true },
          materialReceive: { view: true, edit: true },
          materialReceiveList: { view: true },
          systemManagement_addProject: { view: true, edit: true },
          systemManagement_projectList: { view: true, edit: true },
          systemManagement_dashboardSettings: { view: true, edit: true },
          employeeProjectVisit: { view: true, edit: true },
          salesPersonProjectVisit: { view: true, edit: true },
          itResponseTimeline: { view: true, edit: true },
          erpCorrectionReport: { view: true, edit: true },
          constructionDutyAnalysis: { view: true, edit: true },
          monthlyComparisonPrecision: { view: true, edit: true },
          ssvDutyAnalysis: { view: true, edit: true },
          reportMailer: { view: true },
          archiveDataVerification: { view: true, edit: true, audit: true },
          cctvFootageCheckReports: { view: true, edit: true },
          fixedAssetGPVerification: { view: true, edit: true, audit: true },
          rubbishVerification: { view: true, edit: true, audit: true },
        };

        await connection.query(`
          INSERT INTO users (name, email, password, employeeId, designation, department, division, role, permissions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'Ruhul Amen', 
          'ruhulamen.credence@gmail.com', 
          'admin', 
          '240121009', 
          'Administrator', 
          'Management Information System (MIS)', 
          'Admin Office', 
          'super_admin', 
          JSON.stringify(defaultPermissions)
        ]);
      }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          zone VARCHAR(255) NOT NULL,
          address TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS dashboard_settings (
          id INT PRIMARY KEY DEFAULT 1,
          title VARCHAR(255) NOT NULL,
          location VARCHAR(255) NOT NULL,
          status VARCHAR(255),
          completion INT DEFAULT 0,
          image LONGTEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      const [settingsRows] = await connection.query('SELECT id FROM dashboard_settings LIMIT 1');
      if (Array.isArray(settingsRows) && settingsRows.length === 0) {
        await connection.query(`
          INSERT INTO dashboard_settings (id, title, location, status, completion, image)
          VALUES (1, 'Data Surveillance Hub', 'Central Monitoring System', 'Live', 100, 'https://media.istockphoto.com/id/1831868102/photo/dart-in-the-center-of-dartboard.jpg?s=612x612&w=0&k=20&c=EPKUN-O98zLrZJRWvi7XdJhdOhBbtqbBvX7lWe737J0=')
        `);
      }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS system_entries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          entry_name VARCHAR(255) NOT NULL,
          entry_type VARCHAR(255) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS it_assigned_issues (
          id INT AUTO_INCREMENT PRIMARY KEY,
          issue_id VARCHAR(255),
          issue_text TEXT,
          reported_at TIMESTAMP,
          assigned_to VARCHAR(255),
          status VARCHAR(50),
          project_name VARCHAR(255),
          zone VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS it_device_credentials (
          id INT AUTO_INCREMENT PRIMARY KEY,
          zone VARCHAR(255),
          project_name VARCHAR(255),
          device_sl_no VARCHAR(255),
          username VARCHAR(255),
          password VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS it_camera_status (
          id INT AUTO_INCREMENT PRIMARY KEY,
          status_date DATE NOT NULL,
          project_name VARCHAR(255) NOT NULL,
          zone VARCHAR(255),
          online_status VARCHAR(50) NOT NULL DEFAULT 'Online',
          issue_type VARCHAR(500),
          updated_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_date_project (status_date, project_name)
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS sales_person_visits (
          id INT AUTO_INCREMENT PRIMARY KEY,
          slNo VARCHAR(255),
          employee_id VARCHAR(255),
          date VARCHAR(255),
          salesPersonName VARCHAR(255),
          designation VARCHAR(255),
          customerName VARCHAR(255),
          customerId VARCHAR(255),
          projectName VARCHAR(255),
          projectLocation VARCHAR(255),
          inTime VARCHAR(255),
          outTime VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          setting_key VARCHAR(255) UNIQUE NOT NULL,
          setting_value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS department_emails (
          id INT AUTO_INCREMENT PRIMARY KEY,
          department_name VARCHAR(255) UNIQUE NOT NULL,
          to_emails TEXT,
          cc_emails TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS department_monthly_links (
          id INT AUTO_INCREMENT PRIMARY KEY,
          department_name VARCHAR(255) NOT NULL,
          report_month VARCHAR(7) NOT NULL,
          link TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY (department_name, report_month)
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS archive_data_types (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS archive_data_verification (
          id INT AUTO_INCREMENT PRIMARY KEY,
          upload_date DATE NOT NULL,
          upload_time TIME NOT NULL,
          data_type VARCHAR(255),
          file_name VARCHAR(255),
          submitted_by VARCHAR(255),
          files_count INT DEFAULT 0,
          errors_count INT DEFAULT 0,
          remarks_on_errors TEXT,
          user_remarks TEXT,
          check_status VARCHAR(50) DEFAULT 'Pending',
          check_date DATE,
          check_time TIME,
          checked_by VARCHAR(255),
          status VARCHAR(50) DEFAULT 'New Upload',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          recipient_id INT NOT NULL,
          sender_id INT DEFAULT NULL,
          sender_name VARCHAR(255) DEFAULT NULL,
          type VARCHAR(100) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT,
          link_view VARCHAR(100) DEFAULT NULL,
          link_state LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
          is_read TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_recipient_unread (recipient_id, is_read),
          KEY idx_recipient_created (recipient_id, created_at)
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS fixed_asset_gp_verification (
          id INT AUTO_INCREMENT PRIMARY KEY,
          gp_date DATE NOT NULL,
          reference VARCHAR(255) NOT NULL,
          updated_by VARCHAR(255) NOT NULL,
          issues_count INT DEFAULT NULL,
          remarks TEXT,
          checked_by VARCHAR(255),
          check_status VARCHAR(50) DEFAULT 'Pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      // Migration for user_remarks
      try {
        await connection.query('ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS user_remarks TEXT');
      } catch (err) {}

      // Migration for A&F transfer fields
      try {
        await connection.query("ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS af_transfer_status VARCHAR(50) DEFAULT 'Pending'");
        await connection.query('ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS af_transferred_to VARCHAR(255)');
        await connection.query('ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS af_transferred_by VARCHAR(255)');
        await connection.query('ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS af_transfer_date DATE');
        await connection.query('ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS af_transfer_time TIME');
        await connection.query('ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS af_transfer_notes TEXT');
        await connection.query('ALTER TABLE archive_data_verification ADD COLUMN IF NOT EXISTS af_transfer_department VARCHAR(100)');
      } catch (err) {}

      // Migrations for fixed_asset_gp_verification
      try {
        await connection.query("ALTER TABLE fixed_asset_gp_verification ADD COLUMN IF NOT EXISTS check_status VARCHAR(50) DEFAULT 'Pending'");
        await connection.query("ALTER TABLE fixed_asset_gp_verification ADD COLUMN IF NOT EXISTS gp_details JSON DEFAULT NULL");
      } catch (err) {
        // ignore if already exists
      }

      // Migration: Update status column from ENUM to VARCHAR or updated ENUM
      try {
        await connection.query("ALTER TABLE archive_data_verification MODIFY COLUMN check_status VARCHAR(50) DEFAULT 'Pending'");
      } catch (e) { console.error('Error migrating check_status', e); }

      // --- START OF CRITICAL ID MIGRATIONS ---
      
      const tablesToFix = [
        'archive_data_verification',
        'rubbish_verification',
        'fixed_asset_gp_verification',
        'archive_data_types',
        'archive_verification_history'
      ];

      for (const tableName of tablesToFix) {
        try {
          console.log(`Checking IDs for ${tableName}...`);
          let [rowsWithZero]: any = await connection.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE id = 0`);
          if (rowsWithZero[0].count > 0) {
            console.log(`Found ${rowsWithZero[0].count} rows with ID 0 in ${tableName}. Fixing...`);
            const [maxIdResult]: any = await connection.query(`SELECT IFNULL(MAX(id), 0) as maxId FROM ${tableName}`);
            let nextId = maxIdResult[0].maxId + 1;
            
            // Get all records with ID 0
            const [zeros]: any = await connection.query(`SELECT * FROM ${tableName} WHERE id = 0`);
            for (const row of (zeros as any[])) {
              await connection.query(`UPDATE ${tableName} SET id = ? WHERE id = 0 LIMIT 1`, [nextId++]);
            }
          }

          // Ensure PRIMARY KEY and AUTO_INCREMENT
          try {
            // Check if PK already exists
            const [pkCheck]: any = await connection.query(`
              SELECT COUNT(*) as count
              FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_KEY = 'PRI'
            `, [tableName]);

            if (pkCheck[0].count === 0) {
              console.log(`Adding primary key to ${tableName}...`);
              await connection.query(`ALTER TABLE ${tableName} MODIFY COLUMN id INT NOT NULL`);
              await connection.query(`ALTER TABLE ${tableName} ADD PRIMARY KEY (id)`);
            }
          } catch (pkErr) {
            console.log(`Primary key handling for ${tableName}:`, (pkErr as Error).message);
          }

          try {
            await connection.query(`ALTER TABLE ${tableName} MODIFY COLUMN id INT AUTO_INCREMENT`);
            const [maxIdFinal]: any = await connection.query(`SELECT MAX(id) as maxId FROM ${tableName}`);
            if (maxIdFinal[0].maxId) {
              await connection.query(`ALTER TABLE ${tableName} AUTO_INCREMENT = ${maxIdFinal[0].maxId + 1}`);
            }
          } catch (aiErr) {
            console.error(`Error setting AUTO_INCREMENT for ${tableName}:`, (aiErr as Error).message);
          }
          
          console.log(`Migration for ${tableName} completed successfully.`);
        } catch (tableErr) {
          console.error(`Failed to migrate table ${tableName}:`, (tableErr as Error).message);
        }
      }
      
      // --- END OF CRITICAL ID MIGRATIONS ---

      await connection.query(`
        CREATE TABLE IF NOT EXISTS archive_verification_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          record_id INT NOT NULL,
          changed_by VARCHAR(255) NOT NULL,
          old_status VARCHAR(50),
          new_status VARCHAR(50),
          old_remarks TEXT,
          new_remarks TEXT,
          change_date DATE,
          change_time TIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (record_id) REFERENCES archive_data_verification(id) ON DELETE CASCADE
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS archive_transfer_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          record_id INT NOT NULL,
          transferred_by VARCHAR(255),
          transferred_to VARCHAR(255),
          transfer_date DATE,
          transfer_time TIME,
          transfer_notes TEXT,
          transfer_department VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (record_id) REFERENCES archive_data_verification(id) ON DELETE CASCADE
        )
      `);

      // Migration for transfer department on history table (existing installs)
      try {
        await connection.query('ALTER TABLE archive_transfer_history ADD COLUMN IF NOT EXISTS transfer_department VARCHAR(100)');
      } catch (err) {}

      await connection.query(`
        CREATE TABLE IF NOT EXISTS cctv_footage_check_reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          requisition_date DATE,
          requested_by VARCHAR(255),
          designation VARCHAR(255),
          department VARCHAR(255),
          checking_code VARCHAR(255),
          checking_date DATE,
          project_name VARCHAR(255),
          from_time TIME,
          to_time TIME,
          checking_purpose TEXT,
          report_link VARCHAR(255),
          camera_check_comments TEXT,
          checked_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS sent_reports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sender_email VARCHAR(255),
          recipient_email VARCHAR(255),
          subject VARCHAR(255),
          report_type VARCHAR(100),
          report_month VARCHAR(20),
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          attachment_name VARCHAR(255),
          message_body TEXT
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS daily_tasks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(500) NOT NULL,
          description TEXT,
          priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
          status ENUM('Pending', 'In Progress', 'Done') DEFAULT 'Pending',
          category VARCHAR(255),
          due_date DATE,
          reminder_at DATETIME NULL,
          assigned_to_id INT,
          assigned_to_name VARCHAR(255),
          created_by_id INT NOT NULL,
          created_by_name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Migration for sent_reports
      try {
        await connection.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS division VARCHAR(255) AFTER department');
        await connection.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT AFTER division');
        await connection.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS dateOfBirth VARCHAR(255) AFTER bio');
        await connection.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality VARCHAR(255) AFTER dateOfBirth');
        await connection.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS religion VARCHAR(255) AFTER nationality');
        await connection.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(255) AFTER religion');
        await connection.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS mobileNumber VARCHAR(255) AFTER gender');
      } catch (err) {}

      // Migration for daily_tasks reminder popup (added after initial release)
      try {
        await connection.query('ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS reminder_at DATETIME NULL AFTER due_date');
      } catch (err) {}

      await connection.query(`
        CREATE TABLE IF NOT EXISTS sales_teams (
          id INT AUTO_INCREMENT PRIMARY KEY,
          teamName VARCHAR(255) NOT NULL,
          leader VARCHAR(255) NOT NULL,
          members JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS sales_employees (
          id INT AUTO_INCREMENT PRIMARY KEY,
          empId VARCHAR(255),
          name VARCHAR(255) NOT NULL,
          designation VARCHAR(255),
          position VARCHAR(255),
          teamLeader VARCHAR(255),
          departmentHod VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          empId VARCHAR(255) NOT NULL UNIQUE,
          userName VARCHAR(255),
          email VARCHAR(255),
          bio TEXT,
          profilePicture LONGTEXT,
          designation VARCHAR(255),
          department VARCHAR(255),
          division VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      // Migrations for user_profiles
      try {
        await connection.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS designation VARCHAR(255) AFTER profilePicture');
        await connection.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS department VARCHAR(255) AFTER designation');
        await connection.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS division VARCHAR(255) AFTER department');
        await connection.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS dateOfBirth VARCHAR(255) AFTER division');
        await connection.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS nationality VARCHAR(255) AFTER dateOfBirth');
        await connection.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS religion VARCHAR(255) AFTER nationality');
        await connection.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(255) AFTER religion');
        await connection.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mobileNumber VARCHAR(255) AFTER gender');
      } catch (e) { /* Might already exist */ }

      try {
        await connection.query('ALTER TABLE rubbish_verification ADD COLUMN IF NOT EXISTS check_date DATE AFTER checked_by');
      } catch (e) { /* Might already exist */ }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS all_employees (
          id INT AUTO_INCREMENT PRIMARY KEY,
          employee_id VARCHAR(50) UNIQUE,
          name VARCHAR(255),
          designation VARCHAR(255),
          department VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Migration: add is_active column if it doesn't exist
      try {
        await connection.query(`ALTER TABLE all_employees ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1`);
      } catch (e) { /* column may already exist */ }

      // Migration: merge any pre-existing duplicate employee_id rows, then make sure
      // a UNIQUE index actually exists on employee_id (older tables created before the
      // UNIQUE constraint was added above won't have it, which is how duplicates crept in).
      try {
        // Normalize accidental leading/trailing whitespace first so "EMP001" and "EMP001 " merge too.
        await connection.query(`UPDATE all_employees SET employee_id = TRIM(employee_id) WHERE employee_id <> TRIM(employee_id)`);

        const [dupGroups]: any = await connection.query(`
          SELECT employee_id, COUNT(*) AS cnt
          FROM all_employees
          WHERE employee_id IS NOT NULL AND employee_id <> ''
          GROUP BY employee_id
          HAVING cnt > 1
        `);

        for (const dup of dupGroups) {
          const [rows]: any = await connection.query(
            'SELECT * FROM all_employees WHERE employee_id = ? ORDER BY id ASC',
            [dup.employee_id]
          );
          if (rows.length < 2) continue;
          const keep = rows[0];
          const merged: any = { ...keep };
          for (const r of rows.slice(1)) {
            merged.name = merged.name || r.name;
            merged.designation = merged.designation || r.designation;
            merged.department = merged.department || r.department;
            merged.email = merged.email || r.email;
            merged.phone = merged.phone || r.phone;
            merged.is_active = merged.is_active || r.is_active; // treat as active if any duplicate was active
          }
          await connection.query(
            'UPDATE all_employees SET name=?, designation=?, department=?, email=?, phone=?, is_active=? WHERE id=?',
            [merged.name, merged.designation, merged.department, merged.email, merged.phone, merged.is_active, keep.id]
          );
          const dupIds = rows.slice(1).map((r: any) => r.id);
          await connection.query('DELETE FROM all_employees WHERE id IN (?)', [dupIds]);
        }

        if (dupGroups.length > 0) {
          console.log(`Merged ${dupGroups.length} duplicate employee_id group(s) in all_employees.`);
        }

        // Confirm a UNIQUE index exists on employee_id; add it if this table pre-dates that constraint.
        const [idxRows]: any = await connection.query(`
          SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
          WHERE table_schema = DATABASE() AND table_name = 'all_employees'
            AND non_unique = 0 AND column_name = 'employee_id'
        `);
        if (idxRows[0].cnt === 0) {
          await connection.query('ALTER TABLE all_employees ADD UNIQUE INDEX employee_id_unique (employee_id)');
          console.log('Added missing UNIQUE index on all_employees.employee_id.');
        }
      } catch (e) {
        console.error('Error during employee_id de-duplication migration:', e);
      }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS saleable_projects (
          id INT AUTO_INCREMENT PRIMARY KEY,
          project_name VARCHAR(255) UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS report_notes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          note_text TEXT NOT NULL,
          display_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const [notesRows] = await connection.query('SELECT count(*) as count FROM report_notes');
      if ((notesRows as any)[0].count === 0) {
        const initialNotes = [
          "1. The Per Day Average Working Hours for each individual has been calculated based on the number of actual working days, respectively. This allows a fair comparison between the two months.",
          "2. Individuals showing Negative (Red color) values in the comparison had lower average working hours in current month compared to last month.",
          "3. Those with Positive (Green color) values had higher working hours in current month than in last month.",
          "4. This method ensures accurate performance tracking aligned with each month's effective working days."
        ];
        const noteValues = initialNotes.map((note, idx) => [note, idx]);
        await connection.query('INSERT INTO report_notes (note_text, display_order) VALUES ?', [noteValues]);
      }
      
      await connection.query(`
        CREATE TABLE IF NOT EXISTS kpi_data (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sl VARCHAR(50),
          emp_id VARCHAR(50),
          associate VARCHAR(255),
          date VARCHAR(50),
          project_info TEXT,
          lead_info TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS department_summaries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          report_month VARCHAR(20) NOT NULL,
          department VARCHAR(255),
          visitor_name VARCHAR(255),
          designation VARCHAR(255),
          total_working_day INT,
          total_visited_day INT,
          total_visit_logs INT,
          total_visited_project_count INT,
          duration_more_than_20 INT,
          duration_10_to_19 INT,
          duration_5_to_9 INT,
          duration_less_than_5 INT,
          supposedly_duration_day VARCHAR(20),
          supposedly_duration_month VARCHAR(20),
          actual_duration VARCHAR(20),
          duration_percentage DECIMAL(10, 2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_summary (report_month, visitor_name)
        )
      `);


      await connection.query(`
        CREATE TABLE IF NOT EXISTS employee_working_days (
          id INT AUTO_INCREMENT PRIMARY KEY,
          visitorName VARCHAR(255) NOT NULL,
          month_year VARCHAR(20) NOT NULL,
          working_days INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_employee_month (visitorName, month_year)
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS inventory_config (
          visitorName VARCHAR(255) PRIMARY KEY,
          side ENUM('Head Office', 'Project Side') NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS monthly_config (
          month_year VARCHAR(7) PRIMARY KEY,
          default_wd INT DEFAULT 25,
          security_wd INT DEFAULT 0,
          office_wd INT DEFAULT 0
        )
      `);

      try {
        await connection.query('ALTER TABLE monthly_config ADD COLUMN security_wd INT DEFAULT 0');
        console.log('Successfully added security_wd column to monthly_config');
      } catch (e) {
        // Suppress error if column already exists
      }

      try {
        await connection.query('ALTER TABLE monthly_config ADD COLUMN office_wd INT DEFAULT 0');
        console.log('Successfully added office_wd column to monthly_config');
      } catch (e) {
        // Suppress error if column already exists
      }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          setting_key VARCHAR(100) PRIMARY KEY,
          setting_value LONGTEXT NOT NULL
        )
      `);
      try {
        await connection.query('ALTER TABLE app_settings MODIFY COLUMN setting_value LONGTEXT');
      } catch (e) {
        console.error('Error modifying app_settings setting_value column:', e);
      }
      try {
        await connection.query('ALTER TABLE app_settings MODIFY COLUMN setting_key VARCHAR(100)');
      } catch (e) {
        console.error('Error modifying app_settings setting_value column:', e);
      }

      // Migrations for department renaming
      try {
        console.log('Running department renaming migrations...');
        // Rename in employee_visits
        await connection.query("UPDATE employee_visits SET department = 'Inventory Management' WHERE department IN ('Inventory Mgt', 'Inventory Mgt (Project Side)')");
        // Rename in all_employees
        await connection.query("UPDATE all_employees SET department = 'Inventory Management' WHERE department IN ('Inventory Mgt', 'Inventory Mgt (Project Side)')");
        // Rename in department_summaries
        await connection.query("UPDATE department_summaries SET department = 'Inventory Management' WHERE department IN ('Inventory Mgt', 'Inventory Mgt (Project Side)')");
      } catch (e) {
        console.error('Error during department renaming migration:', e);
      }

      try {
        await connection.query('ALTER TABLE rubbish_verification ADD COLUMN IF NOT EXISTS bill VARCHAR(255) AFTER bill_no');
      } catch (err) {}

      await connection.query(`
        CREATE TABLE IF NOT EXISTS rubbish_verification (
          id INT AUTO_INCREMENT PRIMARY KEY,
          project_name VARCHAR(255),
          officers VARCHAR(255),
          designation VARCHAR(255),
          bill_no VARCHAR(255),
          bill VARCHAR(255),
          gp_no VARCHAR(255),
          truck_no VARCHAR(255),
          date DATE,
          in_time TIME,
          out_time TIME,
          status VARCHAR(50),
          sg_presence VARCHAR(255),
          remarks TEXT,
          checked_by VARCHAR(255),
          check_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS material_receipts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mrf VARCHAR(255),
          project_name VARCHAR(255),
          supplier_name VARCHAR(255),
          material_name VARCHAR(255),
          quantity DECIMAL(10, 2),
          unit VARCHAR(50),
          received_by VARCHAR(255),
          receiving_date DATE,
          receiving_time TIME,
          entry_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          presence_me_apa VARCHAR(255),
          sg_presence VARCHAR(255),
          camera_location VARCHAR(255),
          audit_remarks TEXT,
          audit_by VARCHAR(255)
        )
      `);

      // Migration: ensure audit columns exist on material_receipts even if the
      // table was created earlier without them (fixes "audit data not saving")
      try {
        await connection.query('ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS presence_me_apa VARCHAR(255)');
        await connection.query('ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS sg_presence VARCHAR(255)');
        await connection.query('ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS camera_location VARCHAR(255)');
        await connection.query('ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS audit_remarks TEXT');
        await connection.query('ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS audit_by VARCHAR(255)');
      } catch (err) {
        console.error('Migration error (material_receipts audit columns):', err);
      }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS remarks (
          id VARCHAR(255) NOT NULL PRIMARY KEY,
          text_en TEXT DEFAULT NULL,
          text_bn TEXT DEFAULT NULL,
          type VARCHAR(50) DEFAULT 'neutral',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS activity_entries (
          id VARCHAR(255) NOT NULL PRIMARY KEY,
          date DATE NOT NULL,
          time VARCHAR(10) DEFAULT NULL,
          remarks TEXT DEFAULT NULL,
          employeeIds JSON DEFAULT NULL,
          screenshots JSON DEFAULT NULL,
          user_id VARCHAR(255) DEFAULT NULL,
          is_deleted TINYINT(1) DEFAULT 0,
          deleted_at DATETIME NULL DEFAULT NULL,
          deleted_by VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS activity_comments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          activity_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255),
          comment TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS casual_images (
          \`key\` VARCHAR(255) NOT NULL PRIMARY KEY,
          \`data\` LONGTEXT,
          \`mime_type\` VARCHAR(100)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS special_observations (
          id VARCHAR(255) NOT NULL PRIMARY KEY,
          date VARCHAR(50) DEFAULT NULL,
          time VARCHAR(50) DEFAULT NULL,
          remarks TEXT DEFAULT NULL,
          observation_details TEXT DEFAULT NULL,
          employeeIds LONGTEXT DEFAULT NULL,
          screenshots LONGTEXT DEFAULT NULL,
          user_id VARCHAR(255) DEFAULT NULL,
          is_deleted TINYINT(1) DEFAULT 0,
          deleted_at VARCHAR(100) DEFAULT NULL,
          deleted_by VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS project_cases (
          id VARCHAR(255) NOT NULL PRIMARY KEY,
          projectName VARCHAR(255) DEFAULT NULL,
          projectZone VARCHAR(255) DEFAULT NULL,
          caseName VARCHAR(255) DEFAULT NULL,
          liableDept VARCHAR(255) DEFAULT NULL,
          comments TEXT DEFAULT NULL,
          photo LONGTEXT DEFAULT NULL,
          annotations LONGTEXT DEFAULT NULL,
          category VARCHAR(100) DEFAULT NULL,
          priority VARCHAR(50) DEFAULT NULL,
          summary TEXT DEFAULT NULL,
          reporter VARCHAR(255) DEFAULT NULL,
          reporterId VARCHAR(255) DEFAULT NULL,
          date VARCHAR(50) DEFAULT NULL,
          is_deleted TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      await connection.query('ALTER TABLE project_cases ADD COLUMN IF NOT EXISTS annotations LONGTEXT DEFAULT NULL');

      connection.release();
      useMemoryStore = false;
      console.log('Database tables verified/created successfully');
    } catch (error) {
      console.error('MySQL Connection Error (Using in-memory store):', (error as Error).message);
      useMemoryStore = true;
    }
  };

  initDB();

  // --- API Routes ---
  
  // Debug log for SMTP settings (masking password)
  console.log('[SMTP-DEBUG] Check config:', {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    from: process.env.EMAIL_FROM,
    hasPass: !!process.env.EMAIL_PASS
  });
  
  apiRouter.get('/ping', (req, res) => res.json({ ok: true }));
  
  // Middleware to log API requests
  apiRouter.use((req, res, next) => {
    console.log(`[API DEBUG] Incoming request: ${req.method} ${req.url}, Original: ${req.originalUrl}`);
    next();
  });

  // Catch-all for API to debug routing
  apiRouter.use((req, res, next) => {
    console.log(`[API DEBUG] apiRouter got request: ${req.method} ${req.url}`);
    next();
  });

  apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  apiRouter.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      if (useMemoryStore || !pool) {
        // Fallback for memory store (development)
        if (email === 'ruhulamen.credence@gmail.com' && password === 'admin') {
          return res.json({
            id: 1,
            name: 'Ruhul Amen',
            email: 'ruhulamen.credence@gmail.com',
            employeeId: '240121009',
            designation: 'Administrator',
            department: 'Management Information System (MIS)',
            division: 'Admin Office',
            role: 'super_admin',
            permissions: {
              dashboard: { view: true },
              projectVisit: { view: true, edit: true },
              lastVisitedProjects: { view: true },
              projectCase: { view: true, edit: true },
              projectCasesList: { view: true },
              profile: { view: true, edit: true },
              adminPanel: { view: true },
              materialReceive: { view: true, edit: true },
              materialReceiveList: { view: true },
              systemManagement_addProject: { view: true, edit: true },
              systemManagement_projectList: { view: true, edit: true },
              systemManagement_dashboardSettings: { view: true, edit: true },
              employeeProjectVisit: { view: true, edit: true },
              salesPersonProjectVisit: { view: true, edit: true },
              itResponseTimeline: { view: true, edit: true },
              erpCorrectionReport: { view: true, edit: true },
              constructionDutyAnalysis: { view: true, edit: true },
              monthlyComparisonPrecision: { view: true, edit: true },
              ssvDutyAnalysis: { view: true, edit: true },
              reportMailer: { view: true },
              archiveDataVerification: { view: true, edit: true, audit: true },
              cctvFootageCheckReports: { view: true, edit: true },
              fixedAssetGPVerification: { view: true, edit: true, audit: true },
              rubbishVerification: { view: true, edit: true, audit: true },
            }
          });
        }
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Fetch user by email only, then compare password with bcrypt
      const [rows]: any = await pool.query(
        'SELECT u.*, up.bio, up.profilePicture as avatar FROM users u LEFT JOIN user_profiles up ON u.employeeId = up.empId WHERE u.email = ?',
        [email]
      );
      if (rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = rows[0];
      // Support both bcrypt hashed and plain text passwords (legacy)
      let passwordMatch = false;
      if (user.password && user.password.startsWith('$2')) {
        passwordMatch = await bcrypt.compare(password, user.password);
      } else {
        passwordMatch = user.password === password;
      }
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      if (user.permissions && typeof user.permissions === 'string') {
        user.permissions = JSON.parse(user.permissions);
      }
      res.json(user);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error during login' });
    }
  });

  apiRouter.get('/users', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json([]);
      }
      const [rows]: any = await pool.query(
        'SELECT u.id, u.name, u.email, u.employeeId, u.designation, u.department, u.division, u.role, u.permissions, u.dateOfBirth, u.nationality, u.religion, u.gender, u.mobileNumber, up.bio, up.profilePicture as avatar FROM users u LEFT JOIN user_profiles up ON u.employeeId = up.empId'
      );
      const fetchedUsers = rows.map((u: any) => {
        if (u.permissions && typeof u.permissions === 'string') {
          u.permissions = JSON.parse(u.permissions);
        }
        return u;
      });
      res.json(fetchedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  apiRouter.post('/users', async (req, res) => {
    const { name, email, password, employeeId, designation, department, division, role, permissions } = req.body;
    try {
      if (useMemoryStore || !pool) {
        return res.status(501).json({ error: 'Not implemented in memory store' });
      }
      
      const permissionsJson = JSON.stringify(permissions || {});
      const [result]: any = await pool.query(
        'INSERT INTO users (name, email, password, employeeId, designation, department, division, role, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, email, password, employeeId, designation, department, division, role || 'user', permissionsJson]
      );
      
      const [newRow]: any = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      const newUser = newRow[0];
      if (newUser.permissions && typeof newUser.permissions === 'string') {
        newUser.permissions = JSON.parse(newUser.permissions);
      }
      res.json(newUser);
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // User profile update
  apiRouter.put('/users/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    
    try {
      if (useMemoryStore || !pool) {
        return res.status(501).json({ error: 'Not implemented in memory store' });
      }

      // Fetch existing user to merge fields
      const [existingRows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
      if (!existingRows || existingRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const existingUser = existingRows[0];

      const { 
        name = existingUser.name, 
        email = existingUser.email, 
        designation = existingUser.designation, 
        department = existingUser.department, 
        division = existingUser.division, 
        bio = existingUser.bio, 
        dateOfBirth = existingUser.dateOfBirth, 
        nationality = existingUser.nationality, 
        religion = existingUser.religion, 
        gender = existingUser.gender, 
        mobileNumber = existingUser.mobileNumber, 
        role = existingUser.role,
        avatar
      } = req.body;

      // Validation
      if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required.' });
      }

      // DB update following existing pattern
      await pool.query(
        'UPDATE users SET name = ?, email = ?, designation = ?, department = ?, division = ?, bio = ?, dateOfBirth = ?, nationality = ?, religion = ?, gender = ?, mobileNumber = ?, role = ? WHERE id = ?',
        [name, email, designation, department, division, bio, dateOfBirth, nationality, religion, gender, mobileNumber, role, userId]
      );

      // If avatar is provided, also update user_profiles table
      if (avatar !== undefined) {
        const empId = existingUser.employeeId;
        await pool.query(
          'INSERT INTO user_profiles (empId, userName, email, profilePicture) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE profilePicture = ?',
          [empId, name, email, avatar, avatar]
        );
      }

      // Fetch and return updated user object (join with user_profiles for avatar)
      const [rows]: any = await pool.query(
        'SELECT u.id, u.name, u.email, u.employeeId, u.designation, u.department, u.division, u.bio, u.dateOfBirth, u.nationality, u.religion, u.gender, u.mobileNumber, u.role, u.permissions, up.profilePicture as avatar FROM users u LEFT JOIN user_profiles up ON u.employeeId = up.empId WHERE u.id = ?',
        [userId]
      );
      const updatedUser = rows[0];
      if (updatedUser && updatedUser.permissions && typeof updatedUser.permissions === 'string') {
        updatedUser.permissions = JSON.parse(updatedUser.permissions);
      }
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({ error: 'Failed to update user profile' });
    }
  });

  // Password change
  apiRouter.put('/users/:id/password', async (req, res) => {
    const userId = parseInt(req.params.id);
    const password = req.body.newPassword || req.body.password;

    // Validation
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
      if (useMemoryStore || !pool) {
        // Fallback for memory store
        console.log(`[Memory Store] Password updated for user ${userId}`);
        return res.json({ success: true });
      }

      // bcrypt hash
      const hashedPassword = await bcrypt.hash(password, 12);

      // DB update following existing pattern
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating password:', error);
      res.status(500).json({ error: 'Failed to update password' });
    }
  });

  apiRouter.put('/users/:id/permissions', async (req, res) => {
    const { id } = req.params;
    const { permissions } = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented' });
      await pool.query('UPDATE users SET permissions = ? WHERE id = ?', [JSON.stringify(permissions), id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update permissions' });
    }
  });

  apiRouter.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented' });
      await pool.query('DELETE FROM users WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // DEPARTMENT EMAILS API
  apiRouter.get('/department-emails', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.json(localData.departmentEmails || []);
      const [rows] = await pool.query('SELECT * FROM department_emails ORDER BY department_name ASC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch department emails' });
    }
  });

  apiRouter.post('/department-emails', async (req, res) => {
    const { department_name, to_emails, cc_emails } = req.body;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.departmentEmails) localData.departmentEmails = [];
        const index = localData.departmentEmails.findIndex((d: any) => d.department_name === department_name);
        if (index !== -1) {
          localData.departmentEmails[index] = { ...localData.departmentEmails[index], to_emails, cc_emails, updated_at: new Date() };
        } else {
          localData.departmentEmails.push({ id: Date.now(), department_name, to_emails, cc_emails, updated_at: new Date() });
        }
        saveLocalData(localData);
        return res.json({ message: 'Success (Memory)' });
      }
      
      await pool.query(
        'INSERT INTO department_emails (department_name, to_emails, cc_emails) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE to_emails = ?, cc_emails = ?',
        [department_name, to_emails, cc_emails, to_emails, cc_emails]
      );
      res.json({ message: 'Success' });
    } catch (error) {
      console.error('Error saving department emails:', error);
      res.status(500).json({ error: 'Failed to save department emails' });
    }
  });

  apiRouter.delete('/department-emails/:department', async (req, res) => {
    const { department } = req.params;
    try {
      if (useMemoryStore || !pool) {
        localData.departmentEmails = (localData.departmentEmails || []).filter((d: any) => d.department_name !== department);
        saveLocalData(localData);
        return res.json({ message: 'Deleted' });
      }
      await pool.query('DELETE FROM department_emails WHERE department_name = ?', [department]);
      // Also delete monthly links for this department
      await pool.query('DELETE FROM department_monthly_links WHERE department_name = ?', [department]);
      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete' });
    }
  });

  // MATERIAL RECEIPTS API
  apiRouter.get('/material-receipts', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.json([]);
      const [rows] = await pool.query('SELECT * FROM material_receipts ORDER BY entry_date DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch receipts' });
    }
  });

  apiRouter.post('/material-receipts', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented' });
      
      const receipts = Array.isArray(req.body) ? req.body : [req.body];
      
      const placeholders = receipts.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = receipts.flatMap(receipt => [
            receipt.mrf, receipt.projectName, receipt.supplierName, receipt.materialName, receipt.quantity, receipt.unit, 
            receipt.receivedBy, receipt.receivingDate, receipt.receivingTime,
            receipt.presenceMeApa, receipt.sgPresence, receipt.cameraLocation, receipt.auditRemarks, receipt.auditBy
      ]);

      await pool.query(
        `INSERT INTO material_receipts (mrf, project_name, supplier_name, material_name, quantity, unit, received_by, receiving_date, receiving_time, presence_me_apa, sg_presence, camera_location, audit_remarks, audit_by) VALUES ${placeholders}`,
        values
      );
      
      res.json({ message: 'Saved successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to save receipts' });
    }
  });

  apiRouter.put('/material-receipts/:id', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Database not connected. Data cannot be saved.' });
      const { id } = req.params;
      // Only update columns whose keys are actually present in the request body,
      // so a partial save (e.g. audit-only from the detail panel) never wipes out
      // fields it didn't send (e.g. core fields from the edit form, or vice versa).
      const fieldMap: Record<string, string> = {
        mrf: 'mrf',
        projectName: 'project_name',
        supplierName: 'supplier_name',
        materialName: 'material_name',
        quantity: 'quantity',
        unit: 'unit',
        receivedBy: 'received_by',
        receivingDate: 'receiving_date',
        receivingTime: 'receiving_time',
        presenceMeApa: 'presence_me_apa',
        sgPresence: 'sg_presence',
        cameraLocation: 'camera_location',
        auditRemarks: 'audit_remarks',
        auditBy: 'audit_by',
      };
      const setClauses: string[] = [];
      const values: any[] = [];
      for (const [bodyKey, column] of Object.entries(fieldMap)) {
        if (req.body[bodyKey] !== undefined) {
          setClauses.push(`${column} = ?`);
          values.push(req.body[bodyKey] ?? null);
        }
      }
      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      values.push(id);
      const [result]: any = await pool.query(
        `UPDATE material_receipts SET ${setClauses.join(', ')} WHERE id = ?`,
        values
      );
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ error: `No receipt found with id ${id}` });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('[material-receipts PUT] Failed to update:', error);
      res.status(500).json({ error: 'Failed to update receipt', details: error?.sqlMessage || error?.message || String(error) });
    }
  });

  apiRouter.delete('/material-receipts/:id', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented' });
      const { id } = req.params;
      await pool.query('DELETE FROM material_receipts WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete receipt' });
    }
  });

  // MONTHLY LINKS API
  apiRouter.get('/department-monthly-links/:month', async (req, res) => {
    const { month } = req.params;
    try {
      if (useMemoryStore || !pool) {
        return res.json((localData.monthlyLinks || []).filter((l: any) => l.report_month === month));
      }
      const [rows] = await pool.query('SELECT * FROM department_monthly_links WHERE report_month = ?', [month]);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch monthly links' });
    }
  });

  apiRouter.post('/department-monthly-links', async (req, res) => {
    const { department_name, report_month, link } = req.body;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.monthlyLinks) localData.monthlyLinks = [];
        const index = localData.monthlyLinks.findIndex((l: any) => l.department_name === department_name && l.report_month === report_month);
        if (index !== -1) {
          localData.monthlyLinks[index] = { ...localData.monthlyLinks[index], link, updated_at: new Date() };
        } else {
          localData.monthlyLinks.push({ id: Date.now(), department_name, report_month, link, updated_at: new Date() });
        }
        saveLocalData(localData);
        return res.json({ message: 'Success (Memory)' });
      }
      
      await pool.query(
        'INSERT INTO department_monthly_links (department_name, report_month, link) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE link = ?',
        [department_name, report_month, link, link]
      );
      res.json({ message: 'Success' });
    } catch (error) {
      console.error('Error saving monthly links:', error);
      res.status(500).json({ error: 'Failed to save monthly links' });
    }
  });

  // PROJECTS API
  apiRouter.get('/projects', async (req, res) => {
    try {
      let projects = [];
      if (useMemoryStore || !pool) {
        projects = localData.projects;
      } else {
        const [rows] = await pool.query('SELECT * FROM projects ORDER BY name ASC');
        projects = rows as any[];
      }
      res.json(projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  apiRouter.post('/projects', async (req, res) => {
    const { name, zone, address } = req.body;
    try {
      if (useMemoryStore || !pool) {
        const newProject = { id: Date.now(), name, zone, address };
        localData.projects.push(newProject);
        saveLocalData(localData);
        return res.json(newProject);
      }
      const [result]: any = await pool.query(
        'INSERT INTO projects (name, zone, address) VALUES (?, ?, ?)',
        [name, zone, address]
      );
      res.json({ id: result.insertId, name, zone, address });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add project' });
    }
  });

  apiRouter.put('/projects/:id', async (req, res) => {
    const { id } = req.params;
    const { name, zone, address } = req.body;
    try {
      if (useMemoryStore || !pool) {
        localData.projects = localData.projects.map((p: any) => p.id == id ? { ...p, name, zone, address } : p);
        saveLocalData(localData);
        return res.json({ id, name, zone, address });
      }
      await pool.query(
        'UPDATE projects SET name = ?, zone = ?, address = ? WHERE id = ?',
        [name, zone, address, id]
      );
      res.json({ id, name, zone, address });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  apiRouter.delete('/projects/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        localData.projects = localData.projects.filter((p: any) => p.id != id);
        saveLocalData(localData);
        return res.json({ message: 'Project deleted' });
      }
      await pool.query('DELETE FROM projects WHERE id = ?', [id]);
      res.json({ message: 'Project deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // DASHBOARD SETTINGS API
  apiRouter.get('/dashboard-settings', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.json(localData.settings);
      const [rows]: any = await pool.query('SELECT * FROM dashboard_settings WHERE id = 1');
      res.json(rows[0] || localData.settings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  apiRouter.put('/dashboard-settings', async (req, res) => {
    const { title, location, status, completion, image } = req.body;
    try {
      if (useMemoryStore || !pool) {
        localData.settings = { title, location, status, completion, image };
        saveLocalData(localData);
        return res.json(localData.settings);
      }
      await pool.query(
        'UPDATE dashboard_settings SET title = ?, location = ?, status = ?, completion = ?, image = ? WHERE id = 1',
        [title, location, status, completion, image]
      );
      res.json({ title, location, status, completion, image });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // SYSTEM ENTRIES API
  apiRouter.get('/system-entries', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.json(localData.entries);
      const [rows] = await pool.query('SELECT * FROM system_entries ORDER BY created_at DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch entries' });
    }
  });

  apiRouter.post('/system-entries', async (req, res) => {
    const { entry_name, entry_type, description } = req.body;
    try {
      if (useMemoryStore || !pool) {
        const newEntry = { id: Date.now(), entry_name, entry_type, description, created_at: new Date() };
        localData.entries.push(newEntry);
        saveLocalData(localData);
        return res.json(newEntry);
      }
      const [result]: any = await pool.query(
        'INSERT INTO system_entries (entry_name, entry_type, description) VALUES (?, ?, ?)',
        [entry_name, entry_type, description]
      );
      res.json({ id: result.insertId, entry_name, entry_type, description });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add entry' });
    }
  });

  // Get all employee visits
  apiRouter.get('/employee-visits', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.visits);
      }
      const [rows]: any = await pool.query(`
        SELECT ev.*, DATE_FORMAT(ev.date, "%Y-%m-%d") as date, vb.images 
        FROM employee_visits ev 
        LEFT JOIN visit_book vb ON ev.date = vb.date 
          AND ev.projectName COLLATE utf8mb4_unicode_ci = vb.projectName COLLATE utf8mb4_unicode_ci
        ORDER BY ev.date DESC, ev.entryTime DESC
      `);
      
      const parsedRows = rows.map((row: any) => {
        let images = row.images;
        if (typeof images === 'string') {
          try { images = JSON.parse(images); } catch(e) { images = []; }
        }
        return { ...row, images: images || [] };
      });

      res.json(parsedRows);
    } catch (error) {
      console.error('Error fetching visits:', error);
      res.status(500).json({ error: 'Failed to fetch visits' });
    }
  });

  // Visit Book API (For images)
  apiRouter.get('/visit-book', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.json(localData.visitBook || []);
      const [rows]: any = await pool.query('SELECT *, DATE_FORMAT(date, "%Y-%m-%d") as date FROM visit_book');
      
      // Ensure images column is parsed
      const parsedRows = rows.map((row: any) => {
        let images = row.images;
        if (typeof images === 'string') {
          try { images = JSON.parse(images); } catch(e) { images = []; }
        }
        return { ...row, images: images || [] };
      });
      
      res.json(parsedRows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch visit book' });
    }
  });

  apiRouter.post('/visit-book', async (req, res) => {
    const { date, projectName, images } = req.body;
    try {
      const savedImages = Array.isArray(images) 
        ? images.map(img => saveImageToFile(img, projectName, date))
        : [];

      if (useMemoryStore || !pool) {
        if (!localData.visitBook) localData.visitBook = [];
        const index = localData.visitBook.findIndex((v: any) => v.date === date && v.projectName === projectName);
        if (index !== -1) {
          localData.visitBook[index].images = savedImages;
        } else {
          localData.visitBook.push({ date, projectName, images: savedImages });
        }
        saveLocalData(localData);
        return res.json({ message: 'Saved to memory', images: savedImages });
      }
      await pool.query(
        'INSERT INTO visit_book (date, projectName, images) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE images = ?',
        [date, projectName, JSON.stringify(savedImages), JSON.stringify(savedImages)]
      );
      res.json({ message: 'Saved to database', images: savedImages });
    } catch (error) {
      console.error('Error saving to visit book:', error);
      res.status(500).json({ error: 'Failed to save visit book' });
    }
  });

  // Create a single employee visit Record
  apiRouter.post('/employee-visits', async (req, res) => {
    const { date, visitorName, department, designation, projectName, entryTime, outTime, duration, remarks, images } = req.body;
    try {
      // If images are provided with a single entry, save to files and update visit_book
      let savedImages = [];
      if (images && images.length > 0) {
        savedImages = images.map((img: string) => saveImageToFile(img, projectName, date));
        
        if (useMemoryStore || !pool) {
          if (!localData.visitBook) localData.visitBook = [];
          const idx = localData.visitBook.findIndex((v: any) => v.date === date && v.projectName === projectName);
          if (idx !== -1) {
            localData.visitBook[idx].images = savedImages;
          } else {
            localData.visitBook.push({ date, projectName, images: savedImages });
          }
        } else {
          await pool.query(
            'INSERT INTO visit_book (date, projectName, images) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE images = ?',
            [date, projectName, JSON.stringify(savedImages), JSON.stringify(savedImages)]
          );
        }
      }

      if (useMemoryStore || !pool) {
        const newVisit = { 
          id: Date.now(), 
          date, 
          visitorName, 
          department, 
          designation, 
          projectName, 
          entryTime, 
          outTime, 
          duration, 
          remarks,
          created_at: new Date().toISOString()
        };
        if (!localData.visits) localData.visits = [];
        localData.visits.unshift(newVisit); // Keep recent at top
        saveLocalData(localData);
        return res.json({ ...newVisit, images: savedImages });
      }
      
      const [result]: any = await pool.query(
        'INSERT INTO employee_visits (date, visitorName, department, designation, projectName, entryTime, outTime, duration, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [date, visitorName, department, designation, projectName, entryTime, outTime, duration, remarks]
      );
      
      const [newRow]: any = await pool.query(`
        SELECT ev.*, DATE_FORMAT(ev.date, "%Y-%m-%d") as date, vb.images 
        FROM employee_visits ev 
        LEFT JOIN visit_book vb ON ev.date = vb.date AND ev.projectName = vb.projectName
        WHERE ev.id = ?
      `, [result.insertId]);
      
      const visit = newRow[0];
      if (visit && typeof visit.images === 'string') {
        try { visit.images = JSON.parse(visit.images); } catch(e) { visit.images = []; }
      }
      if (visit && !visit.images) visit.images = [];

      res.json(visit);
    } catch (error) {
      console.error('Error creating visit:', error);
      res.status(500).json({ error: 'Failed to create visit' });
    }
  });

  // Bulk save employee visits (Import CSV)
  apiRouter.post('/employee-visits/bulk', async (req, res) => {
    const visits = req.body;
    if (!Array.isArray(visits)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    if (useMemoryStore || !pool) {
      const newVisits = visits.map((v: any, index: number) => ({
        id: localData.visits.length + index + 1,
        ...v,
        created_at: new Date()
      }));
      localData.visits = [...localData.visits, ...newVisits];
      saveLocalData(localData);
      return res.json({ message: 'Success (Saved to Memory)', count: newVisits.length });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const query = `
        INSERT INTO employee_visits 
        (date, visitorName, department, designation, projectName, entryTime, outTime, duration, remarks) 
        VALUES ?
      `;
      const values = visits.map(v => [
        v.date,
        v.visitorName,
        v.department || '',
        v.designation || '',
        v.projectName,
        v.entryTime || '',
        v.outTime || '',
        v.duration || '',
        v.remarks || ''
      ]);
      if (values.length > 0) {
        await connection.query(query, [values]);
      }
      await connection.commit();
      res.json({ message: 'Success', count: values.length });
    } catch (error) {
      await connection.rollback();
      console.error('Error saving bulk visits:', error);
      res.status(500).json({ error: 'Failed to save visits' });
    } finally {
      connection.release();
    }
  });

  // Clear all records
  apiRouter.delete('/employee-visits', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        localData.visits = [];
        saveLocalData(localData);
        return res.json({ message: 'All memory records cleared' });
      }
      await pool.query('DELETE FROM employee_visits');
      res.json({ message: 'All database records cleared' });
    } catch (error) {
      console.error('Error clearing visits:', error);
      res.status(500).json({ error: 'Failed to clear visits' });
    }
  });

  // Bulk delete records (selected via checkboxes/filter in UI)
  // NOTE: this must be registered BEFORE '/employee-visits/:id' below,
  // otherwise Express will match "bulk" as an :id param and this route
  // will never be reached.
  apiRouter.delete('/employee-visits/bulk', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid data' });
    }
    try {
      if (useMemoryStore || !pool) {
        localData.visits = localData.visits.filter((v: any) => !ids.includes(v.id));
        saveLocalData(localData);
        return res.json({ message: `${ids.length} record(s) deleted from memory` });
      }
      await pool.query('DELETE FROM employee_visits WHERE id IN (?)', [ids]);
      res.json({ message: `${ids.length} record(s) deleted from database` });
    } catch (error) {
      console.error('Error in bulk delete:', error);
      res.status(500).json({ error: 'Failed to bulk delete visits' });
    }
  });

  // Delete individual record
  apiRouter.delete('/employee-visits/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        localData.visits = localData.visits.filter((v: any) => v.id != id);
        saveLocalData(localData);
        return res.json({ message: 'Record deleted from memory' });
      }
      await pool.query('DELETE FROM employee_visits WHERE id = ?', [id]);
      res.json({ message: 'Record deleted from database' });
    } catch (error) {
      console.error('Error deleting visit:', error);
      res.status(500).json({ error: 'Failed to delete visit' });
    }
  });

  // Update individual record
  apiRouter.put('/employee-visits/:id', async (req, res) => {
    const { id } = req.params;
    const { date, visitorName, department, designation, projectName, entryTime, outTime, duration, remarks } = req.body;
    try {
      if (useMemoryStore || !pool) {
        const index = localData.visits.findIndex((v: any) => v.id == id);
        if (index !== -1) {
          localData.visits[index] = { ...localData.visits[index], date, visitorName, department, designation, projectName, entryTime, outTime, duration, remarks };
          saveLocalData(localData);
          return res.json(localData.visits[index]);
        }
        return res.status(404).json({ error: 'Visit not found' });
      }
      await pool.query(
        `UPDATE employee_visits SET 
          date = ?, visitorName = ?, department = ?, designation = ?, 
          projectName = ?, entryTime = ?, outTime = ?, duration = ?, remarks = ?
        WHERE id = ?`,
        [date, visitorName, department, designation, projectName, entryTime, outTime, duration, remarks, id]
      );
      res.json({ id: Number(id), date, visitorName, department, designation, projectName, entryTime, outTime, duration, remarks });
    } catch (error) {
      console.error('Error updating visit:', error);
      res.status(500).json({ error: 'Failed to update visit' });
    }
  });

  // Bulk update records
  apiRouter.put('/employee-visits-bulk/update', async (req, res) => {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !updates) {
      return res.status(400).json({ error: 'Invalid data' });
    }
    try {
      if (useMemoryStore || !pool) {
        localData.visits = localData.visits.map((v: any) => {
          if (ids.includes(v.id)) return { ...v, ...updates };
          return v;
        });
        saveLocalData(localData);
        return res.json({ message: 'Success' });
      }

      const fields: string[] = [];
      const values: any[] = [];
      if (updates.date) { fields.push('date = ?'); values.push(updates.date); }
      if (updates.visitorName) { fields.push('visitorName = ?'); values.push(updates.visitorName); }
      if (updates.department) { fields.push('department = ?'); values.push(updates.department); }
      if (updates.designation) { fields.push('designation = ?'); values.push(updates.designation); }
      if (updates.remarks) { fields.push('remarks = ?'); values.push(updates.remarks); }

      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

      await pool.query(
        `UPDATE employee_visits SET ${fields.join(', ')} WHERE id IN (?)`,
        [...values, ids]
      );
      res.json({ message: 'Success' });
    } catch (error) {
      console.error('Error in bulk update:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // Get all sales person visits
  apiRouter.get('/sales-person-visits', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.salesPersonVisits || []);
      }
      const [rows] = await pool.query('SELECT id, slNo, employee_id, date, salesPersonName, designation, customerName, customerId, projectName, projectLocation, inTime, outTime, created_at FROM sales_person_visits ORDER BY date DESC');
      const formattedRows = (rows as any[]).map(row => ({
        ...row,
        employeeId: row.employee_id
      }));
      res.json(formattedRows);
    } catch (error) {
      console.error('Error fetching sales person visits:', error);
      res.status(500).json({ error: 'Failed to fetch sales person visits' });
    }
  });

  // Bulk save sales person visits (Import CSV)
  apiRouter.post('/sales-person-visits/bulk', async (req, res) => {
    console.log('[API DEBUG] Received POST /sales-person-visits/bulk with body length:', req.body?.length);
    const visits = req.body;
    if (!Array.isArray(visits)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    if (useMemoryStore || !pool) {
      const newVisits = visits.map((v: any, index: number) => ({
        id: (localData.salesPersonVisits?.length || 0) + index + 1,
        ...v,
        created_at: new Date()
      }));
      localData.salesPersonVisits = [...(localData.salesPersonVisits || []), ...newVisits];
      saveLocalData(localData);
      return res.json({ message: 'Success (Saved to Memory)', count: newVisits.length });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const query = `
        INSERT INTO sales_person_visits 
        (slNo, employee_id, date, salesPersonName, designation, customerName, customerId, projectName, projectLocation, inTime, outTime) 
        VALUES ?
      `;
      const values = visits.map(v => [
        v.slNo || '',
        v.employeeId || '',
        v.date || '',
        v.salesPersonName || '',
        v.designation || '',
        v.customerName || '',
        v.customerId || '',
        v.projectName || '',
        v.projectLocation || '',
        v.inTime || '',
        v.outTime || ''
      ]);
      if (values.length > 0) {
        await connection.query(query, [values]);
      }
      await connection.commit();
      res.json({ message: 'Success', count: values.length });
    } catch (error) {
      await connection.rollback();
      console.error('Error saving bulk sales person visits:', error);
      res.status(500).json({ error: 'Failed to save visits' });
    } finally {
      connection.release();
    }
  });

  // Clear all sales person visits records
  apiRouter.delete('/sales-person-visits', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        localData.salesPersonVisits = [];
        saveLocalData(localData);
        return res.json({ message: 'All memory records cleared' });
      }
      await pool.query('DELETE FROM sales_person_visits');
      res.json({ message: 'All database records cleared' });
    } catch (error) {
      console.error('Error clearing sales person visits:', error);
      res.status(500).json({ error: 'Failed to clear visits' });
    }
  });

  // Working Days (Individual Working Days)
  apiRouter.get('/working-days', async (req, res) => {
    const { month } = req.query; // Expecting YYYY-MM
    try {
      if (useMemoryStore || !pool) {
        const all: any[] = localData.workingDays || [];
        // Deduplicate: keep the last entry per visitorName+month_year
        const seen = new Map<string, any>();
        all.forEach(d => {
          const key = `${d.visitorName}|${d.month_year}`;
          seen.set(key, d); // last one wins
        });
        const filtered = Array.from(seen.values()).filter(d => !month || d.month_year === month);
        return res.json(filtered);
      }
      const [rows] = await pool.query('SELECT * FROM employee_working_days WHERE month_year = ?', [month]);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch working days' });
    }
  });

  apiRouter.post('/working-days', async (req, res) => {
    const { visitorName, month_year, working_days } = req.body;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.workingDays) localData.workingDays = [];
        const index = localData.workingDays.findIndex((d: any) => d.visitorName === visitorName && d.month_year === month_year);
        if (index !== -1) {
            localData.workingDays[index].working_days = working_days;
        } else {
            localData.workingDays.push({ id: Date.now(), visitorName, month_year, working_days });
        }
        saveLocalData(localData);
        return res.json({ message: 'Success' });
      }
      await pool.query(
        'INSERT INTO employee_working_days (visitorName, month_year, working_days) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE working_days = VALUES(working_days)',
        [visitorName, month_year, working_days]
      );
      res.json({ message: 'Success' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save working day' });
    }
  });

  apiRouter.delete('/working-days/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (localData.workingDays) {
            localData.workingDays = localData.workingDays.filter((d: any) => d.id != id);
            saveLocalData(localData);
        }
        return res.json({ message: 'Deleted' });
      }
      await pool.query('DELETE FROM employee_working_days WHERE id = ?', [id]);
      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete working day' });
    }
  });

  // Rename an employee across all their Individual Working Days entries.
  // Called when a visitor's name is corrected/renamed in Employee Project
  // Visit (single or bulk edit), so old-name and new-name rows don't end
  // up looking like two different people in the Working Days list.
  // If a row already exists for (newName, month_year), the older of the
  // two (lower id) is dropped and the newer one is kept, rather than
  // erroring on the unique key.
  apiRouter.put('/working-days/rename-employee', async (req, res) => {
    const { oldName, newName } = req.body;
    if (!oldName || !newName || oldName === newName) {
      return res.status(400).json({ error: 'oldName and newName are required and must differ' });
    }
    try {
      if (useMemoryStore || !pool) {
        if (!localData.workingDays) localData.workingDays = [];
        let renamed = 0;
        let merged = 0;
        // Group all rows (old + new name) by month, keep the newest (highest id) per month.
        const relevant = localData.workingDays.filter(
          (d: any) => d.visitorName === oldName || d.visitorName === newName
        );
        const byMonth = new Map<string, any>();
        relevant.forEach((d: any) => {
          const current = byMonth.get(d.month_year);
          if (!current || d.id > current.id) byMonth.set(d.month_year, d);
        });
        const winnersIds = new Set(Array.from(byMonth.values()).map((d: any) => d.id));
        localData.workingDays.forEach((d: any) => {
          if (winnersIds.has(d.id) && (d.visitorName === oldName || d.visitorName === newName)) {
            if (d.visitorName === oldName) renamed++;
            d.visitorName = newName;
          }
        });
        const before = localData.workingDays.length;
        localData.workingDays = localData.workingDays.filter(
          (d: any) => winnersIds.has(d.id) || (d.visitorName !== oldName && d.visitorName !== newName)
        );
        merged = before - localData.workingDays.length;
        saveLocalData(localData);
        return res.json({ message: 'Success', renamed, merged });
      }

      const [oldRows]: any = await pool.query(
        'SELECT id, month_year FROM employee_working_days WHERE visitorName = ?',
        [oldName]
      );
      let renamed = 0;
      let merged = 0;
      for (const row of oldRows) {
        const [[existing]]: any = await pool.query(
          'SELECT id, working_days FROM employee_working_days WHERE visitorName = ? AND month_year = ?',
          [newName, row.month_year]
        );
        if (existing) {
          // Collision: keep the newer entry, drop the older one.
          if (existing.id > row.id) {
            await pool.query('DELETE FROM employee_working_days WHERE id = ?', [row.id]);
          } else {
            await pool.query('DELETE FROM employee_working_days WHERE id = ?', [existing.id]);
            await pool.query('UPDATE employee_working_days SET visitorName = ? WHERE id = ?', [newName, row.id]);
          }
          merged++;
        } else {
          await pool.query('UPDATE employee_working_days SET visitorName = ? WHERE id = ?', [newName, row.id]);
          renamed++;
        }
      }
      res.json({ message: 'Success', renamed, merged });
    } catch (error) {
      console.error('Error renaming employee in working days:', error);
      res.status(500).json({ error: 'Failed to rename employee in working days' });
    }
  });

  apiRouter.get('/all-monthly-configs', async (req, res) => {
    try {
        if (useMemoryStore || !pool) {
            return res.json(localData.monthly_config || []);
        }
        const [rows] = await pool.query('SELECT * FROM monthly_config ORDER BY month_year DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all monthly configs' });
    }
  });

  apiRouter.get('/settings', async (req, res) => {
    try {
        if (useMemoryStore || !pool) return res.json(localData.settings || {});
        const [rows] = await pool.query('SELECT * FROM app_settings');
        const settings = Object.fromEntries((rows as any[]).map(r => [r.setting_key, r.setting_value]));
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  apiRouter.get('/monthly-config', async (req, res) => {
    const { month } = req.query;
    try {
        if (useMemoryStore || !pool) {
            const config = (localData.monthly_config || []).find((c: any) => c.month_year === month);
            return res.json(config || { month_year: month, default_wd: 25, security_wd: 0, office_wd: 0 });
        }
        const [rows] = await pool.query('SELECT * FROM monthly_config WHERE month_year = ?', [month]);
        if ((rows as any[]).length > 0) {
            res.json(rows[0]);
        } else {
            res.json({ month_year: month, default_wd: 25, security_wd: 0, office_wd: 0 });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch monthly config' });
    }
  });

  apiRouter.post('/monthly-config', async (req, res) => {
    const { month_year, default_wd, security_wd, office_wd } = req.body;
    const defWd = parseInt(String(default_wd)) || 0;
    const secWd = parseInt(String(security_wd)) || 0;
    const offWd = parseInt(String(office_wd)) || 0;
    try {
        if (useMemoryStore || !pool) {
            if (!localData.monthly_config) localData.monthly_config = [];
            const idx = localData.monthly_config.findIndex((c: any) => c.month_year === month_year);
            const newData = { month_year, default_wd: defWd, security_wd: secWd, office_wd: offWd };
            if (idx > -1) localData.monthly_config[idx] = newData;
            else localData.monthly_config.push(newData);
            saveLocalData(localData);
            return res.json({ message: 'Success' });
        }
        await pool.query(
            'INSERT INTO monthly_config (month_year, default_wd, security_wd, office_wd) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE default_wd = ?, security_wd = ?, office_wd = ?',
            [month_year, defWd, secWd, offWd, defWd, secWd, offWd]
        );
        res.json({ message: 'Success' });
    } catch (error) {
        console.error('Error saving monthly config:', error);
        res.status(500).json({ error: 'Failed to save monthly config' });
    }
  });

  apiRouter.delete('/monthly-config/:month_year', async (req, res) => {
    const { month_year } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (localData.monthly_config) {
          localData.monthly_config = localData.monthly_config.filter((c: any) => c.month_year !== month_year);
          saveLocalData(localData);
        }
        return res.json({ message: 'Deleted' });
      }
      await pool.query('DELETE FROM monthly_config WHERE month_year = ?', [month_year]);
      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete monthly config' });
    }
  });

  apiRouter.post('/settings', async (req, res) => {
    const { key, value } = req.body;
    try {
        if (useMemoryStore || !pool) {
            if (!localData.settings) localData.settings = {};
            localData.settings[key] = value;
            saveLocalData(localData);
            return res.json({ message: 'Success' });
        }
        await pool.query(
            'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            [key, value]
        );
        res.json({ message: 'Success' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save setting' });
    }
  });

  // SALES TEAMS API
  apiRouter.get('/sales-teams', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.salesTeams || []);
      }
      const [rows] = await pool.query('SELECT * FROM sales_teams ORDER BY id ASC');
      // Parse members JSON
      const formattedRows = (rows as any[]).map(row => ({
        ...row,
        members: typeof row.members === 'string' ? JSON.parse(row.members) : row.members
      }));
      res.json(formattedRows);
    } catch (error) {
      console.error('Error fetching sales teams:', error);
      res.status(500).json({ error: 'Failed to fetch sales teams' });
    }
  });

  apiRouter.post('/sales-teams', async (req, res) => {
    const { teamName, leader, members } = req.body;
    try {
      if (useMemoryStore || !pool) {
        const newTeam = { id: Date.now(), teamName, leader, members };
        localData.salesTeams = localData.salesTeams || [];
        localData.salesTeams.push(newTeam);
        saveLocalData(localData);
        return res.json(newTeam);
      }
      const membersJson = JSON.stringify(members);
      const [result]: any = await pool.query(
        'INSERT INTO sales_teams (teamName, leader, members) VALUES (?, ?, ?)',
        [teamName, leader, membersJson]
      );
      res.json({ id: result.insertId, teamName, leader, members });
    } catch (error) {
      console.error('Error adding team:', error);
      res.status(500).json({ error: 'Failed to add team' });
    }
  });

  apiRouter.put('/sales-teams/:id', async (req, res) => {
    const { id } = req.params;
    const { teamName, leader, members } = req.body;
    try {
      if (useMemoryStore || !pool) {
        localData.salesTeams = localData.salesTeams.map((t: any) => t.id == id ? { ...t, teamName, leader, members } : t);
        saveLocalData(localData);
        return res.json({ id: parseInt(id), teamName, leader, members });
      }
      const membersJson = JSON.stringify(members);
      await pool.query(
        'UPDATE sales_teams SET teamName = ?, leader = ?, members = ? WHERE id = ?',
        [teamName, leader, membersJson, id]
      );
      res.json({ id: parseInt(id), teamName, leader, members });
    } catch (error) {
      console.error('Error updating team:', error);
      res.status(500).json({ error: 'Failed to update team' });
    }
  });

  apiRouter.delete('/sales-teams/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        localData.salesTeams = localData.salesTeams.filter((t: any) => t.id != id);
        saveLocalData(localData);
        return res.json({ message: 'Team deleted' });
      }
      await pool.query('DELETE FROM sales_teams WHERE id = ?', [id]);
      res.json({ message: 'Team deleted' });
    } catch (error) {
      console.error('Error deleting team:', error);
      res.status(500).json({ error: 'Failed to delete team' });
    }
  });

  // SALES EMPLOYEES API
  apiRouter.get('/sales-employees', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.salesEmployees || []);
      }
      const [rows] = await pool.query('SELECT * FROM sales_employees ORDER BY id ASC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching sales employees:', error);
      res.status(500).json({ error: 'Failed to fetch sales employees' });
    }
  });

  // USER PROFILES API
  apiRouter.get('/user-profile/:empId', async (req, res) => {
    const { empId } = req.params;
    try {
      if (useMemoryStore || !pool) {
         return res.status(404).json({ error: 'Profiles not supported in memory store' });
      }
      const [rows]: any = await pool.query('SELECT * FROM user_profiles WHERE empId = ?', [empId]);
      res.json(rows[0] || {});
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  apiRouter.post('/user-profile', async (req, res) => {
    console.log('[API DEBUG] POST /user-profile reached');
    const { empId, userName, email, bio, profilePicture, designation, department, division, dateOfBirth, nationality, religion, gender, mobileNumber } = req.body;
    try {
      if (useMemoryStore || !pool) {
         return res.status(500).json({ error: 'Profiles not supported in memory store' });
      }
      await pool.query(
        'INSERT INTO user_profiles (empId, userName, email, bio, profilePicture, designation, department, division, dateOfBirth, nationality, religion, gender, mobileNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE userName=?, email=?, bio=?, profilePicture=?, designation=?, department=?, division=?, dateOfBirth=?, nationality=?, religion=?, gender=?, mobileNumber=?',
        [empId, userName, email, bio, profilePicture, designation, department, division, dateOfBirth, nationality, religion, gender, mobileNumber, userName, email, bio, profilePicture, designation, department, division, dateOfBirth, nationality, religion, gender, mobileNumber]
      );
      res.json({ empId, userName, email, bio, profilePicture, designation, department, division, dateOfBirth, nationality, religion, gender, mobileNumber });
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({ error: 'Failed to update user profile' });
    }
  });

  // DEPARTMENT SUMMARIES API
  apiRouter.get('/department-summaries', async (req, res) => {
    const { month } = req.query;
    try {
      if (useMemoryStore || !pool) return res.json([]);
      let query = 'SELECT * FROM department_summaries';
      let params: any[] = [];
      if (month) {
        query += ' WHERE report_month = ?';
        params.push(month);
      }
      query += ' ORDER BY department, visitor_name';
      const [rows] = await pool.query(query, params);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching summaries:', error);
      res.status(500).json({ error: 'Failed to fetch' });
    }
  });

  apiRouter.post('/department-summaries/bulk', async (req, res) => {
    const { month, data } = req.body;
    if (!month || !Array.isArray(data)) return res.status(400).json({ error: 'Invalid data' });
    try {
      if (useMemoryStore || !pool) return res.status(500).json({ error: 'Not supported' });
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const query = `
          INSERT INTO department_summaries 
          (report_month, department, visitor_name, designation, total_working_day, total_visited_day, total_visit_logs, total_visited_project_count,
           duration_more_than_20, duration_10_to_19, duration_5_to_9, duration_less_than_5, supposedly_duration_day, supposedly_duration_month,
           actual_duration, duration_percentage)
          VALUES ?
          ON DUPLICATE KEY UPDATE 
            department=VALUES(department), 
            designation=VALUES(designation),
            total_working_day=VALUES(total_working_day),
            total_visited_day=VALUES(total_visited_day),
            total_visit_logs=VALUES(total_visit_logs),
            total_visited_project_count=VALUES(total_visited_project_count),
            duration_more_than_20=VALUES(duration_more_than_20),
            duration_10_to_19=VALUES(duration_10_to_19),
            duration_5_to_9=VALUES(duration_5_to_9),
            duration_less_than_5=VALUES(duration_less_than_5),
            supposedly_duration_day=VALUES(supposedly_duration_day),
            supposedly_duration_month=VALUES(supposedly_duration_month),
            actual_duration=VALUES(actual_duration),
            duration_percentage=VALUES(duration_percentage)
        `;
        const values = data.map(d => [
          month, d.department, d.visitorName, d.designation, d.totalWorkingDay, d.totalVisitedDay, d.totalVisitLogs, d.totalVisitedProjectCount,
          d.durationCount.moreThan20, d.durationCount.tenTo19, d.durationCount.fiveTo9, d.durationCount.lessThan5,
          d.supposedlyVisitDurationDay, d.supposedlyVisitDurationMonth, d.currentMonthActualDuration, d.currentMonthDurationPercentage
        ]);
        if (values.length > 0) {
          await connection.query(query, [values]);
        }
        await connection.commit();
        res.json({ message: 'Saved successfully', count: values.length });
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error saving summaries:', error);
      res.status(500).json({ error: 'Failed to save' });
    }
  });

  apiRouter.put('/department-summaries/:id', async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(500).json({ error: 'Not supported' });
      await pool.query(
        `UPDATE department_summaries SET 
          total_working_day=?, total_visited_day=?, total_visit_logs=?, total_visited_project_count=?,
          duration_more_than_20=?, duration_10_to_19=?, duration_5_to_9=?, duration_less_than_5=?,
          supposedly_duration_day=?, supposedly_duration_month=?, actual_duration=?, duration_percentage=?
         WHERE id=?`,
        [
          updateData.total_working_day, updateData.total_visited_day, updateData.total_visit_logs, updateData.total_visited_project_count,
          updateData.duration_more_than_20, updateData.duration_10_to_19, updateData.duration_5_to_9, updateData.duration_less_than_5,
          updateData.supposedly_duration_day, updateData.supposedly_duration_month, updateData.actual_duration, updateData.duration_percentage,
          id
        ]
      );
      res.json({ message: 'Updated' });
    } catch (error) {
       console.error('Error updating summary:', error);
       res.status(500).json({ error: 'Failed to update' });
    }
  });

  apiRouter.delete('/department-summaries/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) return res.status(500).json({ error: 'Not supported' });
      await pool.query('DELETE FROM department_summaries WHERE id = ?', [id]);
      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.post('/sales-employees', async (req, res) => {
    console.log('[API DEBUG] POST /sales-employees reached. Body:', JSON.stringify(req.body));
    const { empId, name, designation, position, teamLeader, departmentHod } = req.body;
    try {
      if (useMemoryStore || !pool) {
        const newEmp = { id: Date.now(), empId, name, designation, position, teamLeader, departmentHod };
        localData.salesEmployees = localData.salesEmployees || [];
        localData.salesEmployees.push(newEmp);
        saveLocalData(localData);
        return res.json(newEmp);
      }
      const [result]: any = await pool.query(
        'INSERT INTO sales_employees (empId, name, designation, position, teamLeader, departmentHod) VALUES (?, ?, ?, ?, ?, ?)',
        [empId, name, designation, position, teamLeader, departmentHod]
      );
      res.json({ id: result.insertId, empId, name, designation, position, teamLeader, departmentHod });
    } catch (error) {
      console.error('Error adding employee:', error);
      res.status(500).json({ error: 'Failed to add employee', details: (error as Error).message });
    }
  });

  apiRouter.put('/sales-employees/:id', async (req, res) => {
    const { id } = req.params;
    const { empId, name, designation, position, teamLeader, departmentHod } = req.body;
    try {
      if (useMemoryStore || !pool) {
        localData.salesEmployees = localData.salesEmployees.map((e: any) => e.id == id ? { ...e, empId, name, designation, position, teamLeader, departmentHod } : e);
        saveLocalData(localData);
        return res.json({ id: parseInt(id), empId, name, designation, position, teamLeader, departmentHod });
      }
      await pool.query(
        'UPDATE sales_employees SET empId = ?, name = ?, designation = ?, position = ?, teamLeader = ?, departmentHod = ? WHERE id = ?',
        [empId, name, designation, position, teamLeader, departmentHod, id]
      );
      res.json({ id: parseInt(id), empId, name, designation, position, teamLeader, departmentHod });
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(500).json({ error: 'Failed to update employee' });
    }
  });

  apiRouter.delete('/sales-employees/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        localData.salesEmployees = localData.salesEmployees.filter((e: any) => e.id != id);
        saveLocalData(localData);
        return res.json({ message: 'Employee deleted' });
      }
      await pool.query('DELETE FROM sales_employees WHERE id = ?', [id]);
      res.json({ message: 'Employee deleted' });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ error: 'Failed to delete employee' });
    }
  });

  // ALL EMPLOYEES API
  apiRouter.get('/all-employees', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.allEmployees || []);
      }
      const [rows] = await pool.query('SELECT * FROM all_employees ORDER BY name ASC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching all employees:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.post('/all-employees', async (req, res) => {
    const { employeeId, name, designation, department, email, phone, isActive } = req.body;
    const activeVal = isActive === false ? 0 : 1;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.allEmployees) localData.allEmployees = [];
        const newItem = { id: Date.now(), employee_id: employeeId, name, designation, department, email, phone, is_active: activeVal };
        const idx = localData.allEmployees.findIndex((e: any) => e.employee_id === employeeId);
        if (idx > -1) localData.allEmployees[idx] = { ...localData.allEmployees[idx], ...newItem };
        else localData.allEmployees.push(newItem);
        saveLocalData(localData);
        return res.json(newItem);
      }
      const [result]: any = await pool.query(
        'INSERT INTO all_employees (employee_id, name, designation, department, email, phone, is_active) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), designation=VALUES(designation), department=VALUES(department), email=VALUES(email), phone=VALUES(phone), is_active=VALUES(is_active)', 
        [employeeId, name, designation, department, email, phone, activeVal]
      );
      let finalId = result.insertId;
      if (!finalId) {
        const [[existing]]: any = await pool.query('SELECT id FROM all_employees WHERE employee_id = ?', [employeeId]);
        finalId = existing?.id;
      }
      res.json({ id: finalId, employee_id: employeeId, name, designation, department, email, phone, is_active: activeVal });
    } catch (error) {
      console.error('Error adding employee:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.post('/all-employees/bulk', async (req, res) => {
    const { employees } = req.body;
    if (!employees || !Array.isArray(employees)) return res.status(400).json({ error: 'Invalid data' });
    try {
      if (useMemoryStore || !pool) {
        if (!localData.allEmployees) localData.allEmployees = [];
        employees.forEach((emp, idx) => {
          const activeVal = emp.isActive === false ? 0 : 1;
          const index = localData.allEmployees.findIndex((e: any) => e.employee_id === emp.employeeId);
          const newItem = { id: Date.now() + idx, employee_id: emp.employeeId, name: emp.name, designation: emp.designation, department: emp.department, email: emp.email, phone: emp.phone, is_active: activeVal };
          if (index > -1) localData.allEmployees[index] = newItem;
          else localData.allEmployees.push(newItem);
        });
        saveLocalData(localData);
        return res.json({ success: true });
      }
      const values = employees.map(e => [e.employeeId, e.name, e.designation, e.department, e.email, e.phone, e.isActive === false ? 0 : 1]);
      if (values.length > 0) {
        await pool.query(
          'INSERT INTO all_employees (employee_id, name, designation, department, email, phone, is_active) VALUES ? ON DUPLICATE KEY UPDATE name=VALUES(name), designation=VALUES(designation), department=VALUES(department), email=VALUES(email), phone=VALUES(phone), is_active=VALUES(is_active)', 
          [values]
        );
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error bulk adding employees:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.patch('/all-employees/:id/toggle-active', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        const emp = (localData.allEmployees || []).find((e: any) => e.id == id);
        if (!emp) return res.status(404).json({ error: 'Not found' });
        emp.is_active = emp.is_active ? 0 : 1;
        saveLocalData(localData);
        return res.json(emp);
      }
      const [[current]]: any = await pool.query('SELECT is_active FROM all_employees WHERE id = ?', [id]);
      if (!current) return res.status(404).json({ error: 'Not found' });
      const newVal = current.is_active ? 0 : 1;
      await pool.query('UPDATE all_employees SET is_active = ? WHERE id = ?', [newVal, id]);
      res.json({ id: Number(id), is_active: newVal });
    } catch (error) {
      console.error('Error toggling employee status:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.delete('/all-employees/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        localData.allEmployees = (localData.allEmployees || []).filter((e: any) => e.id != id);
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM all_employees WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // Inventory Config API
  apiRouter.get('/inventory-config', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.inventoryConfig || []);
      }
      const [rows] = await pool.query('SELECT * FROM inventory_config');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching inventory config:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.post('/inventory-config', async (req, res) => {
    const { visitorName, side } = req.body;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.inventoryConfig) localData.inventoryConfig = [];
        const idx = localData.inventoryConfig.findIndex((c: any) => c.visitorName === visitorName);
        if (idx !== -1) {
          localData.inventoryConfig[idx].side = side;
        } else {
          localData.inventoryConfig.push({ visitorName, side });
        }
        saveLocalData(localData);
        return res.json({ visitorName, side });
      }
      await pool.query(
        'INSERT INTO inventory_config (visitorName, side) VALUES (?, ?) ON DUPLICATE KEY UPDATE side = VALUES(side)',
        [visitorName, side]
      );
      res.json({ visitorName, side });
    } catch (error) {
      console.error('Error saving inventory config:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // SALEABLE PROJECTS API
  apiRouter.get('/saleable-projects', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.saleableProjects || []);
      }
      const [rows] = await pool.query('SELECT * FROM saleable_projects ORDER BY project_name ASC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching saleable projects:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.post('/saleable-projects', async (req, res) => {
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: 'Project name is required' });
    try {
      if (useMemoryStore || !pool) {
        if (!localData.saleableProjects) localData.saleableProjects = [];
        const newItem = { id: Date.now(), project_name: projectName };
        localData.saleableProjects.push(newItem);
        saveLocalData(localData);
        return res.json(newItem);
      }
      const [result]: any = await pool.query('INSERT IGNORE INTO saleable_projects (project_name) VALUES (?)', [projectName]);
      res.json({ id: result.insertId, project_name: projectName });
    } catch (error) {
      console.error('Error adding saleable project:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.post('/saleable-projects/bulk', async (req, res) => {
    const { projects } = req.body; // Expecting { projects: ['Project A', 'Project B'] }
    if (!projects || !Array.isArray(projects)) return res.status(400).json({ error: 'Invalid data' });

    try {
      if (useMemoryStore || !pool) {
        if (!localData.saleableProjects) localData.saleableProjects = [];
        const newItems = projects.map((p, idx) => ({ id: Date.now() + idx, project_name: p }));
        localData.saleableProjects.push(...newItems);
        // Ensure uniqueness if needed
        localData.saleableProjects = _.uniqBy(localData.saleableProjects, 'project_name');
        saveLocalData(localData);
        return res.json({ success: true, count: projects.length });
      }

      // Using INSERT IGNORE to skip duplicates
      const values = projects.map(p => [p]);
      if (values.length > 0) {
        await pool.query('INSERT IGNORE INTO saleable_projects (project_name) VALUES ?', [values]);
      }
      res.json({ success: true, count: projects.length });
    } catch (error) {
      console.error('Error bulk adding saleable projects:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.put('/saleable-projects/:id', async (req, res) => {
    const { id } = req.params;
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: 'Project name is required' });
    try {
      if (useMemoryStore || !pool) {
        if (!localData.saleableProjects) localData.saleableProjects = [];
        const index = localData.saleableProjects.findIndex((p: any) => p.id == id);
        if (index !== -1) {
          localData.saleableProjects[index].project_name = projectName;
          saveLocalData(localData);
          return res.json(localData.saleableProjects[index]);
        }
        return res.status(404).json({ error: 'Not found' });
      }
      await pool.query('UPDATE saleable_projects SET project_name = ? WHERE id = ?', [projectName, id]);
      res.json({ id: Number(id), project_name: projectName });
    } catch (error) {
      console.error('Error updating saleable project:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.delete('/saleable-projects', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        localData.saleableProjects = [];
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM saleable_projects');
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing saleable projects:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.delete('/saleable-projects/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        localData.saleableProjects = (localData.saleableProjects || []).filter((p: any) => p.id != id);
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM saleable_projects WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting saleable project:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  // KPI DATA API
  apiRouter.get('/kpi-data', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.kpiData || []);
      }
      const [rows] = await pool.query('SELECT * FROM kpi_data ORDER BY id DESC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching KPI data:', error);
      res.status(500).json({ error: 'Failed to fetch KPI data' });
    }
  });

  apiRouter.post('/kpi-data/bulk', async (req, res) => {
    const kpiItems = req.body; // Expecting an array of objects
    if (!Array.isArray(kpiItems)) {
      return res.status(400).json({ error: 'Invalid data format: expected an array' });
    }

    try {
      if (useMemoryStore || !pool) {
        if (kpiItems.length === 0) {
          localData.kpiData = [];
        } else {
          localData.kpiData = kpiItems.map((item, idx) => ({ id: Date.now() + idx, ...item }));
        }
        saveLocalData(localData);
        return res.json({ message: 'KPI data processed (memory storage)', count: kpiItems.length });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        
        // Clear existing data before bulk import or if empty array sent
        await connection.query('DELETE FROM kpi_data');

        // Efficient bulk insert approach
        if (kpiItems.length > 0) {
          const values = kpiItems.map(item => [
            item.sl || '', 
            item.empId || '', 
            item.associate || '', 
            item.date || '', 
            item.projectInfo || '', 
            item.leadInfo || ''
          ]);
          await connection.query('INSERT INTO kpi_data (sl, emp_id, associate, date, project_info, lead_info) VALUES ?', [values]);
        }
        
        await connection.commit();
        res.json({ message: 'Bulk KPI import successful', count: kpiItems.length });
      } catch (innerError) {
        await connection.rollback();
        throw innerError;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error during bulk KPI import:', error);
      res.status(500).json({ error: 'Bulk import failed', details: (error as Error).message });
    }
  });

  apiRouter.put('/kpi-data/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`[KPI-UPDATE-DEBUG] Received PUT request for ID: ${id}`);
    const { sl, emp_id, associate, date, project_info, lead_info } = req.body;
    try {
      if (useMemoryStore || !pool) {
        localData.kpiData = (localData.kpiData || []).map((item: any) => 
          item.id == id ? { ...item, sl, empId: emp_id, associate, date, projectInfo: project_info, leadInfo: lead_info } : item
        );
        saveLocalData(localData);
        return res.json({ id, sl, emp_id, associate, date, project_info, lead_info });
      }
      await pool.query(
        'UPDATE kpi_data SET sl = ?, emp_id = ?, associate = ?, date = ?, project_info = ?, lead_info = ? WHERE id = ?',
        [sl, emp_id, associate, date, project_info, lead_info, id]
      );
      res.json({ id, sl, emp_id, associate, date, project_info, lead_info });
    } catch (error) {
      console.error('Error updating KPI data:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });

  apiRouter.post('/sales-employees/bulk', async (req, res) => {
    const employees = req.body;
    if (!Array.isArray(employees)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    if (useMemoryStore || !pool) {
      const newEmployees = employees.map((e: any, index: number) => ({
        id: (localData.salesEmployees?.length || 0) + index + 1,
        ...e
      }));
      localData.salesEmployees = [...(localData.salesEmployees || []), ...newEmployees];
      saveLocalData(localData);
      return res.json({ message: 'Success (Saved to Memory)', count: newEmployees.length });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const query = `
        INSERT INTO sales_employees 
        (empId, name, designation, position, teamLeader, departmentHod) 
        VALUES ?
      `;
      const values = employees.map(e => [
        e.empId || '',
        e.name || '',
        e.designation || '',
        e.position || '',
        e.teamLeader || '',
        e.departmentHod || ''
      ]);
      if (values.length > 0) {
        await connection.query(query, [values]);
      }
      await connection.commit();
      res.json({ message: 'Success', count: values.length });
    } catch (error) {
      await connection.rollback();
      console.error('Error saving bulk employees:', error);
      res.status(500).json({ error: 'Failed to save employees' });
    } finally {
      connection.release();
    }
  });

  // IT ASSIGNED ISSUES API
  apiRouter.get('/it-issues', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.itIssues);
      }
      const [rows] = await pool.query('SELECT id as db_id, issue_id as id, issue_text as issue, DATE_FORMAT(reported_at, "%Y-%m-%dT%H:%i:%s.000Z") as reportedAt, assigned_to as assignedTo, status, project_name as projectName, zone, created_at FROM it_assigned_issues ORDER BY reported_at DESC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching IT issues:', error);
      res.status(500).json({ error: 'Failed to fetch issues' });
    }
  });

  apiRouter.post('/it-issues/bulk', async (req, res) => {
    const issues = req.body;
    if (!Array.isArray(issues)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    if (useMemoryStore || !pool) {
      const newIssues = issues.map((i: any, index: number) => ({
        local_id: localData.itIssues.length + index + 1,
        ...i,
        created_at: new Date()
      }));
      localData.itIssues = [...localData.itIssues, ...newIssues];
      saveLocalData(localData);
      return res.json({ message: 'Success (Saved to Memory)', count: newIssues.length });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const query = `
        INSERT INTO it_assigned_issues 
        (issue_id, issue_text, reported_at, assigned_to, status, project_name, zone) 
        VALUES ?
      `;
      const values = issues.map(i => [
        i.id,
        i.issue,
        new Date(i.reportedAt),
        i.assignedTo,
        i.status,
        i.projectName,
        i.zone
      ]);
      if (values.length > 0) {
        await connection.query(query, [values]);
      }
      await connection.commit();
      res.json({ message: 'Success', count: values.length });
    } catch (error) {
      await connection.rollback();
      console.error('Error saving IT issues:', error);
      res.status(500).json({ error: 'Failed to save issues to database' });
    } finally {
      connection.release();
    }
  });

  apiRouter.delete('/it-issues', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        localData.itIssues = [];
        saveLocalData(localData);
        return res.json({ message: 'All memory records cleared' });
      }
      await pool.query('DELETE FROM it_assigned_issues');
      res.json({ message: 'All database records cleared' });
    } catch (error) {
      console.error('Error clearing IT issues:', error);
      res.status(500).json({ error: 'Failed to clear database' });
    }
  });

  // IT DEVICE CREDENTIALS API (Zone-wise device login records)
  apiRouter.get('/device-credentials', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.deviceCredentials || []);
      }
      const [rows] = await pool.query(
        'SELECT id, zone, project_name as projectName, device_sl_no as deviceSlNo, username, password, created_at as createdAt, updated_at as updatedAt FROM it_device_credentials ORDER BY zone ASC, project_name ASC, device_sl_no ASC'
      );
      res.json(rows);
    } catch (error) {
      console.error('Error fetching device credentials:', error);
      res.status(500).json({ error: 'Failed to fetch device credentials' });
    }
  });

  apiRouter.post('/device-credentials', async (req, res) => {
    const { zone, projectName, deviceSlNo, username, password } = req.body;
    if (!zone || !projectName || !deviceSlNo) {
      return res.status(400).json({ error: 'Zone, Project Name and Device SL No are required.' });
    }
    try {
      if (useMemoryStore || !pool) {
        if (!localData.deviceCredentials) localData.deviceCredentials = [];
        const newRecord = {
          id: Date.now(),
          zone,
          projectName,
          deviceSlNo,
          username: username || '',
          password: password || '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        localData.deviceCredentials.push(newRecord);
        saveLocalData(localData);
        return res.json({ message: 'Success (Memory)', record: newRecord });
      }

      const [result]: any = await pool.query(
        'INSERT INTO it_device_credentials (zone, project_name, device_sl_no, username, password) VALUES (?, ?, ?, ?, ?)',
        [zone, projectName, deviceSlNo, username || '', password || '']
      );
      res.json({ message: 'Success', id: result.insertId });
    } catch (error) {
      console.error('Error saving device credential:', error);
      res.status(500).json({ error: 'Failed to save device credential' });
    }
  });

  apiRouter.post('/device-credentials/bulk', async (req, res) => {
    const records = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    const invalidIndex = records.findIndex(
      (r: any) => !r.zone || !r.projectName || !r.deviceSlNo
    );
    if (invalidIndex !== -1) {
      return res.status(400).json({
        error: `Row ${invalidIndex + 1}: Zone, Project Name and Device SL No are required.`,
      });
    }

    if (useMemoryStore || !pool) {
      if (!localData.deviceCredentials) localData.deviceCredentials = [];
      const newRecords = records.map((r: any, index: number) => ({
        id: Date.now() + index,
        zone: r.zone,
        projectName: r.projectName,
        deviceSlNo: r.deviceSlNo,
        username: r.username || '',
        password: r.password || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      localData.deviceCredentials = [...localData.deviceCredentials, ...newRecords];
      saveLocalData(localData);
      return res.json({ message: 'Success (Memory)', count: newRecords.length });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const query = `
        INSERT INTO it_device_credentials
        (zone, project_name, device_sl_no, username, password)
        VALUES ?
      `;
      const values = records.map((r: any) => [
        r.zone,
        r.projectName,
        r.deviceSlNo,
        r.username || '',
        r.password || '',
      ]);
      await connection.query(query, [values]);
      await connection.commit();
      res.json({ message: 'Success', count: values.length });
    } catch (error) {
      await connection.rollback();
      console.error('Error bulk saving device credentials:', error);
      res.status(500).json({ error: 'Failed to save device credentials to database' });
    } finally {
      connection.release();
    }
  });

  apiRouter.put('/device-credentials/:id', async (req, res) => {
    const { id } = req.params;
    const { zone, projectName, deviceSlNo, username, password } = req.body;
    if (!zone || !projectName || !deviceSlNo) {
      return res.status(400).json({ error: 'Zone, Project Name and Device SL No are required.' });
    }
    try {
      if (useMemoryStore || !pool) {
        if (!localData.deviceCredentials) localData.deviceCredentials = [];
        const index = localData.deviceCredentials.findIndex((d: any) => String(d.id) === String(id));
        if (index === -1) return res.status(404).json({ error: 'Record not found' });
        localData.deviceCredentials[index] = {
          ...localData.deviceCredentials[index],
          zone,
          projectName,
          deviceSlNo,
          username: username || '',
          password: password || '',
          updatedAt: new Date(),
        };
        saveLocalData(localData);
        return res.json({ message: 'Success (Memory)' });
      }

      await pool.query(
        'UPDATE it_device_credentials SET zone = ?, project_name = ?, device_sl_no = ?, username = ?, password = ? WHERE id = ?',
        [zone, projectName, deviceSlNo, username || '', password || '', id]
      );
      res.json({ message: 'Success' });
    } catch (error) {
      console.error('Error updating device credential:', error);
      res.status(500).json({ error: 'Failed to update device credential' });
    }
  });

  apiRouter.delete('/device-credentials/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        localData.deviceCredentials = (localData.deviceCredentials || []).filter((d: any) => String(d.id) !== String(id));
        saveLocalData(localData);
        return res.json({ message: 'Deleted (Memory)' });
      }
      await pool.query('DELETE FROM it_device_credentials WHERE id = ?', [id]);
      res.json({ message: 'Deleted' });
    } catch (error) {
      console.error('Error deleting device credential:', error);
      res.status(500).json({ error: 'Failed to delete device credential' });
    }
  });

  // CAMERA STATUS API
  apiRouter.get('/camera-status', async (req, res) => {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD).' });
    }
    try {
      if (useMemoryStore || !pool) {
        const rows = (localData.cameraStatus || []).filter((r: any) => r.date === date);
        return res.json(rows);
      }
      const [rows] = await pool.query(
        `SELECT id, DATE_FORMAT(status_date, '%Y-%m-%d') as date, project_name as projectName, zone,
                online_status as onlineStatus, issue_type as issueType, updated_by as updatedBy,
                updated_at as updatedAt
         FROM it_camera_status WHERE status_date = ? ORDER BY zone ASC, project_name ASC`,
        [date]
      );
      res.json(rows);
    } catch (error) {
      console.error('Error fetching camera status:', error);
      res.status(500).json({ error: 'Failed to fetch camera status' });
    }
  });

  apiRouter.post('/camera-status/bulk', async (req, res) => {
    const records = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    const invalidIndex = records.findIndex(
      (r: any) => !r.date || !r.projectName || !r.onlineStatus
    );
    if (invalidIndex !== -1) {
      return res.status(400).json({
        error: `Row ${invalidIndex + 1}: date, projectName and onlineStatus are required.`,
      });
    }

    if (useMemoryStore || !pool) {
      if (!localData.cameraStatus) localData.cameraStatus = [];
      for (const r of records) {
        const idx = localData.cameraStatus.findIndex(
          (c: any) => c.date === r.date && c.projectName === r.projectName
        );
        const entry = {
          id: idx > -1 ? localData.cameraStatus[idx].id : Date.now() + Math.random(),
          date: r.date,
          projectName: r.projectName,
          zone: r.zone || '',
          onlineStatus: r.onlineStatus,
          issueType: r.issueType || '',
          updatedBy: r.updatedBy || '',
          updatedAt: new Date(),
        };
        if (idx > -1) {
          localData.cameraStatus[idx] = entry;
        } else {
          localData.cameraStatus.push(entry);
        }
      }
      saveLocalData(localData);
      return res.json({ message: 'Success (Memory)', count: records.length });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const query = `
        INSERT INTO it_camera_status
        (status_date, project_name, zone, online_status, issue_type, updated_by)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          zone = VALUES(zone),
          online_status = VALUES(online_status),
          issue_type = VALUES(issue_type),
          updated_by = VALUES(updated_by)
      `;
      const values = records.map((r: any) => [
        r.date,
        r.projectName,
        r.zone || '',
        r.onlineStatus,
        r.issueType || '',
        r.updatedBy || '',
      ]);
      await connection.query(query, [values]);
      await connection.commit();
      res.json({ message: 'Success', count: values.length });

    } catch (error) {
      await connection.rollback();
      console.error('Error bulk saving camera status:', error);
      res.status(500).json({ error: 'Failed to save camera status to database' });
    } finally {
      connection.release();
    }
  });

  // REPORT NOTES API
  apiRouter.get('/report-notes', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.reportNotes || []);
      }
      const [rows] = await pool.query('SELECT note_text FROM report_notes ORDER BY display_order ASC');
      res.json((rows as any[]).map(r => r.note_text));
    } catch (error) {
      console.error('Error fetching report notes:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  });

  apiRouter.post('/report-notes', async (req, res) => {
    const { notes } = req.body;
    if (!Array.isArray(notes)) return res.status(400).json({ error: 'Invalid data format' });
    try {
      if (useMemoryStore || !pool) {
        localData.reportNotes = notes;
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM report_notes');
      if (notes.length > 0) {
        const values = notes.map((note, idx) => [note, idx]);
        await pool.query('INSERT INTO report_notes (note_text, display_order) VALUES ?', [values]);
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving report notes:', error);
      res.status(500).json({ error: 'Failed to save notes' });
    }
  });

  // --- ARCHIVE DATA TYPES API ---
  apiRouter.get('/archive-data-types', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.json([]);
      const [rows] = await pool.query('SELECT * FROM archive_data_types ORDER BY name ASC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching archive data types:', error);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  });

  apiRouter.post('/archive-data-types', async (req, res) => {
    const { name } = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      await pool.query('INSERT INTO archive_data_types (name) VALUES (?)', [name]);
      const [newRow]: any = await pool.query('SELECT * FROM archive_data_types WHERE name = ?', [name]);
      res.json(newRow[0]);
    } catch (error) {
      console.error('Error creating archive data type:', error);
      res.status(500).json({ error: 'Failed to create record' });
    }
  });

  apiRouter.put('/archive-data-types/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      await pool.query('UPDATE archive_data_types SET name = ? WHERE id = ?', [name, id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating archive data type:', error);
      res.status(500).json({ error: 'Failed to update record' });
    }
  });

  apiRouter.delete('/archive-data-types/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      await pool.query('DELETE FROM archive_data_types WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting archive data type:', error);
      res.status(500).json({ error: 'Failed to delete record' });
    }
  });

  // --- NOTIFICATION HELPERS ---
  // Create one or more notifications. recipientIds: array of recipient user IDs.
  const createNotifications = async (
    recipientIds: number[],
    type: string,
    title: string,
    message: string,
    sender: { id?: number | null; name: string },
    linkView: string | null = 'archiveDataVerification',
    linkState: Record<string, any> | null = null
  ) => {
    if (!pool || useMemoryStore) return;
    const uniqueIds = Array.from(new Set(recipientIds.filter(id => !!id)));
    if (uniqueIds.length === 0) return;
    try {
      const linkStateJson = linkState ? JSON.stringify(linkState) : null;
      const values = uniqueIds.map(uid => [
        uid,
        sender.id ?? null,
        sender.name,
        type,
        title,
        message,
        linkView ?? null,
        linkStateJson,
      ]);
      await pool.query(
        'INSERT INTO notifications (recipient_id, sender_id, sender_name, type, title, message, link_view, link_state) VALUES ?',
        [values]
      );
    } catch (error) {
      console.error('Error creating notifications:', error);
    }
  };

  // Get IDs of users who should be notified about Archive Data Verification activity:
  // admins, super_admins, and any user with archiveDataVerification.audit permission.
  const getArchiveAdminAndAuditUserIds = async (excludeName?: string): Promise<number[]> => {
    if (!pool || useMemoryStore) return [];
    try {
      const [rows]: any = await pool.query('SELECT id, name, role, permissions FROM users');
      const ids: number[] = [];
      for (const u of rows) {
        if (excludeName && u.name === excludeName) continue;
        if (u.role === 'admin' || u.role === 'super_admin') {
          ids.push(u.id);
          continue;
        }
        let perms = u.permissions;
        if (typeof perms === 'string') {
          try { perms = JSON.parse(perms); } catch { perms = null; }
        }
        if (perms?.archiveDataVerification?.audit) {
          ids.push(u.id);
        }
      }
      return ids;
    } catch (error) {
      console.error('Error fetching admin/audit users:', error);
      return [];
    }
  };

  // Get a user's ID by their display name.
  const getUserIdByName = async (name?: string | null): Promise<number | null> => {
    if (!pool || useMemoryStore || !name) return null;
    try {
      const [rows]: any = await pool.query('SELECT id FROM users WHERE name = ? LIMIT 1', [name]);
      return rows.length > 0 ? rows[0].id : null;
    } catch (error) {
      console.error('Error fetching user id by name:', error);
      return null;
    }
  };

  // --- ARCHIVE DATA VERIFICATION API ---
  apiRouter.get('/archive-data-verification', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.json([]);
      const [rows] = await pool.query('SELECT * FROM archive_data_verification ORDER BY id DESC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching archive data verification:', error);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  });

  apiRouter.post('/archive-data-verification', async (req, res) => {
    const { upload_date, upload_time, data_type, file_name, submitted_by, files_count, errors_count, remarks_on_errors, check_status, status } = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      const [result]: any = await pool.query(
        'INSERT INTO archive_data_verification (upload_date, upload_time, data_type, file_name, submitted_by, files_count, errors_count, remarks_on_errors, check_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [upload_date, upload_time, data_type, file_name, submitted_by, files_count || 0, errors_count || 0, remarks_on_errors, check_status || 'Pending', status || 'New Upload']
      );
      const [newRow]: any = await pool.query('SELECT * FROM archive_data_verification WHERE id = ?', [result.insertId]);
      res.json(newRow[0]);

      // Notify admins / audit-permission users about the new entry
      try {
        const recipients = await getArchiveAdminAndAuditUserIds(submitted_by);
        const senderId = await getUserIdByName(submitted_by);
        await createNotifications(
          recipients,
          'adv_new_entry',
          'New Archive Verification Entry',
          `${submitted_by || 'A user'} submitted a new entry: ${file_name || 'Untitled'}`,
          { id: senderId, name: submitted_by || 'System' },
          'archiveDataVerification',
          { checkStatus: 'Pending', recordId: result.insertId }
        );
      } catch (notifyErr) {
        console.error('Error sending new entry notifications:', notifyErr);
      }
    } catch (error) {
      console.error('Error creating archive data verification:', error);
      res.status(500).json({ error: 'Failed to create record' });
    }
  });

  apiRouter.put('/archive-data-verification/:id', async (req, res) => {
    const { id } = req.params;
    const { file_name, data_type, submitted_by, check_status, check_date, check_time, checked_by, files_count, errors_count, remarks_on_errors, user_remarks, status, upload_date, upload_time, actor_name } = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });

      // Get current state for history
      const [currentRows]: any = await pool.query('SELECT * FROM archive_data_verification WHERE id = ?', [id]);
      if (currentRows.length === 0) return res.status(404).json({ error: 'Record not found' });
      const current = currentRows[0];

      // Admin / Super Admin can edit every column (including file name, data type and entry owner)
      let actorIsAdmin = false;
      if (actor_name) {
        const [actorRows]: any = await pool.query('SELECT role FROM users WHERE name = ? LIMIT 1', [actor_name]);
        actorIsAdmin = actorRows.length > 0 && (actorRows[0].role === 'admin' || actorRows[0].role === 'super_admin');
      }
      const nextFileName = actorIsAdmin && file_name !== undefined ? file_name : current.file_name;
      const nextDataType = actorIsAdmin && data_type !== undefined ? data_type : current.data_type;
      const nextSubmittedBy = actorIsAdmin && submitted_by !== undefined ? submitted_by : current.submitted_by;

      await pool.query(
        'UPDATE archive_data_verification SET file_name = ?, data_type = ?, submitted_by = ?, check_status = ?, check_date = ?, check_time = ?, checked_by = ?, files_count = ?, errors_count = ?, remarks_on_errors = ?, user_remarks = ?, status = ?, upload_date = ?, upload_time = ? WHERE id = ?',
        [nextFileName, nextDataType, nextSubmittedBy, check_status, check_date, check_time, checked_by, files_count, errors_count, remarks_on_errors, user_remarks !== undefined ? user_remarks : current.user_remarks, status || current.status, upload_date || current.upload_date, upload_time || current.upload_time, id]
      );
      
      // History logic: status change হলে নতুন entry, একই status এ remarks বদলালে শেষ entry update
      const statusChanged = current.check_status !== check_status;
      const remarksChanged = current.remarks_on_errors !== remarks_on_errors || current.user_remarks !== user_remarks;

      if (statusChanged || remarksChanged) {
          const now = new Date();
          const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const localTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

          if (statusChanged) {
              // Status বদলেছে → নতুন history entry
              await pool.query(
                  'INSERT INTO archive_verification_history (record_id, changed_by, old_status, new_status, old_remarks, new_remarks, change_date, change_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                  [id, checked_by || 'System', current.check_status, check_status, current.remarks_on_errors || '', remarks_on_errors || '', localDate, localTime]
              );
          } else {
              // Status same, শুধু remarks বদলেছে → একই status এর শেষ history entry update
              const [lastRows]: any = await pool.query(
                  'SELECT * FROM archive_verification_history WHERE record_id = ? AND new_status = ? ORDER BY id DESC LIMIT 1',
                  [id, check_status]
              );
              if (lastRows.length > 0) {
                  // আগের entry আছে → update করো
                  await pool.query(
                      'UPDATE archive_verification_history SET new_remarks = ?, change_date = ?, change_time = ? WHERE id = ?',
                      [remarks_on_errors || '', localDate, localTime, lastRows[0].id]
                  );
              } else {
                  // এই status এর কোনো history নেই → নতুন entry
                  await pool.query(
                      'INSERT INTO archive_verification_history (record_id, changed_by, old_status, new_status, old_remarks, new_remarks, change_date, change_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                      [id, checked_by || 'System', current.check_status, check_status, current.remarks_on_errors || '', remarks_on_errors || '', localDate, localTime]
                  );
              }
          }
      }

      const [updatedRow]: any = await pool.query('SELECT * FROM archive_data_verification WHERE id = ?', [id]);
      res.json(updatedRow[0]);

      // --- Notifications for status transitions ---
      try {
        if (statusChanged) {
          const actor = actor_name || checked_by || 'System';
          const actorId = await getUserIdByName(actor);

          if (check_status === 'Returned' || check_status === 'On Hold' || check_status === 'Checked') {
            // Admin/auditor returned, put on hold, or completed → notify the file owner
            const ownerId = await getUserIdByName(current.submitted_by);
            if (ownerId) {
              const verb = check_status === 'Checked' ? 'completed' : (check_status === 'Returned' ? 'returned' : 'put on hold');
              await createNotifications(
                [ownerId],
                check_status === 'Checked' ? 'adv_completed' : 'adv_returned',
                check_status === 'Checked' ? 'Entry Completed' : 'Entry Returned',
                `${actor} ${verb} your entry: ${current.file_name || 'Untitled'}`,
                { id: actorId, name: actor },
                'archiveDataVerification',
                { checkStatus: check_status, recordId: Number(id) }
              );
            }
          } else if (check_status === 'Re-Audit') {
            // Owner fixed a Returned/On Hold entry → notify the previous auditor + all admins/audit users
            const recipientIds = new Set<number>();
            const auditorId = await getUserIdByName(checked_by);
            if (auditorId) recipientIds.add(auditorId);
            const adminAuditIds = await getArchiveAdminAndAuditUserIds(actor);
            adminAuditIds.forEach(uid => recipientIds.add(uid));

            await createNotifications(
              Array.from(recipientIds),
              'adv_re_audit',
              'Entry Resubmitted for Re-Audit',
              `${actor} resubmitted the entry for re-audit: ${current.file_name || 'Untitled'}`,
              { id: actorId, name: actor },
              'archiveDataVerification',
              { checkStatus: 'Re-Audit', recordId: Number(id) }
            );
          }
        }
      } catch (notifyErr) {
        console.error('Error sending update notifications:', notifyErr);
      }
    } catch (error) {
      console.error('Error updating archive data verification:', error);
      res.status(500).json({ error: 'Failed to update record' });
    }
  });

  apiRouter.get('/archive-data-verification/:id/history', async (req, res) => {
      const { id } = req.params;
      try {
          if (useMemoryStore || !pool) return res.json([]);
          const [rows] = await pool.query('SELECT * FROM archive_verification_history WHERE record_id = ? ORDER BY id DESC', [id]);
          res.json(rows);
      } catch (error) {
          console.error('Error fetching verification history:', error);
          res.status(500).json({ error: 'Failed to fetch history' });
      }
  });

  apiRouter.patch('/archive-data-verification/:id/transfer', async (req, res) => {
    const { id } = req.params;
    const {
      af_transfer_status,
      af_transferred_to,
      af_transferred_by,
      af_transfer_date,
      af_transfer_time,
      af_transfer_notes,
      af_transfer_department,
    } = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      const [rows]: any = await pool.query('SELECT * FROM archive_data_verification WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Record not found' });
      await pool.query(
        `UPDATE archive_data_verification
         SET af_transfer_status = ?, af_transferred_to = ?, af_transferred_by = ?,
             af_transfer_date = ?, af_transfer_time = ?, af_transfer_notes = ?, af_transfer_department = ?
         WHERE id = ?`,
        [
          af_transfer_status || 'Transferred',
          af_transferred_to || null,
          af_transferred_by || null,
          af_transfer_date || null,
          af_transfer_time || null,
          af_transfer_notes || null,
          af_transfer_department || null,
          id,
        ]
      );
      // Save transfer history entry
      await pool.query(
        `INSERT INTO archive_transfer_history (record_id, transferred_by, transferred_to, transfer_date, transfer_time, transfer_notes, transfer_department)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          af_transferred_by || null,
          af_transferred_to || null,
          af_transfer_date || null,
          af_transfer_time || null,
          af_transfer_notes || null,
          af_transfer_department || null,
        ]
      );
      const [updatedRow]: any = await pool.query('SELECT * FROM archive_data_verification WHERE id = ?', [id]);
      res.json(updatedRow[0]);
    } catch (error) {
      console.error('Error transferring archive record:', error);
      res.status(500).json({ error: 'Failed to transfer record' });
    }
  });

  apiRouter.get('/archive-data-verification/:id/transfer-history', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) return res.json([]);
      const [rows] = await pool.query(
        'SELECT * FROM archive_transfer_history WHERE record_id = ? ORDER BY id DESC',
        [id]
      );
      res.json(rows);
    } catch (error) {
      console.error('Error fetching transfer history:', error);
      res.status(500).json({ error: 'Failed to fetch transfer history' });
    }
  });

  apiRouter.delete('/archive-data-verification/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      await pool.query('DELETE FROM archive_data_verification WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting archive data verification:', error);
      res.status(500).json({ error: 'Failed to delete record' });
    }
  });

  // --- NOTIFICATION ANIMATIONS API ---
  // Scans the `src/` folder for Lottie JSON animations so new files dropped
  // there are picked up automatically, without any code changes.
  const NOTIFICATION_ANIMATIONS_DIR = path.join(process.cwd(), 'src');

  const humanizeAnimationLabel = (filename: string): string => {
    const base = filename.replace(/\.json$/i, '');
    return base
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // In-memory cache for the animation list, keyed by a signature of the
  // directory contents (filenames + mtimes). This avoids a readdir + stat
  // on every request while still picking up added/removed/modified files
  // automatically (no server restart needed).
  let animationListCache: { signature: string; data: any[] } | null = null;

  const getAnimationList = () => {
    if (!fs.existsSync(NOTIFICATION_ANIMATIONS_DIR)) return [];

    const files = fs
      .readdirSync(NOTIFICATION_ANIMATIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.json'));

    const signature = files
      .map((f) => {
        const stat = fs.statSync(path.join(NOTIFICATION_ANIMATIONS_DIR, f));
        return `${f}:${stat.mtimeMs}`;
      })
      .sort()
      .join('|');

    if (animationListCache && animationListCache.signature === signature) {
      return animationListCache.data;
    }

    const animations = files.map((filename) => ({
      key: filename.replace(/\.json$/i, ''),
      filename,
      label: humanizeAnimationLabel(filename),
    }));

    animationListCache = { signature, data: animations };
    return animations;
  };

  // In-memory cache for individual animation file contents, invalidated by
  // mtime so edited files are picked up without a restart.
  const animationFileCache = new Map<string, { mtimeMs: number; content: string }>();

  const getAnimationFileContent = (filePath: string): string | null => {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const cached = animationFileCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.content;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    animationFileCache.set(filePath, { mtimeMs: stat.mtimeMs, content });
    return content;
  };

  apiRouter.get('/notification-animations', (_req, res) => {
    try {
      const animations = getAnimationList();
      // Short cache so the admin picker stays responsive while still
      // periodically re-checking for newly added files.
      res.set('Cache-Control', 'public, max-age=60');
      res.json(animations);
    } catch (error) {
      console.error('Error listing notification animations:', error);
      res.status(500).json({ error: 'Failed to list animations' });
    }
  });

  apiRouter.get('/notification-animations/:filename', (req, res) => {
    try {
      const { filename } = req.params;
      // Prevent path traversal — only allow simple "name.json" filenames.
      if (!/^[\w-]+\.json$/i.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const filePath = path.join(NOTIFICATION_ANIMATIONS_DIR, filename);
      const content = getAnimationFileContent(filePath);
      if (content === null) {
        return res.status(404).json({ error: 'Animation not found' });
      }
      // Animation JSON files are static assets; allow longer caching.
      res.set('Cache-Control', 'public, max-age=3600');
      res.type('application/json').send(content);
    } catch (error) {
      console.error('Error serving notification animation:', error);
      res.status(500).json({ error: 'Failed to load animation' });
    }
  });

  // --- NOTIFICATIONS API ---

  // Admin-initiated custom notification to one or more users
  apiRouter.post('/notifications', async (req, res) => {
    const { recipientIds, title, message, senderId, senderName, linkView, linkState, type } = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
        return res.status(400).json({ error: 'recipientIds is required' });
      }
      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'title is required' });
      }
      await createNotifications(
        recipientIds.map((id: any) => Number(id)),
        type || 'admin_message',
        title,
        message || '',
        { id: senderId ?? null, name: senderName || 'Admin' },
        linkView || null,
        linkState || null
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error sending custom notification:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  apiRouter.get('/notifications', async (req, res) => {
    const { userId } = req.query;
    try {
      if (useMemoryStore || !pool) return res.json([]);
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      const [rows] = await pool.query(
        'SELECT * FROM notifications WHERE recipient_id = ? ORDER BY id DESC LIMIT 50',
        [userId]
      );
      res.json(rows);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  apiRouter.patch('/notifications/:id/read', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: 'Failed to update notification' });
    }
  });

  apiRouter.patch('/notifications/mark-all-read', async (req, res) => {
    const { userId } = req.body;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      await pool.query('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?', [userId]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({ error: 'Failed to update notifications' });
    }
  });

  apiRouter.delete('/notifications/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
      await pool.query('DELETE FROM notifications WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  });

  // Fixed Asset GP Verification APIs
  apiRouter.get('/fixed-asset-gp-verification', async (req, res) => {
      try {
          if (useMemoryStore || !pool) return res.json([]);
          const [rows] = await pool.query('SELECT * FROM fixed_asset_gp_verification ORDER BY id DESC');
          res.json(rows);
      } catch (error) {
          console.error('Error fetching fixed asset gp verification:', error);
          res.status(500).json({ error: 'Failed to fetch fixed asset gp verification' });
      }
  });

  apiRouter.post('/fixed-asset-gp-verification', async (req, res) => {
      const { gp_date, reference, updated_by, issues_count, remarks, checked_by, check_status, gp_details } = req.body;
      try {
          if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
          const gpDetailsJson = gp_details ? JSON.stringify(gp_details) : null;
          const [result]: any = await pool.query(
              'INSERT INTO fixed_asset_gp_verification (gp_date, reference, updated_by, issues_count, remarks, checked_by, check_status, gp_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [gp_date, reference, updated_by, issues_count, remarks, checked_by, check_status || 'Pending', gpDetailsJson]
          );
          const [newRow]: any = await pool.query('SELECT * FROM fixed_asset_gp_verification WHERE id = ?', [result.insertId]);
          res.status(201).json(newRow[0]);
      } catch (error) {
          console.error('Error creating fixed asset gp verification:', error);
          res.status(500).json({ error: 'Failed to create record' });
      }
  });

  apiRouter.put('/fixed-asset-gp-verification/:id', async (req, res) => {
      const { id } = req.params;
      const { gp_date, reference, updated_by, issues_count, remarks, checked_by, check_status, gp_details } = req.body;
      try {
          if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
          const gpDetailsJson = gp_details ? JSON.stringify(gp_details) : null;
          await pool.query(
              'UPDATE fixed_asset_gp_verification SET gp_date = ?, reference = ?, updated_by = ?, issues_count = ?, remarks = ?, checked_by = ?, check_status = ?, gp_details = ? WHERE id = ?',
              [gp_date, reference, updated_by, issues_count, remarks, checked_by, check_status || 'Pending', gpDetailsJson, id]
          );
          const [updatedRow]: any = await pool.query('SELECT * FROM fixed_asset_gp_verification WHERE id = ?', [id]);
          res.json(updatedRow[0]);
      } catch (error) {
          console.error('Error updating fixed asset gp verification:', error);
          res.status(500).json({ error: 'Failed to update record' });
      }
  });

  apiRouter.delete('/fixed-asset-gp-verification/:id', async (req, res) => {
      const { id } = req.params;
      try {
          if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
          await pool.query('DELETE FROM fixed_asset_gp_verification WHERE id = ?', [id]);
          res.json({ success: true });
      } catch (error) {
          console.error('Error deleting fixed asset gp verification:', error);
          res.status(500).json({ error: 'Failed to delete record' });
      }
  });

  // CCTV Footage Check Reports APIs
  apiRouter.get('/cctv-footage-reports', async (req, res) => {
      try {
          if (useMemoryStore || !pool) return res.json([]);
          const [rows] = await pool.query('SELECT * FROM cctv_footage_check_reports ORDER BY id DESC');
          res.json(rows);
      } catch (error) {
          console.error('Error fetching cctv footage reports:', error);
          res.status(500).json({ error: 'Failed to fetch cctv footage reports' });
      }
  });

  apiRouter.post('/cctv-footage-reports', async (req, res) => {
      try {
          if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory' });
          const { requisition_date, requested_by, designation, department, checking_code, checking_date, project_name, from_time, to_time, checking_purpose, report_link, camera_check_comments, checked_by } = req.body;
          
          const [result]: any = await pool.query(
              'INSERT INTO cctv_footage_check_reports (requisition_date, requested_by, designation, department, checking_code, checking_date, project_name, from_time, to_time, checking_purpose, report_link, camera_check_comments, checked_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [requisition_date, requested_by, designation, department, checking_code, checking_date, project_name, from_time, to_time, checking_purpose, report_link, camera_check_comments, checked_by]
          );

          const [newRow]: any = await pool.query('SELECT * FROM cctv_footage_check_reports WHERE id = ?', [result.insertId]);
          res.json(newRow[0]);
      } catch (error) {
          console.error('Error adding cctv footage report:', error);
          res.status(500).json({ error: 'Failed to add record' });
      }
  });

  apiRouter.put('/cctv-footage-reports/:id', async (req, res) => {
      try {
          const { id } = req.params;
          if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory' });
          const { requisition_date, requested_by, designation, department, checking_code, checking_date, project_name, from_time, to_time, checking_purpose, report_link, camera_check_comments, checked_by } = req.body;
          
          await pool.query(
              'UPDATE cctv_footage_check_reports SET requisition_date=?, requested_by=?, designation=?, department=?, checking_code=?, checking_date=?, project_name=?, from_time=?, to_time=?, checking_purpose=?, report_link=?, camera_check_comments=?, checked_by=? WHERE id=?',
              [requisition_date, requested_by, designation, department, checking_code, checking_date, project_name, from_time, to_time, checking_purpose, report_link, camera_check_comments, checked_by, id]
          );

          const [updatedRow]: any = await pool.query('SELECT * FROM cctv_footage_check_reports WHERE id = ?', [id]);
          res.json(updatedRow[0]);
      } catch (error) {
          console.error('Error updating cctv footage report:', error);
          res.status(500).json({ error: 'Failed to update record' });
      }
  });

  apiRouter.delete('/cctv-footage-reports/:id', async (req, res) => {
      const { id } = req.params;
      try {
          if (useMemoryStore || !pool) return res.status(501).json({ error: 'Not implemented in memory store' });
          await pool.query('DELETE FROM cctv_footage_check_reports WHERE id = ?', [id]);
          res.json({ success: true });
      } catch (error) {
          console.error('Error deleting cctv footage report:', error);
          res.status(500).json({ error: 'Failed to delete record' });
      }
  });

  // EMAIL SENDING API
  apiRouter.post('/send-report-email', async (req, res) => {
    const { to, cc, bcc, subject, body, signatureText, attachmentName, attachmentBase64, attachments, htmlPreview } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Recipient and subject are required' });
    }

    // Check for required environment variables
    const requiredEnv = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
    const missing = requiredEnv.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      return res.status(400).json({ 
        error: 'Email service not configured', 
        details: `Missing environment variables: ${missing.join(', ')}`,
        hint: 'Local users: Please add these variables to your .env file. Cloud users: Configure them in the Settings menu.'
      });
    }

    try {
      const smtpConfig: any = {
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '465'),
        secure: process.env.EMAIL_PORT === '465' || process.env.EMAIL_PORT === 'SSL', 
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      };

      const transporter = nodemailer.createTransport(smtpConfig);

      // Parse signature text for specific styling if provided
      let personalSignatureHtml = '';
      if (signatureText) {
        const lines = signatureText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const withRegards = lines[0] || 'With Regards,';
        const name = lines[1] || '';
        const designation = lines[2] || '';
        const contact = lines[3] || '';

        personalSignatureHtml = `
          <div style="margin-top: 30px; margin-bottom: 40px;">
            <p style="margin: 0; font-style: italic; color: #64748b; font-size: 14px;">${withRegards}</p>
            ${name ? `<p style="margin: 8px 0 0; color: #0f172a; font-size: 16px; font-weight: 800; font-family: 'Segoe UI Bold', Tahoma, Geneva, Verdana, sans-serif;">${name}</p>` : ''}
            ${designation ? `<p style="margin: 2px 0 0; color: #64748b; font-size: 13px;">${designation}</p>` : ''}
            ${contact ? `<p style="margin: 2px 0 0; color: #64748b; font-size: 13px;">${contact.replace(/(\+?\d[\d\s-]{7,})/g, '<span style="color: #ea580c; font-weight: 700;">$1</span>')}</p>` : ''}
          </div>
        `;
      }

      // Function to make URLs clickable and styled in HTML
      const formatBodyWithLinks = (text: string) => {
        if (!text) return '';
        // Regex to find URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, (url) => {
          return `<a href="${url}" style="color: #2563eb; font-size: 18px; font-weight: 800; text-decoration: underline; word-break: break-all; display: inline-block; margin: 10px 0; padding: 10px 15px; border: 2px solid #dbeafe; background-color: #eff6ff; border-radius: 8px;">${url}</a>`;
        });
      };

      const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; line-height: 1.6; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #ffffff; padding: 30px 40px; text-align: left; border-bottom: 1px solid #f1f5f9;">
          <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
            <tr>
              <td style="width: 100px; vertical-align: middle; padding-right: 25px; border-right: 2px solid #ea580c;">
                 <img src="https://www.credencehousingltd.com/admin/settings_images/flogo-1692106120.svg" alt="Credence Logo" width="90" style="display: block; outline: none; border: none;">
              </td>
              <td style="padding-left: 25px; vertical-align: middle;">
                <div style="color: #0f172a; font-weight: 900; font-size: 19px; text-transform: uppercase; letter-spacing: 0.5px; font-family: 'Segoe UI Bold', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.2;">CREDENCE HOUSING LIMITED</div>
                <div style="color: #64748b; font-size: 11px; margin-top: 3px; font-weight: 500;">House-15, Road-13/A, Dhanmondi, Dhaka-1209, Bangladesh</div>
                <div style="margin-top: 10px;">
                  <span style="display: inline-block; background-color: #fff7ed; color: #ea580c; font-weight: 900; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; padding: 4px 12px; border: 1px solid #ffedd5; border-radius: 4px;">(Surveillance Report)</span>
                </div>
              </td>
            </tr>
          </table>
        </div>
        
        <div style="padding: 40px 40px 30px;">
          <div style="color: #475569; font-size: 15px; white-space: pre-wrap;">${formatBodyWithLinks(body)}</div>

          ${personalSignatureHtml}

          <div style="margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 30px;">
            <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
              <tr>
                <td style="width: 110px; vertical-align: middle; padding-right: 20px;">
                  <img src="https://www.credencehousingltd.com/admin/settings_images/flogo-1692106120.svg" alt="Credence" width="100" style="display: block;">
                </td>
                <td style="border-left: 1px solid #e2e8f0; padding-left: 25px; vertical-align: middle;">
                  <div style="color: #0f172a; font-weight: 800; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-family: 'Segoe UI Bold', Tahoma, Geneva, Verdana, sans-serif;">CREDENCE HOUSING LIMITED</div>
                  <div style="font-size: 11px; color: #64748b; line-height: 1.5; margin-bottom: 10px;">
                    Telephone: +880241021375, +880241021378 | Hotline: 16769<br>
                    Corporate Address: House-15, Road-13/A, Dhanmondi, Dhaka-1209, Bangladesh
                  </div>
                  <div style="margin-top: 8px;">
                    <a href="https://www.credencehousingltd.com/" style="color: #ea580c; font-size: 11px; font-weight: 800; text-decoration: none; margin-right: 15px; text-transform: uppercase;">WEBSITE</a>
                    <a href="https://www.facebook.com/credencehousingltd" style="color: #ea580c; font-size: 11px; font-weight: 800; text-decoration: none; margin-right: 15px; text-transform: uppercase;">FACEBOOK</a>
                    <a href="https://www.linkedin.com/company/credencehousinglimited/" style="color: #ea580c; font-size: 11px; font-weight: 800; text-decoration: none; text-transform: uppercase;">LINKEDIN</a>
                  </div>
                </td>
              </tr>
            </table>
          </div>
        </div>
        
        <div style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="margin: 0; color: #94a3b8; font-size: 12px; font-weight: 500;">&copy; ${new Date().getFullYear()} Credence Housing Limited. All rights reserved.</p>
          <p style="margin: 6px 0 0; color: #cbd5e1; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">CONFIDENTIAL DOCUMENT - INTERNAL USE ONLY</p>
        </div>
      </div>
      `;

      const mailOptions: any = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        cc,
        bcc,
        subject,
        text: body,
        html: emailHtml
      };

      // Build the attachments list. Supports both the legacy single-file
      // fields (attachmentName/attachmentBase64) and a new multi-file
      // 'attachments' array of { filename, content } used by the custom
      // email compose popup.
      const mailAttachments: { filename: string; content: string; encoding: string }[] = [];

      if (attachmentName && attachmentBase64) {
        mailAttachments.push({
          filename: attachmentName,
          content: attachmentBase64,
          encoding: 'base64',
        });
      }

      if (Array.isArray(attachments)) {
        for (const att of attachments) {
          if (att && att.filename && att.content) {
            mailAttachments.push({
              filename: att.filename,
              content: att.content,
              encoding: 'base64',
            });
          }
        }
      }

      if (mailAttachments.length > 0) {
        mailOptions.attachments = mailAttachments;
      }

      const info = await transporter.sendMail(mailOptions);
      
      // Log to database
      if (pool) {
        const logAttachmentName = mailAttachments.length > 0
          ? mailAttachments.map(a => a.filename).join(', ')
          : (attachmentName || 'N/A');
        const reportType = mailAttachments.length > 0 ? mailAttachments[0].filename.split('_')[0] : 'Unknown';
        const reportMonth = mailAttachments.length > 0 ? (mailAttachments[0].filename.split('_')[1]?.replace('.pdf', '') || 'N/A') : 'N/A';
        
        await pool.query(
          'INSERT INTO sent_reports (sender_email, recipient_email, subject, report_type, report_month, attachment_name, message_body) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [process.env.EMAIL_USER, to, subject, reportType, reportMonth, logAttachmentName, body]
        );
      }

      res.json({ success: true, message: 'Email sent successfully', messageId: info.messageId });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ 
        error: 'Failed to send email', 
        details: (error as Error).message,
        hint: 'Please ensure EMAIL_* variables are configured in the environment.'
      });
    }
  });

  apiRouter.post('/send-email', async (req, res) => {
    const { to, cc, bcc, subject, body, dbBody, attachments } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Recipient and subject are required' });
    }

    // Check for required environment variables
    const requiredEnv = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
    const missing = requiredEnv.filter(key => !process.env[key]);

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Email service not configured',
        details: `Missing environment variables: ${missing.join(', ')}`,
        hint: 'Local users: Please add these variables to your .env file. Cloud users: Configure them in the Settings menu.'
      });
    }

    try {
      const smtpConfig: any = {
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '465'),
        secure: process.env.EMAIL_PORT === '465' || process.env.EMAIL_PORT === 'SSL',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      };

      const transporter = nodemailer.createTransport(smtpConfig);

      // Note: unlike Report Mailer, the body sent here (from CasualPreview)
      // already contains its own "With Regards..." signature block and its
      // own Credence footer branding baked into the generated report HTML —
      // so we deliberately do NOT add another signature/footer here, to
      // avoid showing it twice. We only wrap it with the same outer
      // header banner + bottom copyright bar Report Mailer uses.

      // body arrives already fully-formed HTML (message + report table, incl.
      // its own header (logo/company name/badge) and its own signature/footer,
      // unlike Report Mailer's plain-text body — so it's inserted as-is (no
      // pre-wrap / link-styling pass, no extra header/signature/footer
      // injected) to avoid showing any of those twice. We only add a light
      // outer wrapper and a bottom copyright bar.
      const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; line-height: 1.6; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
        <div style="padding: 30px 40px 20px;">
          <div style="color: #475569; font-size: 15px;">${body || ''}</div>
        </div>

        <div style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="margin: 0; color: #94a3b8; font-size: 12px; font-weight: 500;">&copy; ${new Date().getFullYear()} Credence Housing Limited. All rights reserved.</p>
          <p style="margin: 6px 0 0; color: #cbd5e1; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">CONFIDENTIAL DOCUMENT - INTERNAL USE ONLY</p>
        </div>
      </div>
      `;

      const mailOptions: any = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        cc,
        bcc,
        subject,
        html: emailHtml,
      };

      // Inline (cid) + regular attachments, as sent by the client. Items with
      // a `cid` are referenced from within the HTML body (e.g. <img src="cid:...">)
      // so they're marked inline rather than shown as separate downloadable files.
      if (Array.isArray(attachments)) {
        mailOptions.attachments = attachments
          .filter((att: any) => att && att.content)
          .map((att: any, i: number) => ({
            filename: att.filename || `attachment-${i + 1}`,
            content: att.content,
            encoding: att.encoding || 'base64',
            cid: att.cid || undefined,
            contentDisposition: att.cid ? 'inline' : 'attachment',
          }));
      }

      const info = await transporter.sendMail(mailOptions);

      // Log to the same sent-reports history Report Mailer uses
      if (pool) {
        const now = new Date();
        const reportMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await pool.query(
          'INSERT INTO sent_reports (sender_email, recipient_email, subject, report_type, report_month, attachment_name, message_body) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [process.env.EMAIL_USER, to, subject, 'Casual Activity Report', reportMonth, 'N/A', dbBody || body || '']
        );
      }

      res.json({ success: true, message: 'Email sent successfully', messageId: info.messageId });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({
        error: 'Failed to send email',
        details: (error as Error).message,
        hint: 'Please ensure EMAIL_* variables are configured in the environment.'
      });
    }
  });

  apiRouter.get('/sent-reports', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json([]); 
      }
      const [rows] = await pool.query('SELECT * FROM sent_reports ORDER BY sent_at DESC LIMIT 50');
      res.json(rows);
    } catch (err: any) {
      console.error('Error fetching sent reports:', err);
      res.status(500).json({ error: 'Failed to fetch sent reports history' });
    }
  });

  // --- DAILY TASKS API ---
  apiRouter.get('/daily-tasks', async (req, res) => {
    const { user_id, role } = req.query as any;
    try {
      if (useMemoryStore || !pool) {
        const tasks = (localData as any).dailyTasks || [];
        if (role === 'super_admin' || role === 'admin') return res.json(tasks);
        return res.json(tasks.filter((t: any) => t.created_by_id == user_id || t.assigned_to_id == user_id));
      }
      let sql = 'SELECT * FROM daily_tasks';
      const params: any[] = [];
      if (role !== 'super_admin' && role !== 'admin') {
        sql += ' WHERE created_by_id = ? OR assigned_to_id = ?';
        params.push(user_id, user_id);
      }
      sql += ' ORDER BY created_at DESC';
      const [rows] = await pool.query(sql, params);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching daily tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  apiRouter.post('/daily-tasks', async (req, res) => {
    const { title, description, priority, status, category, due_date, reminder_at, assigned_to_id, assigned_to_name, created_by_id, created_by_name } = req.body;
    if (!title || !created_by_id) return res.status(400).json({ error: 'title and created_by_id required' });
    try {
      if (useMemoryStore || !pool) {
        if (!(localData as any).dailyTasks) (localData as any).dailyTasks = [];
        const newTask = { id: Date.now(), title, description, priority: priority || 'Medium', status: status || 'Pending', category, due_date, reminder_at, assigned_to_id, assigned_to_name, created_by_id, created_by_name, created_at: new Date().toISOString() };
        (localData as any).dailyTasks.push(newTask);
        saveLocalData(localData);
        return res.json(newTask);
      }
      const [result]: any = await pool.query(
        'INSERT INTO daily_tasks (title, description, priority, status, category, due_date, reminder_at, assigned_to_id, assigned_to_name, created_by_id, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [title, description || null, priority || 'Medium', status || 'Pending', category || null, due_date || null, reminder_at || null, assigned_to_id || null, assigned_to_name || null, created_by_id, created_by_name]
      );
      res.json({ id: result.insertId, title, description, priority: priority || 'Medium', status: status || 'Pending', category, due_date, reminder_at, assigned_to_id, assigned_to_name, created_by_id, created_by_name });
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  apiRouter.put('/daily-tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description, priority, status, category, due_date, reminder_at, assigned_to_id, assigned_to_name } = req.body;
    try {
      if (useMemoryStore || !pool) {
        (localData as any).dailyTasks = ((localData as any).dailyTasks || []).map((t: any) =>
          t.id == id ? { ...t, title, description, priority, status, category, due_date, reminder_at, assigned_to_id, assigned_to_name } : t
        );
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query(
        'UPDATE daily_tasks SET title=?, description=?, priority=?, status=?, category=?, due_date=?, reminder_at=?, assigned_to_id=?, assigned_to_name=? WHERE id=?',
        [title, description || null, priority, status, category || null, due_date || null, reminder_at || null, assigned_to_id || null, assigned_to_name || null, id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  apiRouter.delete('/daily-tasks/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        (localData as any).dailyTasks = ((localData as any).dailyTasks || []).filter((t: any) => t.id != id);
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM daily_tasks WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  // --- RUBBISH VERIFICATION API ---
  apiRouter.get('/rubbish-verification', async (req, res) => {
    try {
      if (useMemoryStore || !pool) return res.json(localData.rubbishVerification || []);
      const [rows] = await pool.query('SELECT * FROM rubbish_verification ORDER BY id DESC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching rubbish verification:', error);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  });

  apiRouter.post('/rubbish-verification', async (req, res) => {
    const { project_name, officers, designation, bill_no, bill, gp_no, truck_no, date, in_time, out_time, status, sg_presence, remarks, checked_by, check_date } = req.body;
    try {
      if (useMemoryStore || !pool) {
        const newRecord = { id: Date.now(), project_name, officers, designation, bill_no, bill, gp_no, truck_no, date, in_time, out_time, status, sg_presence, remarks, checked_by, check_date, created_at: new Date() };
        if (!localData.rubbishVerification) localData.rubbishVerification = [];
        localData.rubbishVerification.push(newRecord);
        saveLocalData(localData);
        return res.json(newRecord);
      }
      const [result]: any = await pool.query(
        'INSERT INTO rubbish_verification (project_name, officers, designation, bill_no, bill, gp_no, truck_no, date, in_time, out_time, status, sg_presence, remarks, checked_by, check_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [project_name, officers, designation, bill_no, bill, gp_no, truck_no, date, in_time, out_time, status, sg_presence, remarks, checked_by, check_date]
      );
      const [newRow]: any = await pool.query('SELECT * FROM rubbish_verification WHERE id = ?', [result.insertId]);
      res.json(newRow[0]);
    } catch (error) {
      console.error('Error creating rubbish verification:', error);
      res.status(500).json({ error: 'Failed to create record' });
    }
  });

  apiRouter.put('/rubbish-verification/:id', async (req, res) => {
    const { id } = req.params;
    const { project_name, officers, designation, bill_no, bill, gp_no, truck_no, date, in_time, out_time, status, sg_presence, remarks, checked_by, check_date } = req.body;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.rubbishVerification) localData.rubbishVerification = [];
        const index = localData.rubbishVerification.findIndex((r: any) => r.id == id);
        if (index !== -1) {
          localData.rubbishVerification[index] = { ...localData.rubbishVerification[index], project_name, officers, designation, bill_no, bill, gp_no, truck_no, date, in_time, out_time, status, sg_presence, remarks, checked_by, check_date, updated_at: new Date() };
          saveLocalData(localData);
          return res.json(localData.rubbishVerification[index]);
        }
        return res.status(404).json({ error: 'Record not found' });
      }
      await pool.query(
        'UPDATE rubbish_verification SET project_name = ?, officers = ?, designation = ?, bill_no = ?, bill = ?, gp_no = ?, truck_no = ?, date = ?, in_time = ?, out_time = ?, status = ?, sg_presence = ?, remarks = ?, checked_by = ?, check_date = ? WHERE id = ?',
        [project_name, officers, designation, bill_no, bill, gp_no, truck_no, date, in_time, out_time, status, sg_presence, remarks, checked_by, check_date, id]
      );
      const [updatedRow]: any = await pool.query('SELECT * FROM rubbish_verification WHERE id = ?', [id]);
      res.json(updatedRow[0]);
    } catch (error) {
      console.error('Error updating rubbish verification:', error);
      res.status(500).json({ error: 'Failed to update record' });
    }
  });

  apiRouter.delete('/rubbish-verification/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.rubbishVerification) localData.rubbishVerification = [];
        localData.rubbishVerification = localData.rubbishVerification.filter((r: any) => r.id != id);
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM rubbish_verification WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting rubbish verification:', error);
      res.status(500).json({ error: 'Failed' });
    }
  });


  // ── Helpers ───────────────────────────────────────────────────────────────
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };

  // ── Remarks CRUD ──────────────────────────────────────────────────────────

  apiRouter.get('/remarks', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        if (!localData.remarks) localData.remarks = [];
        return res.json(localData.remarks);
      }
      const [rows] = await pool.query('SELECT * FROM remarks ORDER BY created_at DESC');
      res.json(rows);
    } catch (error) {
      console.error('Error fetching remarks:', error);
      res.status(500).json({ error: 'Failed to fetch remarks' });
    }
  });

  apiRouter.post('/remarks', async (req, res) => {
    const { text_en, text_bn, type } = req.body;
    if (!text_en) return res.status(400).json({ error: 'text_en is required' });
    const id = generateUUID();
    try {
      if (useMemoryStore || !pool) {
        if (!localData.remarks) localData.remarks = [];
        const newRemark = { id, text_en, text_bn: text_bn || '', type: type || 'neutral', created_at: new Date().toISOString() };
        localData.remarks.push(newRemark);
        saveLocalData(localData);
        return res.json(newRemark);
      }
      await pool.query('INSERT INTO remarks (id, text_en, text_bn, type) VALUES (?, ?, ?, ?)', [id, text_en, text_bn || '', type || 'neutral']);
      res.json({ id, text_en, text_bn: text_bn || '', type: type || 'neutral' });
    } catch (error) {
      console.error('Error adding remark:', error);
      res.status(500).json({ error: 'Failed to add remark' });
    }
  });

  apiRouter.put('/remarks/:id', async (req, res) => {
    const { id } = req.params;
    const { text_en, text_bn, type } = req.body;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.remarks) localData.remarks = [];
        localData.remarks = localData.remarks.map((r: any) => r.id === id ? { ...r, text_en, text_bn, type } : r);
        saveLocalData(localData);
        return res.json({ id, text_en, text_bn, type });
      }
      await pool.query('UPDATE remarks SET text_en = ?, text_bn = ?, type = ? WHERE id = ?', [text_en, text_bn || '', type || 'neutral', id]);
      res.json({ id, text_en, text_bn, type });
    } catch (error) {
      console.error('Error updating remark:', error);
      res.status(500).json({ error: 'Failed to update remark' });
    }
  });

  apiRouter.delete('/remarks/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.remarks) localData.remarks = [];
        localData.remarks = localData.remarks.filter((r: any) => r.id !== id);
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM remarks WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting remark:', error);
      res.status(500).json({ error: 'Failed to delete remark' });
    }
  });

  apiRouter.post('/remarks/bulk', async (req, res) => {
    const items: any[] = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Empty array' });
    try {
      if (useMemoryStore || !pool) {
        if (!localData.remarks) localData.remarks = [];
        const newItems = items.map(r => ({ id: generateUUID(), text_en: r.text_en, text_bn: r.text_bn || '', type: r.type || 'neutral', created_at: new Date().toISOString() }));
        localData.remarks = [...localData.remarks, ...newItems];
        saveLocalData(localData);
        return res.json({ inserted: newItems.length });
      }
      const values = items.map(r => [generateUUID(), r.text_en, r.text_bn || '', r.type || 'neutral']);
      await pool.query('INSERT INTO remarks (id, text_en, text_bn, type) VALUES ?', [values]);
      res.json({ inserted: items.length });
    } catch (error) {
      console.error('Error bulk inserting remarks:', error);
      res.status(500).json({ error: 'Failed to import remarks' });
    }
  });

  // ── Activity Entries CRUD ─────────────────────────────────────────────────

  apiRouter.get('/activity_entries', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        if (!localData.activityEntries) localData.activityEntries = [];
        return res.json(localData.activityEntries);
      }
      const [rows] = await pool.query('SELECT * FROM activity_entries WHERE is_deleted = 0 ORDER BY date DESC, time DESC');
      const parsed = (rows as any[]).map(r => ({
        ...r,
        employeeIds: typeof r.employeeIds === 'string' ? JSON.parse(r.employeeIds) : r.employeeIds,
        screenshots: typeof r.screenshots === 'string' ? JSON.parse(r.screenshots) : r.screenshots,
      }));
      res.json(parsed);
    } catch (error) {
      console.error('Error fetching activity entries:', error);
      res.status(500).json({ error: 'Failed to fetch entries' });
    }
  });

  apiRouter.post('/activity_entries', async (req, res) => {
    const entry = req.body;
    const id = entry.id ? String(entry.id) : generateUUID();
    try {
      if (useMemoryStore || !pool) {
        if (!localData.activityEntries) localData.activityEntries = [];
        const existing = localData.activityEntries.findIndex((e: any) => String(e.id) === id);
        if (existing >= 0) {
          localData.activityEntries[existing] = { ...entry, id };
        } else {
          localData.activityEntries.push({ ...entry, id });
        }
        saveLocalData(localData);
        return res.json({ ...entry, id });
      }
      const empIds = JSON.stringify(entry.employeeIds || []);
      const shots = JSON.stringify(entry.screenshots || []);
      await pool.query(
        `INSERT INTO activity_entries (id, date, time, remarks, employeeIds, screenshots, user_id, is_deleted, deleted_at, deleted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE date=VALUES(date), time=VALUES(time), employeeIds=VALUES(employeeIds),
         remarks=VALUES(remarks), screenshots=VALUES(screenshots), is_deleted=VALUES(is_deleted),
         user_id=VALUES(user_id)`,
        [id, entry.date?.split('T')[0], entry.time || null, entry.remarks || null, empIds, shots, entry.user_id || null, entry.is_deleted ? 1 : 0, entry.deleted_at || null, entry.deleted_by || null]
      );
      res.json({ ...entry, id });
    } catch (error) {
      console.error('Error saving activity entry:', error);
      res.status(500).json({ error: 'Failed to save entry' });
    }
  });

  apiRouter.post('/activity_entries/bulk', async (req, res) => {
    const entries: any[] = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'Expected array' });
    try {
      if (useMemoryStore || !pool) {
        if (!localData.activityEntries) localData.activityEntries = [];
        entries.forEach(entry => {
          const idx = localData.activityEntries.findIndex((e: any) => String(e.id) === String(entry.id));
          if (idx >= 0) { localData.activityEntries[idx] = entry; } else { localData.activityEntries.push(entry); }
        });
        saveLocalData(localData);
        return res.json({ synced: entries.length });
      }
      for (const entry of entries) {
        const id = String(entry.id);
        const empIds = JSON.stringify(entry.employeeIds || []);
        const shots = JSON.stringify(entry.screenshots || []);
        await pool.query(
          `INSERT INTO activity_entries (id, date, time, remarks, employeeIds, screenshots, user_id, is_deleted, deleted_at, deleted_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE date=VALUES(date), time=VALUES(time), employeeIds=VALUES(employeeIds),
           remarks=VALUES(remarks), screenshots=VALUES(screenshots), is_deleted=VALUES(is_deleted),
           user_id=VALUES(user_id)`,
          [id, entry.date?.split('T')[0], entry.time || null, entry.remarks || null, empIds, shots, entry.user_id || null, entry.is_deleted ? 1 : 0, entry.deleted_at || null, entry.deleted_by || null]
        );
      }
      res.json({ synced: entries.length });
    } catch (error) {
      console.error('Error bulk syncing entries:', error);
      res.status(500).json({ error: 'Failed to sync entries' });
    }
  });

  // Soft delete (move to recycle bin) — must be registered BEFORE /:id routes
  apiRouter.patch('/activity_entries/:id/soft-delete', async (req, res) => {
    const { id } = req.params;
    const { deleted_by } = req.body || {};
    try {
      if (useMemoryStore || !pool) {
        if (!localData.activityEntries) localData.activityEntries = [];
        localData.activityEntries = localData.activityEntries.map((e: any) =>
          String(e.id) === id ? { ...e, is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: deleted_by || null } : e
        );
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query(
        'UPDATE activity_entries SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id = ?',
        [deleted_by || null, id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error soft-deleting activity entry:', error);
      res.status(500).json({ error: 'Failed to delete entry' });
    }
  });

  // Restore from recycle bin
  apiRouter.patch('/activity_entries/:id/restore', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.activityEntries) localData.activityEntries = [];
        localData.activityEntries = localData.activityEntries.map((e: any) =>
          String(e.id) === id ? { ...e, is_deleted: false, deleted_at: null } : e
        );
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query(
        'UPDATE activity_entries SET is_deleted = 0, deleted_at = NULL WHERE id = ?',
        [id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error restoring activity entry:', error);
      res.status(500).json({ error: 'Failed to restore entry' });
    }
  });

  // Get deleted entries (recycle bin)
  apiRouter.get('/activity_entries/deleted', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        if (!localData.activityEntries) localData.activityEntries = [];
        const deleted = localData.activityEntries.filter((e: any) => e.is_deleted);
        return res.json(deleted);
      }
      const [rows] = await pool.query(
        'SELECT * FROM activity_entries WHERE is_deleted = 1 ORDER BY deleted_at DESC, date DESC'
      );
      const parsed = (rows as any[]).map(r => ({
        ...r,
        employeeIds: typeof r.employeeIds === 'string' ? JSON.parse(r.employeeIds) : r.employeeIds,
        screenshots: typeof r.screenshots === 'string' ? JSON.parse(r.screenshots) : r.screenshots,
      }));
      res.json(parsed);
    } catch (error) {
      console.error('Error fetching deleted entries:', error);
      res.status(500).json({ error: 'Failed to fetch deleted entries' });
    }
  });

  // Permanent delete
  apiRouter.delete('/activity_entries/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.activityEntries) localData.activityEntries = [];
        localData.activityEntries = localData.activityEntries.filter((e: any) => String(e.id) !== id);
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM activity_entries WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error permanently deleting activity entry:', error);
      res.status(500).json({ error: 'Failed to delete entry' });
    }
  });

  // ── Activity Comments ─────────────────────────────────────────────────────

  apiRouter.get('/activity_comments', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json(localData.activityComments || []);
      }
      const [rows] = await pool.query('SELECT * FROM activity_comments ORDER BY created_at DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  });

  apiRouter.post('/activity_comments', async (req, res) => {
    const { activity_id, user_id, comment } = req.body;
    if (!activity_id || !comment) return res.status(400).json({ error: 'activity_id and comment required' });
    try {
      if (useMemoryStore || !pool) {
        if (!localData.activityComments) localData.activityComments = [];
        const newComment = { id: Date.now(), activity_id, user_id, comment, created_at: new Date().toISOString() };
        localData.activityComments.push(newComment);
        saveLocalData(localData);
        return res.json(newComment);
      }
      const [result] = await pool.query(
        'INSERT INTO activity_comments (activity_id, user_id, comment) VALUES (?, ?, ?)',
        [activity_id, user_id || null, comment]
      );
      res.json({ id: (result as any).insertId, activity_id, user_id, comment });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add comment' });
    }
  });


  // ── Media / Casual Images ──────────────────────────────────────────────────
  // Images stored as files under uploads/casual_images/ for easy server transfer

  const CASUAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'casual_images');
  if (!fs.existsSync(CASUAL_UPLOAD_DIR)) {
    fs.mkdirSync(CASUAL_UPLOAD_DIR, { recursive: true });
  }
  app.use('/uploads/casual_images', express.static(CASUAL_UPLOAD_DIR));

  const getCasualImagePath = (key: string): string | null => {
    const exts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    for (const ext of exts) {
      const fp = path.join(CASUAL_UPLOAD_DIR, `${key}.${ext}`);
      if (fs.existsSync(fp)) return fp;
    }
    return null;
  };

  apiRouter.post('/media', async (req, res) => {
    const { key, data, mimeType } = req.body;
    if (!key || !data) {
      return res.status(400).json({ error: 'key and data are required' });
    }
    try {
      let base64Payload = data as string;
      let detectedMime = mimeType || 'image/jpeg';
      if (base64Payload.startsWith('data:')) {
        const matches = base64Payload.match(/^data:([^;]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          detectedMime = matches[1];
          base64Payload = matches[2];
        }
      }
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/jpg': 'jpg',
        'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
      };
      const ext = extMap[detectedMime] || 'jpg';
      const filePath = path.join(CASUAL_UPLOAD_DIR, `${key}.${ext}`);
      fs.writeFileSync(filePath, Buffer.from(base64Payload, 'base64'));
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving media:', error);
      res.status(500).json({ error: 'Failed to save media' });
    }
  });

  apiRouter.get('/media/:key', async (req, res) => {
    const { key } = req.params;
    try {
      // Look for file in uploads/casual_images/
      const filePath = getCasualImagePath(key);
      if (filePath) {
        const extMatch = filePath.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          gif: 'image/gif', webp: 'image/webp',
        };
        const mimeType = mimeMap[ext] || 'image/jpeg';
        const imgBuffer = fs.readFileSync(filePath);
        const base64Data = imgBuffer.toString('base64');
        return res.json({ data: `data:${mimeType};base64,${base64Data}`, mimeType });
      }

      // Return 200 with null data instead of 404 to avoid noisy
      // "Not Found" entries in the browser console/network tab for
      // missing/orphaned media keys. Frontend already treats a
      // falsy `data` as "no image available".
      return res.json({ data: null, mimeType: null });
    } catch (error) {
      console.error('Error getting media:', error);
      res.status(500).json({ error: 'Failed to retrieve media' });
    }
  });

  apiRouter.delete('/media/:key', async (req, res) => {
    const { key } = req.params;
    try {
      const filePath = getCasualImagePath(key);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting media:', error);
      res.status(500).json({ error: 'Failed to delete media' });
    }
  });


  // ── Special Observations ─────────────────────────────────────────────────

  apiRouter.get('/special_observations', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json((localData.specialObservations || []).filter((e: any) => !e.is_deleted));
      }
      let sql = 'SELECT * FROM special_observations WHERE is_deleted = 0';
      const params: any[] = [];
      if (req.query.date) { sql += ' AND date = ?'; params.push(req.query.date); }
      sql += ' ORDER BY created_at DESC';
      const [rows] = await pool.query(sql, params);
      const parsed = (rows as any[]).map((r: any) => ({
        ...r,
        employeeIds: typeof r.employeeIds === 'string' ? JSON.parse(r.employeeIds) : (r.employeeIds ?? []),
        screenshots: typeof r.screenshots === 'string' ? JSON.parse(r.screenshots) : (r.screenshots ?? []),
      }));
      res.json(parsed);
    } catch (error) {
      console.error('Error fetching special observations:', error);
      res.status(500).json({ error: 'Failed to fetch special observations' });
    }
  });

  apiRouter.post('/special_observations', async (req, res) => {
    const entry = req.body;
    const id = entry.id || String(Date.now() + Math.random());
    try {
      if (useMemoryStore || !pool) {
        if (!localData.specialObservations) localData.specialObservations = [];
        const idx = localData.specialObservations.findIndex((e: any) => String(e.id) === id);
        if (idx >= 0) { localData.specialObservations[idx] = { ...entry, id }; }
        else { localData.specialObservations.push({ ...entry, id }); }
        saveLocalData(localData);
        return res.json({ ...entry, id });
      }
      const empIds = typeof entry.employeeIds === 'string' ? entry.employeeIds : JSON.stringify(entry.employeeIds || []);
      const shots = typeof entry.screenshots === 'string' ? entry.screenshots : JSON.stringify(entry.screenshots || []);
      await pool.query(
        `INSERT INTO special_observations (id, date, time, remarks, observation_details, employeeIds, screenshots, user_id, is_deleted, deleted_at, deleted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE date=VALUES(date), time=VALUES(time), remarks=VALUES(remarks),
         observation_details=VALUES(observation_details), employeeIds=VALUES(employeeIds),
         screenshots=VALUES(screenshots), is_deleted=VALUES(is_deleted), user_id=VALUES(user_id)`,
        [id, entry.date || null, entry.time || null, entry.remarks || null, entry.observation_details || null,
         empIds, shots, entry.user_id || null, entry.is_deleted ? 1 : 0, entry.deleted_at || null, entry.deleted_by || null]
      );
      res.json({ ...entry, id });
    } catch (error) {
      console.error('Error saving special observation:', error);
      res.status(500).json({ error: 'Failed to save special observation' });
    }
  });

  apiRouter.post('/special_observations/bulk', async (req, res) => {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });
    try {
      if (useMemoryStore || !pool) {
        if (!localData.specialObservations) localData.specialObservations = [];
        for (const entry of entries) {
          const idx = localData.specialObservations.findIndex((e: any) => String(e.id) === String(entry.id));
          if (idx >= 0) { localData.specialObservations[idx] = entry; } else { localData.specialObservations.push(entry); }
        }
        saveLocalData(localData);
        return res.json({ success: true });
      }
      for (const entry of entries) {
        const id = entry.id || String(Date.now() + Math.random());
        const empIds = typeof entry.employeeIds === 'string' ? entry.employeeIds : JSON.stringify(entry.employeeIds || []);
        const shots = typeof entry.screenshots === 'string' ? entry.screenshots : JSON.stringify(entry.screenshots || []);
        await pool.query(
          `INSERT INTO special_observations (id, date, time, remarks, observation_details, employeeIds, screenshots, user_id, is_deleted, deleted_at, deleted_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE date=VALUES(date), time=VALUES(time), remarks=VALUES(remarks),
           observation_details=VALUES(observation_details), employeeIds=VALUES(employeeIds),
           screenshots=VALUES(screenshots), is_deleted=VALUES(is_deleted), user_id=VALUES(user_id)`,
          [id, entry.date || null, entry.time || null, entry.remarks || null, entry.observation_details || null,
           empIds, shots, entry.user_id || null, entry.is_deleted ? 1 : 0, entry.deleted_at || null, entry.deleted_by || null]
        );
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error bulk saving special observations:', error);
      res.status(500).json({ error: 'Failed to bulk save' });
    }
  });

  apiRouter.patch('/special_observations/:id/soft-delete', async (req, res) => {
    const { id } = req.params;
    const { deleted_by } = req.body || {};
    try {
      if (useMemoryStore || !pool) {
        if (!localData.specialObservations) localData.specialObservations = [];
        localData.specialObservations = localData.specialObservations.map((e: any) =>
          String(e.id) === id ? { ...e, is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: deleted_by || null } : e
        );
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query(
        'UPDATE special_observations SET is_deleted = 1, deleted_at = NOW(), deleted_by = ? WHERE id = ?',
        [deleted_by || null, id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error soft-deleting special observation:', error);
      res.status(500).json({ error: 'Failed to delete' });
    }
  });

  apiRouter.patch('/special_observations/:id/restore', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.specialObservations) localData.specialObservations = [];
        localData.specialObservations = localData.specialObservations.map((e: any) =>
          String(e.id) === id ? { ...e, is_deleted: false, deleted_at: null, deleted_by: null } : e
        );
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query(
        'UPDATE special_observations SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL WHERE id = ?',
        [id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error restoring special observation:', error);
      res.status(500).json({ error: 'Failed to restore' });
    }
  });

  apiRouter.get('/special_observations/deleted', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json((localData.specialObservations || []).filter((e: any) => e.is_deleted));
      }
      const [rows] = await pool.query('SELECT * FROM special_observations WHERE is_deleted = 1 ORDER BY deleted_at DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch deleted observations' });
    }
  });

  apiRouter.delete('/special_observations/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.specialObservations) localData.specialObservations = [];
        localData.specialObservations = localData.specialObservations.filter((e: any) => String(e.id) !== id);
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM special_observations WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting special observation:', error);
      res.status(500).json({ error: 'Failed to delete' });
    }
  });

  apiRouter.get('/project_cases', async (req, res) => {
    try {
      if (useMemoryStore || !pool) {
        return res.json((localData.projectCases || []).filter((e: any) => !e.is_deleted));
      }
      const [rows] = await pool.query('SELECT * FROM project_cases WHERE is_deleted = 0 ORDER BY created_at DESC');
      const parsed = (rows as any[]).map((r: any) => ({
        ...r,
        annotations: typeof r.annotations === 'string' ? JSON.parse(r.annotations) : (r.annotations ?? []),
      }));
      res.json(parsed);
    } catch (error) {
      console.error('Error fetching project cases:', error);
      res.status(500).json({ error: 'Failed to fetch project cases' });
    }
  });

  apiRouter.post('/project_cases', async (req, res) => {
    const entry = req.body;
    const id = String(entry.id ?? (Date.now() + Math.random()));
    try {
      if (useMemoryStore || !pool) {
        if (!localData.projectCases) localData.projectCases = [];
        const idx = localData.projectCases.findIndex((e: any) => String(e.id) === id);
        if (idx >= 0) { localData.projectCases[idx] = { ...entry, id }; }
        else { localData.projectCases.push({ ...entry, id }); }
        saveLocalData(localData);
        return res.json({ ...entry, id });
      }
      await pool.query(
        `INSERT INTO project_cases (id, projectName, projectZone, caseName, liableDept, comments, photo, annotations, category, priority, summary, reporter, reporterId, date, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE projectName=VALUES(projectName), projectZone=VALUES(projectZone),
         caseName=VALUES(caseName), liableDept=VALUES(liableDept), comments=VALUES(comments),
         photo=VALUES(photo), annotations=VALUES(annotations), category=VALUES(category), priority=VALUES(priority),
         summary=VALUES(summary), reporter=VALUES(reporter), reporterId=VALUES(reporterId),
         date=VALUES(date), is_deleted=VALUES(is_deleted)`,
        [id, entry.projectName || null, entry.projectZone || null, entry.caseName || null, entry.liableDept || null,
         entry.comments || null, entry.photo || null, JSON.stringify(entry.annotations || []), entry.category || null, entry.priority || null,
         entry.summary || null, entry.reporter || null, entry.reporterId != null ? String(entry.reporterId) : null,
         entry.date || null, entry.is_deleted ? 1 : 0]
      );
      res.json({ ...entry, id });
    } catch (error) {
      console.error('Error saving project case:', error);
      res.status(500).json({ error: 'Failed to save project case' });
    }
  });

  apiRouter.put('/project_cases/:id', async (req, res) => {
    const { id } = req.params;
    const entry = req.body;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.projectCases) localData.projectCases = [];
        const idx = localData.projectCases.findIndex((e: any) => String(e.id) === id);
        if (idx >= 0) { localData.projectCases[idx] = { ...localData.projectCases[idx], ...entry, id }; }
        saveLocalData(localData);
        return res.json({ ...entry, id });
      }
      await pool.query(
        `UPDATE project_cases SET projectName=?, projectZone=?, caseName=?, liableDept=?, comments=?, photo=?, annotations=?,
         category=?, priority=?, summary=?, reporter=?, reporterId=?, date=?, is_deleted=? WHERE id=?`,
        [entry.projectName || null, entry.projectZone || null, entry.caseName || null, entry.liableDept || null,
         entry.comments || null, entry.photo || null, JSON.stringify(entry.annotations || []), entry.category || null, entry.priority || null,
         entry.summary || null, entry.reporter || null, entry.reporterId != null ? String(entry.reporterId) : null,
         entry.date || null, entry.is_deleted ? 1 : 0, id]
      );
      res.json({ ...entry, id });
    } catch (error) {
      console.error('Error updating project case:', error);
      res.status(500).json({ error: 'Failed to update project case' });
    }
  });

  apiRouter.delete('/project_cases/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (useMemoryStore || !pool) {
        if (!localData.projectCases) localData.projectCases = [];
        localData.projectCases = localData.projectCases.filter((e: any) => String(e.id) !== id);
        saveLocalData(localData);
        return res.json({ success: true });
      }
      await pool.query('DELETE FROM project_cases WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting project case:', error);
      res.status(500).json({ error: 'Failed to delete project case' });
    }
  });

  // Log registered routes
  console.log('[API DEBUG] Registering API routes...');
  apiRouter.stack.forEach((r: any) => {
    if (r.route && r.route.path) {
      console.log(`[API DEBUG] Route: ${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
    }
  });

  apiRouter.use((req, res) => {
    console.warn(`[API 404] Unhandled request: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `Not Found: ${req.method} ${req.originalUrl}` });
  });

  // --- Vite Middleware for Development ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RESTART-LOG] Server running at http://localhost:${PORT} - Time: ${new Date().toISOString()}`);
  });
}

startServer();