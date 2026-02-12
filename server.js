const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 跨域
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// 连接 PostgreSQL（Supabase）
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 初始化数据库表
async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                "projectNumber" TEXT DEFAULT '',
                client TEXT NOT NULL,
                status TEXT NOT NULL,
                "startDate" TEXT NOT NULL,
                "endDate" TEXT NOT NULL,
                leader TEXT NOT NULL,
                participants TEXT DEFAULT '[]',
                notes TEXT DEFAULT '',
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS team_members (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            )
        `);

        const { rows } = await client.query('SELECT COUNT(*) FROM team_members');
        if (parseInt(rows[0].count) === 0) {
            const defaults = ['张三', '李四', '王五', '赵六', '孙七', '周八', '吴九', '郑十'];
            for (const name of defaults) {
                await client.query(
                    'INSERT INTO team_members (name) VALUES ($1) ON CONFLICT DO NOTHING',
                    [name]
                );
            }
        }
        console.log('数据库初始化完成');
    } catch (err) {
        console.error('数据库初始化失败:', err.message);
    } finally {
        client.release();
    }
}

initDB();

function parseParticipants(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
}

// ── API 路由 ──────────────────────────────────────────

app.get('/api/projects', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM projects ORDER BY "createdAt" DESC');
        res.json(rows.map(r => ({ ...r, participants: parseParticipants(r.participants) })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', async (req, res) => {
    const { name, projectNumber, client, status, startDate, endDate, leader, participants, notes } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO projects (name, "projectNumber", client, status, "startDate", "endDate", leader, participants, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [name, projectNumber || '', client, status, startDate, endDate, leader,
             JSON.stringify(participants || []), notes || '']
        );
        res.json({ id: rows[0].id, message: '项目添加成功' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', async (req, res) => {
    const { name, projectNumber, client, status, startDate, endDate, leader, participants, notes } = req.body;
    try {
        await pool.query(
            `UPDATE projects SET name=$1, "projectNumber"=$2, client=$3, status=$4,
             "startDate"=$5, "endDate"=$6, leader=$7, participants=$8, notes=$9 WHERE id=$10`,
            [name, projectNumber || '', client, status, startDate, endDate, leader,
             JSON.stringify(participants || []), notes || '', req.params.id]
        );
        res.json({ message: '项目更新成功' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
        res.json({ message: '项目删除成功' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/team-members', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT name FROM team_members ORDER BY id');
        res.json(rows.map(r => r.name));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/team-members', async (req, res) => {
    const { name } = req.body;
    try {
        await pool.query('INSERT INTO team_members (name) VALUES ($1)', [name]);
        res.json({ message: '成员添加成功' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: '该成员已存在' });
        res.status(500).json({ error: err.message });
    }
});

// ── 静态文件 ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器已启动: http://0.0.0.0:${PORT}`);
});
