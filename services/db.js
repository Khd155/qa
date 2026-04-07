const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'camp.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── Schema ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL CHECK(role IN ('supervisor','section_manager','general_manager')),
    section    TEXT    NOT NULL DEFAULT 'both' CHECK(section IN ('men','women','both')),
    phone      TEXT    DEFAULT '',
    wa_notify  INTEGER DEFAULT 1,
    active     INTEGER DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    section         TEXT    NOT NULL CHECK(section IN ('men','women')),
    supervisor_id   INTEGER REFERENCES users(id),
    supervisor_name TEXT    NOT NULL,
    room            TEXT    NOT NULL,
    bed             TEXT    DEFAULT '',
    category        TEXT    NOT NULL,
    priority        TEXT    NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent')),
    description     TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','closed')),
    assigned_to     INTEGER REFERENCES users(id),
    closed_by       INTEGER REFERENCES users(id),
    closed_note     TEXT    DEFAULT '',
    response_mins   INTEGER,
    created_at      TEXT    DEFAULT (datetime('now','localtime')),
    updated_at      TEXT    DEFAULT (datetime('now','localtime')),
    closed_at       TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES reports(id),
    user_id   INTEGER REFERENCES users(id),
    phone     TEXT,
    status    TEXT,
    message   TEXT,
    sent_at   TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_rep_section  ON reports(section);
  CREATE INDEX IF NOT EXISTS idx_rep_status   ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_rep_created  ON reports(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_rep_sup      ON reports(supervisor_id);
  CREATE INDEX IF NOT EXISTS idx_usr_username ON users(username);
`);

// ── Seed ───────────────────────────────────────────────────────────
const SEED = [
  { name:'المدير العام',           username:'admin',       password:'Admin@1446',  role:'general_manager', section:'both',  phone: process.env.PHONE_ADMIN     || '' },
  { name:'مدير قسم الرجال',       username:'men_manager', password:'Men@1446',    role:'section_manager', section:'men',   phone: process.env.PHONE_MEN_MGR   || '' },
  { name:'مدير قسم النساء',       username:'women_mgr',   password:'Women@1446',  role:'section_manager', section:'women', phone: process.env.PHONE_WOMEN_MGR || '' },
  { name:'مدير الميدان',          username:'field_mgr',   password:'Field@1446',  role:'section_manager', section:'both',  phone: process.env.PHONE_FIELD_MGR || '' },
  { name:'مصعب باقارش',           username:'musab',       password:'Pass@1446',   role:'supervisor',      section:'men',   phone: process.env.PHONE_SUP1      || '' },
  { name:'حمزة جبريل',            username:'hamza',       password:'Pass@1446',   role:'supervisor',      section:'men',   phone: process.env.PHONE_SUP2      || '' },
  { name:'عبدالعزيز السليمان',    username:'abdulaziz',   password:'Pass@1446',   role:'supervisor',      section:'men',   phone: process.env.PHONE_SUP3      || '' },
  { name:'فيصل باوزير',           username:'faisal',      password:'Pass@1446',   role:'supervisor',      section:'men',   phone: process.env.PHONE_SUP4      || '' },
  { name:'بدر الرويس',            username:'badr',        password:'Pass@1446',   role:'supervisor',      section:'men',   phone: process.env.PHONE_SUP5      || '' },
  { name:'سحر الخطابي',           username:'sahar',       password:'Pass@1446',   role:'supervisor',      section:'women', phone: process.env.PHONE_SUP6      || '' },
  { name:'مرام المهناء',          username:'maram',       password:'Pass@1446',   role:'supervisor',      section:'women', phone: process.env.PHONE_SUP7      || '' },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (name,username,password,role,section,phone)
  VALUES (@name,@username,@password,@role,@section,@phone)
`);

db.transaction(() => {
  for (const u of SEED) {
    insertUser.run({ ...u, password: bcrypt.hashSync(u.password, 10) });
  }
})();

module.exports = db;
