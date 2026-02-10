const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 初始化数据库
const db = new sqlite3.Database('./projects.db', (err) => {
    if (err) {
        console.error('数据库连接失败:', err);
    } else {
        console.log('数据库连接成功');
        initDatabase();
    }
});

// 创建数据表
function initDatabase() {
    // 使用 serialize 确保按顺序执行
    db.serialize(() => {
        // 创建项目表
        db.run(`
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                client TEXT NOT NULL,
                status TEXT NOT NULL,
                startDate TEXT NOT NULL,
                endDate TEXT NOT NULL,
                leader TEXT NOT NULL,
                participants TEXT NOT NULL,
                notes TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('创建projects表失败:', err);
            } else {
                console.log('projects表已就绪');
            }
        });

        // 创建团队成员表
        db.run(`
            CREATE TABLE IF NOT EXISTS team_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            )
        `, (err) => {
            if (err) {
                console.error('创建team_members表失败:', err);
            } else {
                console.log('team_members表已就绪');
                
                // 表创建成功后插入默认成员
                const defaultMembers = ['Austin Chai', 'Keming Zhu', 'Sophia Wu', 'Tao Shi', 'Xi Liu'];
                const stmt = db.prepare('INSERT OR IGNORE INTO team_members (name) VALUES (?)');
                
                defaultMembers.forEach(member => {
                    stmt.run(member);
                });
                
                stmt.finalize((err) => {
                    if (err) {
                        console.error('插入默认成员失败:', err);
                    } else {
                        console.log('默认团队成员已初始化');
                    }
                });
            }
        });
    });
}

// API路由

// 获取所有项目
app.get('/api/projects', (req, res) => {
    db.all('SELECT * FROM projects ORDER BY createdAt DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        // 将参与人字符串转换为数组
        const projects = rows.map(row => ({
            ...row,
            participants: JSON.parse(row.participants)
        }));
        res.json(projects);
    });
});

// 添加项目
app.post('/api/projects', (req, res) => {
    const { name, client, status, startDate, endDate, leader, participants, notes } = req.body;
    
    const sql = `
        INSERT INTO projects (name, client, status, startDate, endDate, leader, participants, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        name, 
        client, 
        status, 
        startDate, 
        endDate, 
        leader, 
        JSON.stringify(participants), 
        notes || ''
    ];

    db.run(sql, params, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            id: this.lastID,
            message: '项目添加成功'
        });
    });
});

// 删除项目
app.delete('/api/projects/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM projects WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: '项目删除成功' });
    });
});

// 获取团队成员
app.get('/api/team-members', (req, res) => {
    db.all('SELECT name FROM team_members ORDER BY id', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows.map(row => row.name));
    });
});

// 添加团队成员
app.post('/api/team-members', (req, res) => {
    const { name } = req.body;
    
    db.run('INSERT INTO team_members (name) VALUES (?)', [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                res.status(400).json({ error: '该成员已存在' });
            } else {
                res.status(500).json({ error: err.message });
            }
            return;
        }
        res.json({ message: '成员添加成功' });
    });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
    console.log('访问 http://你的服务器IP:3000 即可使用');
});

// 优雅关闭
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('数据库连接已关闭');
        process.exit(0);
    });
});
