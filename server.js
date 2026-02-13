const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 允许跨域
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// 初始化数据库
const db = new sqlite3.Database('./projects.db');

db.serialize(() => {
    // 1. 项目表
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        projectNumber TEXT DEFAULT '',
        client TEXT NOT NULL,
        status TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        leader TEXT NOT NULL,
        salesRep TEXT DEFAULT '',
        participants TEXT DEFAULT '[]',
        notes TEXT DEFAULT '',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. 团队成员表（用于负责人和参与人）
    db.run(`CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )`);

    // 3. 【新增】销售代表表（专门用于CR）
    db.run(`CREATE TABLE IF NOT EXISTS sales_reps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )`);

    // 初始化默认数据
    const teamDefaults = ['Austin Chai','Xi Liu','Keming Zhu','Sophia Wu','Tao Shi'];
    const salesDefaults = ['Angela Zhu', 'May Gao', 'LiangGang Yan','Klaudia Zhang', 'Tara Zhang','Chengqian Li']; // 默认销售

    const stmtTeam = db.prepare('INSERT OR IGNORE INTO team_members (name) VALUES (?)');
    teamDefaults.forEach(name => stmtTeam.run(name));
    stmtTeam.finalize();

    const stmtSales = db.prepare('INSERT OR IGNORE INTO sales_reps (name) VALUES (?)');
    salesDefaults.forEach(name => stmtSales.run(name));
    stmtSales.finalize();

    console.log('数据库初始化完成');
});

// 安全解析participants
function parseParticipants(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
}

// ── API 路由 ──────────────────────────────────────────

// 获取所有项目
app.get('/api/projects', (req, res) => {
    db.all('SELECT * FROM projects ORDER BY createdAt DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => ({ ...r, participants: parseParticipants(r.participants) })));
    });
});

// 新增项目
app.post('/api/projects', (req, res) => {
    const { name, projectNumber, client, status, startDate, endDate, leader, salesRep, participants, notes } = req.body;
    db.run(
        `INSERT INTO projects (name, projectNumber, client, status, startDate, endDate, leader, salesRep, participants, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, projectNumber || '', client, status, startDate, endDate, leader, salesRep || '',
         JSON.stringify(participants || []), notes || ''],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: '项目添加成功' });
        }
    );
});

// 更新项目
app.put('/api/projects/:id', (req, res) => {
    const { name, projectNumber, client, status, startDate, endDate, leader, salesRep, participants, notes } = req.body;
    db.run(
        `UPDATE projects SET name=?, projectNumber=?, client=?, status=?, startDate=?,
         endDate=?, leader=?, salesRep=?, participants=?, notes=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?`,
        [name, projectNumber || '', client, status, startDate, endDate, leader, salesRep || '',
         JSON.stringify(participants || []), notes || '', req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: '项目更新成功' });
        }
    );
});

// 删除项目
app.delete('/api/projects/:id', (req, res) => {
    db.run('DELETE FROM projects WHERE id=?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '项目删除成功' });
    });
});

// ── 团队成员 API (原有) ──
app.get('/api/team-members', (req, res) => {
    db.all('SELECT name FROM team_members ORDER BY id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.name));
    });
});

app.post('/api/team-members', (req, res) => {
    const { name } = req.body;
    db.run('INSERT INTO team_members (name) VALUES (?)', [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: '该成员已存在' });
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '成员添加成功' });
    });
});

// ── 【新增】销售代表 API ──
app.get('/api/sales-reps', (req, res) => {
    db.all('SELECT name FROM sales_reps ORDER BY id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.name));
    });
});

app.post('/api/sales-reps', (req, res) => {
    const { name } = req.body;
    db.run('INSERT INTO sales_reps (name) VALUES (?)', [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: '该销售已存在' });
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '销售添加成功' });
    });
});

// ── 静态文件 ────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 启动 ─────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器已启动: http://0.0.0.0:${PORT}`);
});

process.on('SIGINT', () => {
    db.close(() => process.exit(0));
});
