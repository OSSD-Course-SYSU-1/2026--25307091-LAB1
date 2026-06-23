document.addEventListener('DOMContentLoaded', () => {
    // 格式化分数显示，添加前导零
    function formatScore(score, length) {
        return score.toString().padStart(length, '0');
    }
    // 游戏配置常量
    const CONSTANTS = {
        GAME_SPEED: 400,                // 游戏基本速度（毫秒）
        GRID_COUNT_X: 10,               // X轴网格数量
        GRID_COUNT_Y: 15,               // Y轴网格数量（根据10:15的宽高比）
        COUNTDOWN_DURATION: 500,        // 倒计时间隔（毫秒）
        INITIAL_SNAKE_LENGTH: 3,        // 初始蛇的长度
        ANIMATION_DURATION: 1000,       // 动画持续时间（毫秒）
        POINTS_PER_FOOD: 100,           // 每个食物的分数
        SCORE_DIGITS: 8,                // 分数显示的位数
        // 游戏结束动画配置
        GAME_OVER_ANIMATION_DURATION: 1200,  // 游戏结束动画总时长（毫秒）
        GAME_OVER_ANIMATION_INTERVAL: 120,   // 每段消失的间隔（毫秒）
        SNAKE_IMAGES: {
            // 蛇头 - 只使用一个通用的蛇头图片
            HEAD: 'images/snake_head.png',
            HEAD_LEFT: 'images/snake_head_left.png',
            HEAD_RIGHT: 'images/snake_head_right.png',
            // 蛇身 - 水平和垂直的直线部分
            BODY_HORIZONTAL: 'images/snake_body_horizontal.png',
            BODY_VERTICAL: 'images/snake_body_vertical.png',
            // 拐角连接处的身体 - 四个角落
            BODY_CORNER_TOP_LEFT: 'images/snake_body_corner_top_left.png',
            BODY_CORNER_TOP_RIGHT: 'images/snake_body_corner_top_right.png',
            BODY_CORNER_BOTTOM_LEFT: 'images/snake_body_corner_bottom_left.png',
            BODY_CORNER_BOTTOM_RIGHT: 'images/snake_body_corner_bottom_right.png',
        },
        SNAKE_HEAD_COLOR: '#388E3C',    // 蛇头颜色
        SNAKE_BODY_BASE_COLOR: 150,     // 蛇身基础颜色值
        FOOD_IMAGES: [
            'images/food1.png',
            'images/food2.png'
        ],
        GRID_LINE_COLOR: '#2D4B63',     // 网格线颜色
        GRID_LINE_WIDTH: 0.002,        // 网格线宽度比例（4px/2000px）
        BACKGROUND_COLOR: '#2C3753',       // 背景颜色
        CANVAS_BACKGROUND_COLOR: '#385169',
        PORTRAIT_CANVAS_HEIGHT_RATIO: 0.6,  // 竖屏画布高度比例
        LANDSCAPE_CANVAS_WIDTH_RATIO: 0.6,  // 横屏画布宽度比例
        CANVAS_ASPECT_RATIO: { WIDTH: 10, HEIGHT: 15 }, // 画布宽高比 10:15
        SWIPE_THRESHOLD: 0,             // 滑动阈值
        // 双食物系统
        SHRINK_FOOD_PROBABILITY: 0.2,    // 有毒食物初始概率（20%，随等级递增最大50%）
        // 迭代难度系统（积分+时间+历史战绩三驱动）
        ITERATION_SCORE_STEP: 500,
        ITERATION_TIME_STEP: 45,
        ITERATION_MAX_LEVEL: 8,
        BASE_FOOD_POINTS: 100,
        LEVEL_FOOD_BONUS: 50,
        BASE_SHRINK_SEGMENTS: 2,
        LEVEL_SHRINK_STEP: 2,
        TOXIC_PENALTY_RATIO: 0.5,
        BASE_FOOD_INTERVAL: 15,
        MIN_FOOD_INTERVAL: 3,
        LEVEL_INTERVAL_STEP: 1.5,
        HISTORY_BONUS_DIVISOR: 300       // 历史均分/300 = 额外等级
    };
    
    // ================= 自学习动态参数 =================
    let learningParams = {
        scoreStep: CONSTANTS.ITERATION_SCORE_STEP,
        timeStep: CONSTANTS.ITERATION_TIME_STEP,
        intervalStep: CONSTANTS.LEVEL_INTERVAL_STEP,
        shrinkProb: CONSTANTS.SHRINK_FOOD_PROBABILITY,
        gameCount: 0,
        recentResults: []  // 最近5场 {score, duration}
    };
    
    function loadLearningParams() {
        try {
            const saved = JSON.parse(localStorage.getItem('snakeLearning') || 'null');
            if (saved) {
                learningParams.scoreStep = saved.scoreStep || learningParams.scoreStep;
                learningParams.timeStep = saved.timeStep || learningParams.timeStep;
                learningParams.intervalStep = saved.intervalStep || learningParams.intervalStep;
                learningParams.shrinkProb = Math.min(0.5, saved.shrinkProb || learningParams.shrinkProb);
                learningParams.gameCount = saved.gameCount || 0;
                learningParams.recentResults = saved.recentResults || [];
            }
        } catch (e) {}
    }
    
    function saveLearningParams() {
        try {
            localStorage.setItem('snakeLearning', JSON.stringify({
                scoreStep: learningParams.scoreStep,
                timeStep: learningParams.timeStep,
                intervalStep: learningParams.intervalStep,
                shrinkProb: learningParams.shrinkProb,
                gameCount: learningParams.gameCount,
                recentResults: learningParams.recentResults
            }));
        } catch (e) {}
    }
    
    // 每5场自我更新一次
    function updateLearningModel(finalScore, duration) {
        learningParams.recentResults.push({ score: finalScore, duration: duration });
        if (learningParams.recentResults.length > 5) learningParams.recentResults.shift();
        learningParams.gameCount++;
        saveLearningParams();
        
        if (learningParams.gameCount % 5 !== 0 || learningParams.recentResults.length < 5) return;
        
        const avgScore = learningParams.recentResults.reduce((s, r) => s + r.score, 0) / 5;
        const avgTime = learningParams.recentResults.reduce((s, r) => s + r.duration, 0) / 5;
        
        // AI自适应：玩得好→加难度，玩得差→降难度
        if (avgScore > 2500 && avgTime > 90) {
            learningParams.scoreStep = Math.min(800, learningParams.scoreStep + 80);
            learningParams.timeStep = Math.max(20, learningParams.timeStep - 6);
            learningParams.intervalStep = Math.min(2.5, learningParams.intervalStep + 0.2);
            learningParams.shrinkProb = Math.min(0.5, learningParams.shrinkProb + 0.03);
            console.log('📈 AI: 你太强了，难度提升！');
        } else if (avgScore > 1500) {
            learningParams.scoreStep = Math.min(800, learningParams.scoreStep + 40);
            learningParams.shrinkProb = Math.min(0.5, learningParams.shrinkProb + 0.02);
            console.log('📊 AI: 微调难度中...');
        } else if (avgScore < 600) {
            learningParams.scoreStep = Math.max(200, learningParams.scoreStep - 60);
            learningParams.timeStep = Math.min(55, learningParams.timeStep + 8);
            learningParams.intervalStep = Math.max(0.8, learningParams.intervalStep - 0.2);
            learningParams.shrinkProb = Math.max(0.1, learningParams.shrinkProb - 0.04);
            console.log('📉 AI: 放点水，难度降低~');
        }
        saveLearningParams();
        historyLevel = loadHistoryLevel();
    }

    /**
     * 根据断点和可用空间计算最优网格尺寸
     * @returns {{ tileCountX: number, tileCountY: number, gridSize: number }}
     */
    function calculateGridForBreakpoint(availableWidth, availableHeight) {
        const breakpointData = window.__breakpointData;
        const breakpoint = breakpointData ? breakpointData.breakpoint : 'sm';
        const orientation = breakpointData ? breakpointData.orientation : 'portrait';
        
        let gridX, gridY;
        switch (breakpoint) {
            case 'lg': gridX = 14; gridY = 20; break;
            case 'md': gridX = 12; gridY = 18; break;
            case 'xs': gridX = 8;  gridY = 12; break;
            default:   gridX = CONSTANTS.GRID_COUNT_X; gridY = CONSTANTS.GRID_COUNT_Y; break;
        }
        
        // 横屏时交换 XY
        if (orientation === 'landscape') {
            var tmp = gridX; gridX = gridY; gridY = tmp;
        }
        
        var MIN_CELL_SIZE = 14;
        var maxGridSizeByWidth = Math.floor(availableWidth / gridX);
        var maxGridSizeByHeight = Math.floor(availableHeight / gridY);
        var gridSize = Math.min(maxGridSizeByWidth, maxGridSizeByHeight);
        
        if (gridSize < MIN_CELL_SIZE) {
            if (gridX > 12) { gridX = 12; gridY = 18; }
            else if (gridX > 10) { gridX = 10; gridY = 15; }
            else { gridX = 8; gridY = 12; }
            gridSize = Math.min(Math.floor(availableWidth / gridX), Math.floor(availableHeight / gridY));
        }
        
        if (gridSize < 1 || isNaN(gridSize)) {
            gridSize = 20; gridX = 10; gridY = 15;
        }
        
        console.log('断点: ' + breakpoint + ', 网格: ' + gridX + '×' + gridY + ', cell: ' + gridSize + 'px');
        return { tileCountX: gridX, tileCountY: gridY, gridSize: Math.floor(gridSize) };
    }
    
    // 获取游戏元素
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const highScoreElement = document.getElementById('highScore');
    const finalScoreElement = document.getElementById('finalScore');
    const gameOverModal = document.getElementById('gameOverModal');
    const startBtn = document.getElementById('startBtn');
    const restartBtn = document.getElementById('restartBtn');
    const playAgainBtn = document.getElementById('playAgainBtn');
    const countdownOverlay = document.getElementById('countdownOverlay');
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    const scoreAnimation = document.getElementById('scoreAnimation');

    // 图片资源管理
    const imageCache = {};
    let imagesLoaded = false;
    let imagesToLoad = 0;
    
    // 预加载图片
    function preloadImages(callback) {
        // 重置加载状态
        imagesLoaded = false;
        imagesToLoad = 0;
        
        // 清空图片缓存
        for (const key in imageCache) {
            delete imageCache[key];
        }
        
        // 计算需要加载的图片数量
        // 加载蛇的图片
        for (const key in CONSTANTS.SNAKE_IMAGES) {
            if (CONSTANTS.SNAKE_IMAGES.hasOwnProperty(key)) {
                imagesToLoad++;
            }
        }
        
        // 加载食物图片
        imagesToLoad += CONSTANTS.FOOD_IMAGES.length;
        
        if (imagesToLoad === 0) {
            // 如果没有图片需要加载，直接调用回调
            imagesLoaded = true;
            if (callback) callback();
            return;
        }
        
        // 保存加载失败的图片
        const failedImages = [];
        
        // 加载蛇的图片
        for (const key in CONSTANTS.SNAKE_IMAGES) {
            if (CONSTANTS.SNAKE_IMAGES.hasOwnProperty(key)) {
                const src = CONSTANTS.SNAKE_IMAGES[key];
                // 创建Image对象
                const img = new Image();
                
                // 设置加载完成回调
                img.onload = function() {
                    imagesToLoad--;
                    console.log(`图片加载成功: ${key} (${src})`);
                    img.error = false;
                    
                    if (imagesToLoad === 0) {
                        // 所有图片加载完成或失败后
                        if (failedImages.length > 0) {
                            console.warn(`${failedImages.length} 张图片加载失败`);
                        }
                        imagesLoaded = true;
                        if (callback) callback();
                    }
                };
                
                // 设置加载失败回调
                img.onerror = function() {
                    console.error(`图片加载失败: ${src}`);
                    failedImages.push(key);
                    img.error = true;
                    imagesToLoad--;
                    
                    if (imagesToLoad === 0) {
                        // 所有图片加载完成或失败后
                        if (failedImages.length > 0) {
                            console.warn(`${failedImages.length} 张图片加载失败`);
                        }
                        imagesLoaded = true;
                        if (callback) callback();
                    }
                };
                
                // 开始加载图片
                img.src = src;
                imageCache[key] = img;
            }
        }
        
        // 加载食物图片
        CONSTANTS.FOOD_IMAGES.forEach((src, index) => {
            const key = `FOOD_${index}`;
            const img = new Image();
            
            // 设置加载完成回调
            img.onload = function() {
                imagesToLoad--;
                console.log(`图片加载成功: ${key} (${src})`);
                img.error = false;
                
                if (imagesToLoad === 0) {
                    // 所有图片加载完成或失败后
                    if (failedImages.length > 0) {
                        console.warn(`${failedImages.length} 张图片加载失败`);
                    }
                    imagesLoaded = true;
                    if (callback) callback();
                }
            };
            
            // 设置加载失败回调
            img.onerror = function() {
                console.error(`图片加载失败: ${src}`);
                failedImages.push(key);
                img.error = true;
                imagesToLoad--;
                
                if (imagesToLoad === 0) {
                    // 所有图片加载完成或失败后
                    if (failedImages.length > 0) {
                        console.warn(`${failedImages.length} 张图片加载失败`);
                    }
                    imagesLoaded = true;
                    if (callback) callback();
                }
            };
            
            // 开始加载图片
            img.src = src;
            imageCache[key] = img;
        });
    }
    
    // 获取蛇部分的图片
    function getSnakeImage(part) {
        // 如果图像存在于缓存中且已加载完成，直接返回
        if (imageCache[part] && imageCache[part].complete && !imageCache[part].error) {
            return imageCache[part];
        }
        
        // 如果请求的是现有的图片但尚未加载完成或加载失败，返回null
        return null;
    }

    // 检查图片加载状态
    function checkAndCreateMissingImages() {
        // 记录当前加载图片的状态
        const loadedImages = [];
        const failedImages = [];
        
        for (const key in CONSTANTS.SNAKE_IMAGES) {
            if (CONSTANTS.SNAKE_IMAGES.hasOwnProperty(key)) {
                if (imageCache[key] && imageCache[key].complete) {
                    loadedImages.push(key);
                } else {
                    failedImages.push(key);
                }
            }
        }
        
        console.log(`已加载 ${loadedImages.length} 张图片，加载失败 ${failedImages.length} 张图片`);
        
        if (failedImages.length > 0) {
            console.warn('以下图片加载失败，将使用备用绘制方法：', failedImages.join(', '));
        }
        
        // 设置图片已加载标志
        imagesLoaded = true;
    }

    // 游戏变量
    let snake = [];
    let foods = [];
    let gridSize = 20;
    let tileCountX = CONSTANTS.GRID_COUNT_X;
    let tileCountY = CONSTANTS.GRID_COUNT_Y;
    let direction = 'right';
    let nextDirection = 'right';
    const CONSTANT_GAME_SPEED = CONSTANTS.GAME_SPEED; // 定义恒定游戏速度常量
    let gameSpeed = CONSTANT_GAME_SPEED;
    let gameStarted = false;
    let gameOver = false;
    let gamePaused = false;
    let score = 0;
    let highScore = localStorage.getItem('snakeHighScore') || 0;
    let gameLoop;
    let countdownTimer;
    
    // 添加标记，防止重复触发游戏结束
    let isGameOverHandled = false;
    
    // 智能同步：记录上次常规同步时间，控制同步频率
    let lastRegularSyncTime = 0;
    
    // 迭代难度系统变量
    let elapsedSeconds = 0;
    let elapsedTimer = null;
    let foodSpawnTimer = null;
    let iterationLevel = 0;
    let historyLevel = 0;  // 历史战绩贡献的等级
    
    // 游戏结束动画状态
    let gameOverAnimationState = {
        isActive: false,
        animationType: null, // 'disappear' 或 'boundary-exit'
        visibleSegments: 0,
        animationTimer: null,
        boundaryDirection: null
    };

    // ================= NPC 蛆系统 =================
    let maggots = [];
    let maggotCorpses = [];

    function spawnMaggot(startX, startY) {
        var dirs = ['right', 'left', 'up', 'down'];
        var dir = dirs[Math.floor(Math.random() * 4)];
        var segs = [{ x: startX, y: startY }];
        for (var si = 1; si < 3; si++) {
            var tail = segs[segs.length - 1];
            if (dir === 'right') segs.push({ x: tail.x - 1, y: tail.y });
            else if (dir === 'left') segs.push({ x: tail.x + 1, y: tail.y });
            else if (dir === 'down') segs.push({ x: tail.x, y: tail.y - 1 });
            else segs.push({ x: tail.x, y: tail.y + 1 });
        }
        return { segments: segs, direction: dir, alive: true };
    }

    function updateMaggots() {
        for (var mi = maggots.length - 1; mi >= 0; mi--) {
            var m = maggots[mi];
            if (!m.alive) continue;
            if (Math.random() < 0.15) {
                var dirs = ['right', 'left', 'up', 'down'];
                var opposite = { right: 'left', left: 'right', up: 'down', down: 'up' };
                var valid = dirs.filter(function(d) { return d !== opposite[m.direction]; });
                m.direction = valid[Math.floor(Math.random() * valid.length)];
            }
            var mhead = { x: m.segments[0].x, y: m.segments[0].y };
            switch (m.direction) {
                case 'right': mhead.x++; break;
                case 'left': mhead.x--; break;
                case 'down': mhead.y++; break;
                case 'up': mhead.y--; break;
            }
            if (mhead.x < 0 || mhead.x >= tileCountX || mhead.y < 0 || mhead.y >= tileCountY) {
                m.direction = opposite[m.direction];
                mhead = { x: m.segments[0].x, y: m.segments[0].y };
                switch (m.direction) { case 'right': mhead.x++; break; case 'left': mhead.x--; break; case 'down': mhead.y++; break; case 'up': mhead.y--; break; }
            }
            var hitSnake = false;
            for (var si2 = 0; si2 < snake.length; si2++) {
                if (snake[si2].x === mhead.x && snake[si2].y === mhead.y) { hitSnake = true; break; }
            }
            if (hitSnake) {
                for (var ci = 0; ci < m.segments.length; ci++) maggotCorpses.push({ x: m.segments[ci].x, y: m.segments[ci].y });
                maggots.splice(mi, 1);
                continue;
            }
            m.segments.unshift(mhead);
            var ate = false;
            for (var fi = foods.length - 1; fi >= 0; fi--) {
                if (foods[fi].x === mhead.x && foods[fi].y === mhead.y && foods[fi].type === 'normal') {
                    foods.splice(fi, 1); ate = true; break;
                }
            }
            if (!ate) m.segments.pop();
            if (m.segments.length > 15) {
                for (var ci2 = 0; ci2 < m.segments.length; ci2++) maggotCorpses.push({ x: m.segments[ci2].x, y: m.segments[ci2].y });
                maggots.splice(mi, 1);
            }
        }
        while (maggotCorpses.length > 200) maggotCorpses.shift();
    }

    function drawMaggots() {
        for (var ci = 0; ci < maggotCorpses.length; ci++) {
            var c = maggotCorpses[ci];
            ctx.fillStyle = '#AA9977';
            ctx.beginPath();
            ctx.arc(c.x * gridSize + gridSize / 2, c.y * gridSize + gridSize / 2, gridSize * 0.22, 0, Math.PI * 2);
            ctx.fill();
        }
        for (var mi = 0; mi < maggots.length; mi++) {
            var m = maggots[mi];
            if (!m.alive) continue;
            for (var si = 0; si < m.segments.length; si++) {
                var sx = m.segments[si].x * gridSize;
                var sy = m.segments[si].y * gridSize;
                if (si === 0) {
                    ctx.fillStyle = '#F0F0E0';
                    ctx.fillRect(sx + 2, sy + 2, gridSize - 4, gridSize - 4);
                    ctx.fillStyle = '#333';
                    ctx.fillRect(sx + gridSize * 0.3, sy + gridSize * 0.25, 3, 3);
                    ctx.fillRect(sx + gridSize * 0.6, sy + gridSize * 0.25, 3, 3);
                } else {
                    var shade = Math.max(180, 240 - si * 5);
                    ctx.fillStyle = 'rgb(' + shade + ',' + shade + ',' + (shade - 20) + ')';
                    ctx.fillRect(sx + 3, sy + 3, gridSize - 6, gridSize - 6);
                }
            }
        }
    }

    function activateGreed() {
        var converted = 0;
        for (var fi = 0; fi < foods.length; fi++) {
            if (foods[fi].type === 'shrink') {
                foods[fi].type = 'normal';
                var idx = Math.floor(Math.random() * CONSTANTS.FOOD_IMAGES.length);
                foods[fi].imageKey = 'FOOD_' + idx;
                foods[fi].imageIndex = idx;
                converted++;
            }
        }
        var spawned = 0;
        for (var attempt = 0; attempt < 30 && spawned < 3; attempt++) {
            var mx = Math.floor(Math.random() * tileCountX);
            var my = Math.floor(Math.random() * tileCountY);
            var conflict = false;
            for (var si = 0; si < snake.length; si++) {
                if (snake[si].x === mx && snake[si].y === my) { conflict = true; break; }
            }
            if (!conflict) { maggots.push(spawnMaggot(mx, my)); spawned++; }
        }
        draw();
        return { ok: true, msg: '🐛 贪婪！毒食已净化×' + converted + '，蛆×' + spawned };
    }

    // ================= 本地管理员决策引擎 =================
    // 纯本地算法，跨对局自成长，实时微调游戏参数
    var LocalAdminEngine = {
        // === 持久化数据 ===
        _profile: {
            totalGames: 0,          // 总对局数
            skillLevel: 3,          // 玩家技能等级 1~10
            avgScore: 0,            // 历史平均分
            avgSurvival: 0,         // 历史平均存活秒数
            recentScores: [],       // 最近10局分数
            preferredCommands: {},  // 玩家偏好命令
            deathCauses: { self: 0, wall: 0, poison: 0 },
            lastAdjustTime: 0       // 上次微调时间戳
        },
        _monitorTimer: null,        // 实时监控定时器
        _scoreSnapshot: 0,          // 上次快照分数
        _snapshotTime: 0,           // 上次快照时间

        // === 持久化加载 ===
        _load: function() {
            try {
                var saved = JSON.parse(localStorage.getItem('snakeAdminProfile') || 'null');
                if (saved) {
                    this._profile.totalGames = saved.totalGames || 0;
                    this._profile.skillLevel = saved.skillLevel || 3;
                    this._profile.avgScore = saved.avgScore || 0;
                    this._profile.avgSurvival = saved.avgSurvival || 0;
                    this._profile.recentScores = saved.recentScores || [];
                    this._profile.preferredCommands = saved.preferredCommands || {};
                    this._profile.deathCauses = saved.deathCauses || { self: 0, wall: 0, poison: 0 };
                }
            } catch(e) {}
        },

        _save: function() {
            try {
                localStorage.setItem('snakeAdminProfile', JSON.stringify(this._profile));
            } catch(e) {}
        },

        // === 每局结束后学习 ===
        analyzeSession: function(finalScore, duration, deathCause) {
            var p = this._profile;
            p.totalGames++;
            p.recentScores.push(finalScore);
            if (p.recentScores.length > 10) p.recentScores.shift();

            // 更新平均分
            var sum = 0;
            for (var i = 0; i < p.recentScores.length; i++) sum += p.recentScores[i];
            p.avgScore = Math.round(sum / p.recentScores.length);
            p.avgSurvival = Math.round((p.avgSurvival * (p.totalGames - 1) + duration) / p.totalGames);

            // 死亡原因统计
            if (deathCause === 'self') p.deathCauses.self++;
            else if (deathCause === 'wall') p.deathCauses.wall++;
            else if (deathCause === 'poison') p.deathCauses.poison++;

            // 技能等级计算
            var scoreComponent = Math.min(10, Math.floor(p.avgScore / 300));
            var survivalComponent = Math.min(10, Math.floor(p.avgSurvival / 30));
            var consistencyBonus = p.totalGames > 10 ? 1 : 0;
            p.skillLevel = Math.max(1, Math.min(10, Math.round((scoreComponent + survivalComponent) / 2) + consistencyBonus));

            this._save();
            console.log('🧠 管理员成长: 技能Lv.' + p.skillLevel + ' | 均分:' + p.avgScore + ' | 总局数:' + p.totalGames);
        },

        // === 实时监控（每5秒微调 + 每30~60秒自动弹出） ===
        startMonitor: function() {
            var self = this;
            this._scoreSnapshot = score;
            this._snapshotTime = Date.now();
            this._lastInteraction = Date.now();
            this._popupCount = 0;
            this._lastLevel = 0;
            this._autoTriggerCountdown = this._getNextInterval();
            this.stopMonitor();
            this._monitorTimer = setInterval(function() {
                if (!gameStarted || gameOver || gamePaused) return;
                self._tick();
            }, 5000);
        },

        stopMonitor: function() {
            if (this._monitorTimer) { clearInterval(this._monitorTimer); this._monitorTimer = null; }
        },

        // 每5秒执行一次微调
        _tick: function() {
            var now = Date.now();
            var elapsed = (now - this._snapshotTime) / 1000;
            if (elapsed < 4) return; // 至少间隔4秒

            var scoreDelta = score - this._scoreSnapshot;
            var scorePerSec = scoreDelta / elapsed;
            this._scoreSnapshot = score;
            this._snapshotTime = now;

            var p = this._profile;
            var adjusted = false;

            // 策略1: 得分速率低 → 悄悄降低难度
            if (scorePerSec < 5 && gameSpeed > 200 && snake.length < 8) {
                var newSpeed = Math.max(150, gameSpeed - 15);
                if (newSpeed !== gameSpeed) {
                    gameSpeed = newSpeed;
                    if (gameLoop) { clearInterval(gameLoop); gameLoop = setInterval(function() { update(); draw(); }, gameSpeed); }
                    adjusted = true;
                }
            }
            // 策略2: 得分速率高 + 高手 → 悄悄提速
            else if (scorePerSec > 30 && p.skillLevel >= 5) {
                var newSpeed2 = Math.min(350, gameSpeed + 10);
                if (newSpeed2 !== gameSpeed) {
                    gameSpeed = newSpeed2;
                    if (gameLoop) { clearInterval(gameLoop); gameLoop = setInterval(function() { update(); draw(); }, gameSpeed); }
                    adjusted = true;
                }
            }

            // 策略3: 高等级玩家 → 微调毒食物概率
            if (p.skillLevel >= 7 && learningParams.shrinkProb < 0.5) {
                learningParams.shrinkProb = Math.min(0.5, learningParams.shrinkProb + 0.02);
                adjusted = true;
            } else if (p.skillLevel <= 2 && learningParams.shrinkProb > 0.2) {
                learningParams.shrinkProb = Math.max(0.1, learningParams.shrinkProb - 0.02);
                adjusted = true;
            }

            // 策略4: 经常撞墙死亡 → 提前给更多食物帮助
            if (p.deathCauses.wall > p.deathCauses.self * 2 && foods.length < 2 && Math.random() < 0.4) {
                generateFood();
                draw();
                adjusted = true;
            }

            if (adjusted) {
                console.log('🔧 管理员微调: 速度=' + gameSpeed + 'ms 毒率=' + Math.round(learningParams.shrinkProb * 100) + '%');
            }

            // === 🎁 主动奖励系统 ===
            var rewarded = false;

            // 奖励1: 食物稀缺时刷新食物
            if (foods.length <= 1 && snake.length >= 4 && Math.random() < 0.5) {
                var addedCount = 0;
                var targetFoods = p.skillLevel >= 5 ? 2 : 1;
                while (foods.length < targetFoods + 1) {
                    generateFood();
                    addedCount++;
                    if (addedCount >= 3) break;
                }
                if (addedCount > 0) {
                    showScoreAnimation(canvas.width / 2.5, canvas.height / 4, '🎁 +食物', '#66EE88');
                }
                draw();
                rewarded = true;
            }

            // 奖励2: 蛇过长 + 低技能 → 悄悄缩短
            if (snake.length >= 18 && p.skillLevel <= 4 && Math.random() < 0.35) {
                var shrinkCount = Math.min(3, snake.length - 4);
                for (var si = 0; si < shrinkCount; si++) snake.pop();
                showScoreAnimation(canvas.width / 2.5, canvas.height / 4, '🎁 蛇身-3', '#FFAA44');
                draw();
                rewarded = true;
            }

            // 奖励3: 新手连死 → 送额外食物 + 降速
            if (p.totalGames >= 3 && p.avgScore < 200 && p.skillLevel <= 2 && Math.random() < 0.3) {
                generateFood();
                generateFood();
                var reliefSpeed = Math.min(500, gameSpeed + 30);
                if (reliefSpeed !== gameSpeed) {
                    gameSpeed = reliefSpeed;
                    if (gameLoop) { clearInterval(gameLoop); gameLoop = setInterval(function() { update(); draw(); }, gameSpeed); }
                }
                showScoreAnimation(canvas.width / 2.5, canvas.height / 4, '🎁 新手援助', '#FFCC00');
                draw();
                rewarded = true;
            }

            // 奖励4: 长期存活玩家 → 偶尔送无敌
            if (elapsedSeconds > 180 && p.skillLevel >= 3 && Math.random() < 0.15) {
                if (!AdminSession.isInvincible()) {
                    if (AdminSession.session) AdminSession.session.invincible = true;
                    showScoreAnimation(canvas.width / 2.5, canvas.height / 4, '🛡️ 短暂无敌!', '#AA88FF');
                    // 15秒后自动关闭
                    setTimeout(function() {
                        if (AdminSession.session) AdminSession.session.invincible = false;
                    }, 15000);
                }
                rewarded = true;
            }

            if (rewarded) {
                console.log('🎁 管理员发放奖励');
            }

            // === 升级检测（每次升级强制弹出） ===
            var currentLevel = getIterationLevel();
            var leveledUp = (currentLevel > this._lastLevel);
            this._lastLevel = currentLevel;

            // === 自动弹出检查（每5秒倒计时-5） ===
            this._autoTriggerCountdown -= 5;
            if ((this._autoTriggerCountdown <= 0 || leveledUp) && !gamePaused) {
                var shouldPopup = leveledUp;
                if (!shouldPopup) {
                    if (scorePerSec < 3 && snake.length > 4) shouldPopup = true;
                    if (scorePerSec > 25 && p.skillLevel >= 4) shouldPopup = true;
                    if (score > 0 && score % 500 < scorePerSec * 5) shouldPopup = true;
                    if (snake.length >= 15) shouldPopup = true;
                }

                if (shouldPopup) {
                    this._popupCount++;
                    var qa = this.generate(score, getIterationLevel(), snake.length, elapsedSeconds,
                        gameSpeed, foods.length, AdminSession.session?.grantedCommands || new Set(), 'auto', this._popupCount);
                    showAdminQuestion(qa);
                    _adminPausedGame = true;
                    gamePaused = true;
                    pauseResumeBtn.textContent = '继续';
                    if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
                }
                // 重置倒计时（随等级缩短，最短10s）
                this._autoTriggerCountdown = this._getNextInterval();
                this._lastInteraction = Date.now();
            }
        },

        // 计算下次弹出间隔（等级越高越短，10~60秒）
        _getNextInterval: function() {
            var lv = getIterationLevel();
            var base = Math.max(10, 50 - lv * 6);
            return base + Math.floor(Math.random() * Math.max(5, 25 - lv * 3));
        },

        // === 记录玩家偏好 ===
        learn: function(chosenAction, gameStateAtChoice) {
            var p = this._profile;
            if (!p.preferredCommands[chosenAction]) p.preferredCommands[chosenAction] = 0;
            p.preferredCommands[chosenAction]++;
            this._save();
        },

        // === 生成问答（支持自动弹出/手动触发，同局递增强度） ===
        generate: function(score, level, snakeLen, elapsed, gameSpeed, foodsCount, grantedCommands, triggerType, popupCount) {
            var cmds = Array.from(grantedCommands || []);
            var p = this._profile;
            var question = '';
            var options = [];
            var candidates = [];
            var isManual = (triggerType === 'manual');
            var tier = Math.min(popupCount || 1, 5); // 弹出次数 → 等级 1~5

            var isEarly = score < 300;
            var isMid = score >= 300 && score < 1500;
            var isLate = score >= 1500;
            var isLongSnake = snakeLen >= 12;
            var isStruggling = score < 100 && elapsed > 60;
            var isPro = score > 2000;

            // === 手动触发时：个性化问候 + 智能问题 ===
            if (isManual) {
                var timeSinceLast = Date.now() - (this._lastInteraction || 0);
                if (timeSinceLast < 30000) {
                    question = '这么快又来了！';
                } else if (p.skillLevel >= 7) {
                    question = '欢迎回来，高手！今天手感如何？';
                } else if (p.totalGames <= 3) {
                    question = '你好！我是你的游戏管理员，需要帮忙吗？';
                } else if (p.skillLevel <= 3) {
                    question = '加油！我在陪你一起进步~';
                } else {
                    question = '嘿！又见面了，要调整什么？';
                }
            } else {
                // 自动弹出问题
                if (isStruggling) {
                    question = p.skillLevel <= 2 ? '别灰心，需要帮忙吗？' : '有点不顺？调整一下？';
                } else if (isEarly && p.skillLevel >= 6) {
                    question = '老玩家了，要加速开局吗？';
                } else if (isEarly) {
                    question = '刚开局，要做些调整吗？';
                } else if (isPro) {
                    question = '太强了！要终极挑战吗？';
                } else if (isMid && p.skillLevel >= 5) {
                    question = '状态不错，加点难度？';
                } else {
                    question = '需要调整一下吗？';
                }
            }
            this._lastInteraction = Date.now();

            // === 选项池（同局递增强度：tier 1~5） ===
            var t = tier; // 简写

            // 种类1: 食物（随等级递增数量）
            if (cmds.indexOf('spawn_food') >= 0) {
                var foodCount = Math.min(t + 1, 5);
                var foodSuffix = t >= 4 ? '传奇' : (t >= 3 ? '豪华' : (t >= 2 ? '加强' : ''));
                if (isStruggling) {
                    candidates.push({ label: '🎪 ' + (t >= 3 ? '饕餮' : '食物') + '盛宴' + (t >= 4 ? ' MAX' : ''), action: 'spawn_food', params: { type: 'normal', count: String(foodCount + 1) }, desc: '一口气刷新' + (foodCount + 1) + '个食物，吃饱继续冲', priority: 95 });
                } else if (foodsCount <= 1) {
                    candidates.push({ label: '🍞 空投补给 ' + (t >= 2 ? foodSuffix : ''), action: 'spawn_food', params: { type: 'normal', count: String(foodCount) }, desc: '屏幕食物太少？立刻投送' + foodCount + '个', priority: 80 });
                } else if (isEarly) {
                    candidates.push({ label: '🌱 开局福利 ' + (t >= 2 ? foodSuffix : ''), action: 'spawn_food', params: { type: 'normal', count: String(foodCount) }, desc: '起跑线上多' + foodCount + '份食物', priority: 72 });
                } else {
                    candidates.push({ label: '🍎 ' + (t >= 2 ? '超级' : '') + '精准投喂 ' + (t >= 3 ? foodSuffix : ''), action: 'spawn_food', params: { type: 'normal', count: String(foodCount) }, desc: '刷新' + foodCount + '个食物', priority: 45 });
                }
            }

            // 种类2: 蛇身管理（随等级递增节数）
            var shrinkAmt = Math.min(2 + t, 8);
            var growAmt = Math.min(2 + Math.floor(t / 2), 6);
            if (isLongSnake && cmds.indexOf('shrink_snake') >= 0) {
                var shearNames = ['🐑 松动羊毛剪', '🐑 精钢羊毛剪', '✂️ 等离子剪', '⚔️ 虚空斩', '💀 维度切割'];
                candidates.push({ label: shearNames[Math.min(t - 1, 4)], action: 'shrink_snake', params: { segments: String(shrinkAmt) }, desc: '剪短' + shrinkAmt + '节蛇身，轻装上阵，不扣分', priority: 72 });
            }
            if (!isStruggling && !isLongSnake && cmds.indexOf('grow_snake') >= 0) {
                var growNames = ['📏 激素催长', '📏 超级催长素', '🧬 基因强化', '🧬 超进化', '🧬 觉醒之力'];
                candidates.push({ label: growNames[Math.min(t - 1, 4)], action: 'grow_snake', params: { segments: String(growAmt) }, desc: '蛇身立刻变长' + growAmt + '节', priority: 50 });
            }

            // 种类3: 速度调控（随等级加大幅度）
            var speedBoost = Math.min(40 + t * 15, 100);
            var speedRelief = Math.min(80 + t * 20, 200);
            if (cmds.indexOf('set_speed') >= 0) {
                if (isStruggling) {
                    candidates.push({ label: '🐢 慢镜头模式 ' + (t >= 3 ? 'Pro' : ''), action: 'set_speed', params: { speed: String(Math.min(550, gameSpeed + speedRelief)) }, desc: '大幅降低速度+' + speedRelief + 'ms，给你喘息空间', priority: 85 });
                } else if (isPro && p.skillLevel >= 6) {
                    var hellNames = ['⚡ 地狱疾风', '⚡ 深渊疾风', '🔥 炼狱模式', '🔥 末日审判', '💀 神速领域'];
                    candidates.push({ label: hellNames[Math.min(t - 1, 4)], action: 'set_speed', params: { speed: String(Math.max(70, 100 - t * 5)) }, desc: '速度' + (100 - t * 5) + 'ms！真正的高手试炼', priority: 95 });
                } else if (!isStruggling && gameSpeed > 150) {
                    candidates.push({ label: '💨 疾风步 ' + (t >= 2 ? 'Lv.' + t : ''), action: 'set_speed', params: { speed: String(Math.max(90, gameSpeed - speedBoost)) }, desc: '加速' + speedBoost + 'ms，考验反应力', priority: 60 });
                } else if (gameSpeed > 250) {
                    candidates.push({ label: '⏪ 慢放卷轴 ' + (t >= 2 ? '+' + t : ''), action: 'set_speed', params: { speed: String(gameSpeed - 50 - t * 10) }, desc: '时间慢下来，从容操作', priority: 55 });
                }
            }

            // 种类4: 保护类
            if (!isStruggling && cmds.indexOf('toggle_invincible') >= 0) {
                var shieldNames = ['🛡️ 金钟罩', '🛡️ 金刚不坏', '🔮 圣盾术', '🔮 绝对防御', '👑 不朽之盾'];
                candidates.push({ label: shieldNames[Math.min(t - 1, 4)], action: 'toggle_invincible', params: {}, desc: '短暂无敌，撞墙穿墙，' + (10 + t * 3) + '秒后消失', priority: 38 });
            }

            // 种类5: 查询
            if (cmds.indexOf('get_stats') >= 0) {
                candidates.push({ label: '📋 战场情报' + (t >= 3 ? ' 深度扫描' : ''), action: 'get_stats', params: {}, desc: '查看速度、等级、毒率等详细数据', priority: 50 });
            }

            // 种类6: 广播
            if (cmds.indexOf('broadcast') >= 0 && Math.random() < 0.3) {
                var quotes = ['加油！你是最胖的蛇！', '稳住，我们能赢！', '前方高能预警~', '蛇蛇勇敢冲！', '管理员已上线！'];
                candidates.push({ label: '📢 管理员喊话', action: 'broadcast', params: { message: quotes[Math.floor(Math.random() * quotes.length)] }, desc: '在屏幕上显示一条消息', priority: 30 });
            }

            // 种类7: 贪婪（场上毒食物≥2时出现）
            var toxicCount = 0;
            for (var fi = 0; fi < foods.length; fi++) { if (foods[fi].type === 'shrink') toxicCount++; }
            if (toxicCount >= 2) {
                var greedNames = ['🐛 贪婪', '🐛 贪欲之壶', '🐛 暴食之门'];
                candidates.push({ label: greedNames[Math.min(t - 1, 2)], action: 'greed', params: {}, desc: '毒食全转普通，但召唤3条蛆！蛆会抢吃食物', priority: 20 + t * 14 });
            }

            // 辅助
            function isFastSpeed() { return gameSpeed <= 150; }

            // 分离特殊选项和常规选项
            var specials = [];
            var regulars = [];
            for (var ci = 0; ci < candidates.length; ci++) {
                if (candidates[ci].action === 'greed') specials.push(candidates[ci]);
                else regulars.push(candidates[ci]);
            }
            // 排序
            var self = this;
            regulars.sort(function(a, b) {
                var prefA = p.preferredCommands[a.action] || 0;
                var prefB = p.preferredCommands[b.action] || 0;
                var wa = (a.priority || 50) + prefA * 3;
                var wb = (b.priority || 50) + prefB * 3;
                return wb - wa;
            });
            specials.sort(function(a, b) { return (b.priority || 50) - (a.priority || 50); });

            // 选取：1个特殊 + 2个常规 + skip
            for (var i = 0; i < Math.min(specials.length, 1); i++) {
                var c = specials[i];
                options.push({ label: c.label, action: c.action, params: c.params, description: c.desc });
            }
            for (var i = 0; i < Math.min(regulars.length, 3 - options.length); i++) {
                var c2 = regulars[i];
                options.push({ label: c2.label, action: c2.action, params: c2.params, description: c2.desc });
            }
            // 补充到3个
            while (options.length < 3 && regulars.length > options.length - (specials.length > 0 ? 1 : 0)) {
                var extra = regulars[options.length - (specials.length > 0 ? 1 : 0)];
                if (extra && !options.some(function(o) { return o.action === extra.action; })) {
                    options.push({ label: extra.label, action: extra.action, params: extra.params, description: extra.desc });
                } else break;
            }

            // 始终加跳过选项
            options.push({ label: '👋 不用了', action: 'skip', params: {}, description: '继续游戏' });

            return { question: question, options: options };
        }
    };

    // 初始化时加载管理员画像
    LocalAdminEngine._load();

    // ================= 管理员 AI 会话系统 =================
    const AdminSession = {
        session: null,
        // 本次对局默认授权命令（可在游戏开始前修改）
        defaultGrants: ['spawn_food', 'set_speed', 'grow_snake', 'get_stats', 'broadcast'],

        /**
         * 激活管理员会话（游戏开始时调用）
         * @param {string[]} grantedCommands - 授权命令列表
         * @param {object} options - { maxModifications, requireConfirm }
         */
        start(grantedCommands, options = {}) {
            if (this.session?.isActive) {
                console.warn('管理员会话已在运行中');
                return;
            }
            const cmds = grantedCommands || this.defaultGrants;
            this.session = {
                id: Date.now().toString(36),
                grantedCommands: new Set(cmds),
                maxMods: options.maxModifications || 20,
                requireConfirm: options.requireConfirm || false,
                isActive: true,
                startedAt: Date.now(),
                snapshot: this._takeSnapshot(),
                modifications: [],
                invincible: false  // 无敌模式标记
            };
            console.log(`🔑 管理员会话已激活 | 授权: [${[...this.session.grantedCommands].join(', ')}] | 最大修改: ${this.session.maxMods}`);
            this._updateTriggerButton();
        },

        /**
         * 结束管理员会话 → 全部复原（游戏结束时调用）
         */
        end() {
            if (!this.session?.isActive) return;
            console.log(`🔒 管理员会话结束，复原 ${this.session.modifications.length} 项修改...`);

            // 关闭无敌模式
            if (this.session.invincible) {
                this.session.invincible = false;
            }

            // 逆序复原（后改的先复原）
            let restored = 0;
            for (let i = this.session.modifications.length - 1; i >= 0; i--) {
                const mod = this.session.modifications[i];
                if (this._restoreProperty(mod.property, mod.oldValue)) {
                    restored++;
                }
            }

            console.log(`✅ 已复原 ${restored}/${this.session.modifications.length} 项，管理员权限已回收`);
            this.session = null;
            this._updateTriggerButton();
            this._hideModal();
        },

        /** 检查命令是否被授权 */
        isCommandGranted(cmd) {
            return this.session?.isActive && this.session.grantedCommands.has(cmd);
        },

        /** 检查无敌模式 */
        isInvincible() {
            return this.session?.isActive && this.session.invincible === true;
        },

        /** 记录修改（用于复原） */
        recordModification(property, oldValue) {
            if (!this.session?.isActive) return false;
            if (this.session.modifications.length >= this.session.maxMods) {
                console.warn('已达单局最大修改次数限制');
                return false;
            }
            // 避免重复记录同一属性（只保留第一次的快照）
            if (!this.session.modifications.some(m => m.property === property)) {
                this.session.modifications.push({
                    property: property,
                    oldValue: oldValue,
                    time: Date.now()
                });
            }
            return true;
        },

        // ========== 快照 ==========
        _takeSnapshot() {
            return {
                learningParams: JSON.parse(JSON.stringify(learningParams)),
                gameSpeed: gameSpeed,
                snakeLength: snake.length,
                foodsCount: foods.length,
                iterationLevel: iterationLevel,
                elapsedSeconds: elapsedSeconds
            };
        },

        // ========== 复原 ==========
        _restoreProperty(property, oldValue) {
            try {
                switch (property) {
                    case 'learningParams':
                        Object.assign(learningParams, oldValue);
                        saveLearningParams();
                        break;
                    case 'gameSpeed':
                        gameSpeed = oldValue;
                        // 仅当游戏正在运行且未结束时才重建循环
                        if (gameLoop && gameStarted && !gameOver) {
                            clearInterval(gameLoop);
                            gameLoop = setInterval(() => { update(); draw(); }, gameSpeed);
                        }
                        break;
                    case 'snakeLength':
                        while (snake.length > oldValue) snake.pop();
                        break;
                    case 'foodsCount':
                        while (foods.length > oldValue) foods.pop();
                        break;
                    case 'iterationLevel':
                        iterationLevel = oldValue;
                        break;
                    default:
                        return false;
                }
                return true;
            } catch (e) {
                console.error(`复原属性 ${property} 失败:`, e);
                return false;
            }
        },

        // ========== UI ==========
        _updateTriggerButton() {
            const btn = document.getElementById('adminTriggerBtn');
            if (!btn) return;
            if (this.session?.isActive) {
                btn.style.display = 'flex';
                btn.style.opacity = '1';
            } else {
                btn.style.display = 'none';
            }
        },

        _hideModal() {
            const modal = document.getElementById('adminModal');
            if (modal) modal.style.display = 'none';
        }
    };

    // ========== 管理员命令执行器 ==========
    const AdminCommands = {
        /** 生成食物 */
        spawn_food(params) {
            if (!AdminSession.isCommandGranted('spawn_food')) return { ok: false, msg: '⛔ 未授权 spawn_food' };
            AdminSession.recordModification('foodsCount', foods.length);

            const type = params.type || 'normal';
            const count = Math.min(params.count || 1, 5);
            for (let i = 0; i < count; i++) {
                const newFood = {
                    x: Math.floor(Math.random() * tileCountX),
                    y: Math.floor(Math.random() * tileCountY),
                    type: type
                };
                if (type === 'normal') {
                    const idx = Math.floor(Math.random() * CONSTANTS.FOOD_IMAGES.length);
                    newFood.imageKey = `FOOD_${idx}`;
                    newFood.imageIndex = idx;
                }
                // 避开蛇身和已有食物
                let attempts = 0;
                while (attempts < 50) {
                    const overlapSnake = snake.some(s => s.x === newFood.x && s.y === newFood.y);
                    const overlapFood = foods.some(f => f.x === newFood.x && f.y === newFood.y);
                    if (!overlapSnake && !overlapFood) break;
                    newFood.x = Math.floor(Math.random() * tileCountX);
                    newFood.y = Math.floor(Math.random() * tileCountY);
                    attempts++;
                }
                foods.push(newFood);
            }
            draw();
            return { ok: true, msg: `🍎 已生成 ${count} 个${type === 'shrink' ? '有毒' : ''}食物` };
        },

        /** 调整游戏速度 */
        set_speed(params) {
            if (!AdminSession.isCommandGranted('set_speed')) return { ok: false, msg: '⛔ 未授权 set_speed' };
            AdminSession.recordModification('gameSpeed', gameSpeed);

            gameSpeed = Math.max(80, Math.min(800, params.speed || CONSTANTS.GAME_SPEED));
            if (gameLoop) {
                clearInterval(gameLoop);
                gameLoop = setInterval(() => { update(); draw(); }, gameSpeed);
            }
            return { ok: true, msg: `⚡ 游戏速度已调整为 ${gameSpeed}ms/步` };
        },

        /** 增长蛇身 */
        grow_snake(params) {
            if (!AdminSession.isCommandGranted('grow_snake')) return { ok: false, msg: '⛔ 未授权 grow_snake' };
            AdminSession.recordModification('snakeLength', snake.length);

            const segments = Math.min(params.segments || 1, 10);
            const tail = snake[snake.length - 1];
            for (let i = 0; i < segments; i++) {
                snake.push({ x: tail.x, y: tail.y });
            }
            draw();
            return { ok: true, msg: `📏 蛇身 +${segments} 节（当前 ${snake.length} 节）` };
        },

        /** 缩短蛇身 */
        shrink_snake(params) {
            if (!AdminSession.isCommandGranted('shrink_snake')) return { ok: false, msg: '⛔ 未授权 shrink_snake' };
            AdminSession.recordModification('snakeLength', snake.length);

            const segments = Math.min(params.segments || 1, snake.length - 2);
            for (let i = 0; i < segments; i++) snake.pop();
            draw();
            return { ok: true, msg: `✂️ 蛇身 -${segments} 节（当前 ${snake.length} 节）` };
        },

        /** 切换无敌模式 */
        toggle_invincible(params) {
            if (!AdminSession.isCommandGranted('toggle_invincible')) return { ok: false, msg: '⛔ 未授权 toggle_invincible' };
            if (!AdminSession.session) return { ok: false, msg: '会话未激活' };

            AdminSession.session.invincible = !AdminSession.session.invincible;
            const status = AdminSession.session.invincible ? '🛡️ 无敌模式已开启' : '🛡️ 无敌模式已关闭';
            return { ok: true, msg: status };
        },

        /** 查询统计 */
        get_stats(params) {
            if (!AdminSession.isCommandGranted('get_stats')) return { ok: false, msg: '⛔ 未授权 get_stats' };
            const lv = getIterationLevel();
            const info = [
                `📊 分数: ${score}`,
                `📈 等级: Lv.${lv}`,
                `🐍 蛇长: ${snake.length} 节`,
                `⏱️ 时间: ${elapsedSeconds}s`,
                `⚡ 速度: ${gameSpeed}ms`,
                `🍽️ 食物: ${foods.length} 个`,
                `🧠 AI分阶: ${learningParams.scoreStep}`,
                `☠️ 毒概率: ${Math.round(learningParams.shrinkProb * 100)}%`
            ];
            if (AdminSession.session?.invincible) info.push('🛡️ 无敌: 开启');
            return { ok: true, msg: info.join('\n') };
        },

        /** 广播消息 */
        broadcast(params) {
            if (!AdminSession.isCommandGranted('broadcast')) return { ok: false, msg: '⛔ 未授权 broadcast' };
            const msg = params.message || '管理员发来了一条消息';
            showScoreAnimation(
                canvas.width / (2 * (window.devicePixelRatio || 1)),
                canvas.height / (3 * (window.devicePixelRatio || 1)),
                msg, '#66AAEE'
            );
            return { ok: true, msg: '📢 消息已广播' };
        },

        /** 贪婪：毒食转普通 + 召唤蛆 */
        greed(params) {
            return activateGreed();
        }
    };

    // ========== AI 问答交互 ==========
    let _adminPausedGame = false;  // 标记是否由管理员触发的暂停

    /** 玩家点击管理员按钮 → 暂停游戏 → 请求 AI */
    function requestAdminQA() {
        if (!AdminSession.session?.isActive) {
            console.warn('管理员会话未激活');
            return;
        }
        // 记录暂停前状态，仅当游戏正在运行时才由管理员暂停
        _adminPausedGame = (gameStarted && !gameOver && !gamePaused);
        if (_adminPausedGame) {
            gamePaused = true;
            pauseResumeBtn.textContent = '继续';
            if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
        }

        // 保存当前状态供学习使用
        window.__lastAdminState__ = {
            score: score,
            snakeLength: snake.length,
            elapsedSeconds: elapsedSeconds
        };

        // 显示加载状态
        const modal = document.getElementById('adminModal');
        const loadingEl = document.getElementById('adminLoading');
        const questionBox = document.getElementById('adminQuestionBox');
        if (modal) modal.style.display = 'flex';
        if (loadingEl) loadingEl.style.display = 'block';
        if (questionBox) questionBox.style.display = 'none';

        // 更新授权显示
        const grantsEl = document.getElementById('adminGrants');
        if (grantsEl && AdminSession.session) {
            grantsEl.textContent = '🔑 ' + [...AdminSession.session.grantedCommands].slice(0, 3).join(', ');
        }

        // ★ 本地引擎即时生成问答（手动触发带问候，同局递增强度）
        LocalAdminEngine._popupCount++;
        var localResult = LocalAdminEngine.generate(
            score, getIterationLevel(), snake.length, elapsedSeconds,
            gameSpeed, foods.length, AdminSession.session.grantedCommands, 'manual', LocalAdminEngine._popupCount
        );
        showAdminQuestion(localResult);

        // 可选：后台请求 DeepSeek 增强（不阻塞）
        // DeepSeek 已禁用，全部使用本地算法
        /*
        if (window.JSBridge && typeof window.JSBridge.callDeepSeek === 'function') {
            var request = {
                userMessage: '请根据当前游戏状态给出建议',
                gameContext: {
                    score: score,
                    level: getIterationLevel(),
                    snakeLength: snake.length,
                    elapsedSeconds: elapsedSeconds,
                    learningParams: learningParams,
                    foodsCount: foods.length,
                    gameSpeed: gameSpeed
                },
                grantedCommands: [...AdminSession.session.grantedCommands],
                sessionId: AdminSession.session.id
            };
            // 延迟发送，不阻塞本地体验
            setTimeout(function() {
                window.JSBridge.callDeepSeek(JSON.stringify(request));
            }, 100);
        }
        */
    }

    /*
        window.__admin__ = {
        onAIResponse: function(aiResult) {
            var modal = document.getElementById('adminModal');
            if (modal && modal.style.display === 'flex') {
                console.log('📩 DeepSeek增强回复已就绪，更新选项');
                showAdminQuestion(aiResult);
            }
        }
        };
        */

    /** 构建降级问答（AI 不可用时） */
    function buildFallbackQuestion() {
        const cmds = AdminSession.session?.grantedCommands || new Set();
        const options = [];
        if (cmds.has('spawn_food')) {
            options.push({ label: '🍎 生成一个食物', action: 'spawn_food', params: { type: 'normal', count: 1 }, description: '在随机位置生成普通食物' });
        }
        if (cmds.has('grow_snake')) {
            options.push({ label: '📏 蛇身 +2 节', action: 'grow_snake', params: { segments: 2 }, description: '让蛇变长 2 节' });
        }
        if (cmds.has('get_stats')) {
            options.push({ label: '📊 查看状态', action: 'get_stats', params: {}, description: '查看当前游戏统计' });
        }
        options.push({ label: '👋 继续游戏', action: 'skip', params: {}, description: '不执行任何操作' });
        return {
            question: '（离线模式）要做什么调整？',
            options: options
        };
    }

    /** 显示管理员问答弹窗 */
    function showAdminQuestion(aiResult) {
        const loadingEl = document.getElementById('adminLoading');
        const questionBox = document.getElementById('adminQuestionBox');
        const questionEl = document.getElementById('adminQuestion');
        const optionsEl = document.getElementById('adminOptions');

        if (loadingEl) loadingEl.style.display = 'none';
        if (questionBox) questionBox.style.display = 'block';
        if (questionEl) {
            questionEl.textContent = aiResult.question || '需要调整吗？';
            var colors = ['#FF4444', '#FF8800', '#FFCC00', '#FF6644', '#EE5500'];
            questionEl.style.color = colors[Math.floor(Math.random() * colors.length)];
        }
        if (optionsEl) {
            optionsEl.innerHTML = '';
            (aiResult.options || []).forEach(function(opt) {
                var card = document.createElement('div');
                card.className = 'admin-option-card' + (opt.action === 'skip' ? ' skip-card' : '');
                var parts = (opt.label || '').split(' ');
                var icon = parts[0] || '';
                var name = parts.slice(1).join(' ') || opt.label;
                if (opt.action === 'skip') { icon = '👋'; name = '继续游戏'; }
                card.innerHTML = '<div class="card-icon">' + icon + '</div>' +
                    '<div class="card-body">' +
                    '<div class="card-name">' + name + '</div>' +
                    '<div class="card-desc">' + (opt.description || '') + '</div>' +
                    '</div>';
                card.addEventListener('click', function() { onPlayerSelectOption(opt); });
                optionsEl.appendChild(card);
            });
        }

        const modal = document.getElementById('adminModal');
        if (modal) modal.style.display = 'flex';
    }

    /** 玩家选择了某个选项 */
    function onPlayerSelectOption(option) {
        console.log('👆 玩家选择: ' + option.label + ' → ' + option.action);

        // ★ 自学习：记录玩家选择（skip 不记）
        var state = window.__lastAdminState__ || { score: score, snakeLength: snake.length, elapsedSeconds: elapsedSeconds };
        if (option.action !== 'skip') {
            LocalAdminEngine.learn(option.action, state);
        }

        // 隐藏弹窗
        AdminSession._hideModal();

        // skip 直接恢复游戏
        if (option.action === 'skip') {
            resumeAfterAdmin();
            return;
        }

        // 执行命令
        const executor = AdminCommands[option.action];
        if (typeof executor === 'function') {
            try {
                const result = executor(option.params || {});
                if (result.ok) {
                    // 显示执行结果
                    showScoreAnimation(
                        canvas.width / (2 * (window.devicePixelRatio || 1)),
                        canvas.height / (2 * (window.devicePixelRatio || 1)),
                        result.msg, '#66AAEE'
                    );
                } else {
                    console.warn('命令执行被拒绝:', result.msg);
                }
            } catch (e) {
                console.error('命令执行异常:', e);
            }
        }

        // 恢复游戏
        resumeAfterAdmin();
    }

    /** 管理员问答结束后恢复游戏（仅恢复由管理员暂停的游戏） */
    function resumeAfterAdmin() {
        if (_adminPausedGame && gameStarted && !gameOver && gamePaused) {
            gamePaused = false;
            pauseResumeBtn.textContent = '暂停';
            gameSpeed = CONSTANTS.GAME_SPEED;
            gameLoop = setInterval(() => { update(); draw(); }, gameSpeed);
        }
        _adminPausedGame = false;
    }

    // 在游戏开始后激活管理员会话并显示按钮
    function activateAdminOnGameStart() {
        if (!AdminSession.session?.isActive) {
            AdminSession.start();
        }
        var tb = document.getElementById('transferBtn');
        if (tb) tb.style.display = 'flex';
    }

    // ================= JSBridge 相关功能 =================
    
    // 调整蛇的位置以确保安全
    function adjustSnakePositionForSafety(entryBoundary) {
        console.log('调整蛇的位置以确保安全，入口边界:', entryBoundary);
        
        // 根据入口边界调整蛇头和身体的位置，确保有安全的移动空间
        switch (entryBoundary) {
            case 'right': // 从右边界进入，向左移动
                // 确保蛇头不在最右边界，至少留一格空间
                if (snake[0].x >= tileCountX - 1) {
                    const safeX = Math.max(1, tileCountX - 2);
                    for (let i = 0; i < snake.length; i++) {
                        snake[i].x = safeX - i;
                        // 确保不会超出左边界
                        if (snake[i].x < 0) {
                            snake[i].x = 0;
                        }
                    }
                    console.log(`调整右边界进入位置，蛇头位置: (${snake[0].x}, ${snake[0].y})`);
                }
                direction = 'left';
                nextDirection = 'left';
                break;
                
            case 'left': // 从左边界进入，向右移动
                // 确保蛇头不在最左边界，至少留一格空间
                if (snake[0].x <= 0) {
                    const safeX = Math.min(tileCountX - 2, 1);
                    for (let i = 0; i < snake.length; i++) {
                        snake[i].x = safeX + i;
                        // 确保不会超出右边界
                        if (snake[i].x >= tileCountX) {
                            snake[i].x = tileCountX - 1;
                        }
                    }
                    console.log(`调整左边界进入位置，蛇头位置: (${snake[0].x}, ${snake[0].y})`);
                }
                direction = 'right';
                nextDirection = 'right';
                break;
                
            case 'bottom': // 从底部边界进入，向上移动
                // 确保蛇头不在最底边界，至少留一格空间
                if (snake[0].y >= tileCountY - 1) {
                    const safeY = Math.max(1, tileCountY - 2);
                    for (let i = 0; i < snake.length; i++) {
                        snake[i].y = safeY - i;
                        // 确保不会超出上边界
                        if (snake[i].y < 0) {
                            snake[i].y = 0;
                        }
                    }
                    console.log(`调整底边界进入位置，蛇头位置: (${snake[0].x}, ${snake[0].y})`);
                }
                direction = 'up';
                nextDirection = 'up';
                break;
                
            case 'top': // 从顶部边界进入，向下移动
                // 确保蛇头不在最顶边界，至少留一格空间
                if (snake[0].y <= 0) {
                    const safeY = Math.min(tileCountY - 2, 1);
                    for (let i = 0; i < snake.length; i++) {
                        snake[i].y = safeY + i;
                        // 确保不会超出下边界
                        if (snake[i].y >= tileCountY) {
                            snake[i].y = tileCountY - 1;
                        }
                    }
                    console.log(`调整顶边界进入位置，蛇头位置: (${snake[0].x}, ${snake[0].y})`);
                }
                direction = 'down';
                nextDirection = 'down';
                break;
        }
        
        // 调整完成后立即重绘
        draw();
        console.log('位置调整完成，最终蛇头位置:', snake[0], '方向:', direction);
    }
    
    // 创建加载动画元素
    function createLoadingAnimation() {
        // 创建加载覆盖层
        const overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.5s ease';
        
        // 创建内容容器
        const container = document.createElement('div');
        container.style.backgroundColor = 'rgba(40, 40, 40, 0.85)';
        container.style.borderRadius = '12px';
        container.style.padding = '30px';
        container.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.style.transform = 'scale(0.9)';
        container.style.transition = 'transform 0.5s ease';
        
        // 创建加载动画
        const spinnerContainer = document.createElement('div');
        spinnerContainer.style.position = 'relative';
        spinnerContainer.style.width = '80px';
        spinnerContainer.style.height = '80px';
        spinnerContainer.style.marginBottom = '20px';
        
        // 创建旋转元素
        const spinner = document.createElement('div');
        spinner.style.position = 'absolute';
        spinner.style.top = '0';
        spinner.style.left = '0';
        spinner.style.width = '100%';
        spinner.style.height = '100%';
        spinner.style.border = '4px solid rgba(255, 255, 255, 0.3)';
        spinner.style.borderRadius = '50%';
        spinner.style.borderTopColor = '#4CAF50';
        spinner.style.animation = 'spin 1s linear infinite';
        spinnerContainer.appendChild(spinner);
        
        // 使用蛇头图片
        const snakeHead = document.createElement('img');
        snakeHead.style.position = 'absolute';
        snakeHead.style.top = '50%';
        snakeHead.style.left = '50%';
        snakeHead.style.transform = 'translate(-50%, -50%)';
        snakeHead.style.width = '40px';
        snakeHead.style.height = '40px';
        snakeHead.style.animation = 'pulse 1.5s ease-in-out infinite';
        snakeHead.src = CONSTANTS.SNAKE_IMAGES.HEAD;
        spinnerContainer.appendChild(snakeHead);
        
        // 创建消息元素
        const message = document.createElement('div');
        message.id = 'loadingMessage';
        message.style.color = 'white';
        message.style.fontSize = '18px';
        message.style.fontWeight = 'bold';
        message.style.marginTop = '15px';
        message.style.textAlign = 'center';
        message.textContent = '正在恢复游戏状态...';
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes pulse {
                0% { transform: translate(-50%, -50%) scale(0.8); }
                50% { transform: translate(-50%, -50%) scale(1.2); }
                100% { transform: translate(-50%, -50%) scale(0.8); }
            }
        `;
        document.head.appendChild(style);
        
        // 组装元素
        container.appendChild(spinnerContainer);
        container.appendChild(message);
        overlay.appendChild(container);
        
        return {
            overlay,
            container,
            message
        };
    }
    
    // 添加时间戳跟踪，防止重复处理相同数据
    let lastProcessedTimestamp = 0;
    
    // 添加渐进式渲染状态管理
    let progressiveRenderState = {
        isActive: false,
        visibleSegments: 0,
        totalSegments: 0,
        renderTimer: null,
        renderDelay: 100 // 每个段的渲染延迟（毫秒）- 调整为更快的渲染
    };
    
    // 添加边界穿梭状态标记，用于渐进式渲染流程管理
    let isBoundaryTraversal = false;
    
    // 从原生层接收游戏数据初始化方法
    window.initGameDataFromNative = function(gameData) {
        console.log('从原生层接收到游戏数据:', gameData);
        
        if (!gameData) {
            console.error('接收到的游戏数据为空');
            return false;
        }
        
        try {
            // 如果传入的是字符串，尝试解析为JSON对象
            if (typeof gameData === 'string') {
                gameData = JSON.parse(gameData);
            }
            
            // 检查是否为重复数据（通过时间戳）
            if (gameData.receivedAt && gameData.receivedAt <= lastProcessedTimestamp) {
                console.log(`跳过重复的游戏数据，时间戳: ${gameData.receivedAt}，上次处理: ${lastProcessedTimestamp}`);
                return false;
            }
            
            // 更新最后处理的时间戳
            if (gameData.receivedAt) {
                lastProcessedTimestamp = gameData.receivedAt;
                console.log(`更新最后处理时间戳为: ${lastProcessedTimestamp}`);
            }
            
            // 验证必要的游戏数据
            if (!gameData.snake || !Array.isArray(gameData.snake) || gameData.snake.length === 0) {
                console.error('无效的蛇数据');
                return false;
            }
            
            // 食物数组校验：支持单食物和多食物
            const foodData = gameData.food;
            if (!foodData || (Array.isArray(foodData) ? foodData.length === 0 : typeof foodData.x !== 'number')) {
                console.error('无效的食物数据');
                return false;
            }
            
            // 边界穿梭时不显示加载动画，保持游戏无缝体验
            
            // 停止当前游戏循环，防止状态冲突
            if (gameLoop) {
                clearInterval(gameLoop);
                gameLoop = null;
                console.log('停止当前游戏循环');
            }
            
            // 清除倒计时（如果存在）
            if (countdownTimer) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                console.log('清除倒计时');
            }
            
            // 清除之前的渐进式渲染
            if (progressiveRenderState.renderTimer) {
                clearInterval(progressiveRenderState.renderTimer);
                progressiveRenderState.renderTimer = null;
            }
            progressiveRenderState.isActive = false;
            
            // 强制重置游戏结束处理标志，确保能正常继续游戏
            isGameOverHandled = false;
            console.log('重置游戏结束处理标志');
            
            // 重置游戏状态（但不重置分数）
            const currentScore = score; // 保存当前分数
            resetGame();
            score = currentScore; // 恢复分数
            
            // 保存完整的蛇身数据
            const fullSnake = gameData.snake.slice();
            
            // 应用接收到的游戏数据
            foods = Array.isArray(gameData.food) ? gameData.food.map(f => ({...f})) : 
                    (gameData.food ? [{...gameData.food}] : []);
            direction = gameData.direction || 'right';
            nextDirection = direction;
            score = gameData.score || 0;
            gameSpeed = gameData.speed || CONSTANTS.GAME_SPEED;
            
            // 确保游戏状态正确设置
            gameOver = false; // 强制设置为未结束状态
            gameStarted = false; // 初始状态为未开始，等待自动启动
            gamePaused = gameData.gamePaused !== false; // 默认为暂停状态
            
            // 检查是否有边界穿梭信息，如果有则使用渐进式渲染
            if (gameData.entryBoundary) {
                console.log(`检测到边界穿梭，从${gameData.entryBoundary}边界进入，启动渐进式渲染`);
                
                // 设置边界穿梭标记
                isBoundaryTraversal = true;
                
                // 启动渐进式渲染
                progressiveRenderState.isActive = true;
                progressiveRenderState.visibleSegments = 1; // 开始时只显示蛇头
                progressiveRenderState.totalSegments = fullSnake.length;
                
                // 保持完整的蛇身数据，但渐进式显示
                snake = fullSnake.slice(); // 保持完整的蛇身结构
                
                // 根据入口边界调整整条蛇的位置 - 蛇头在前进方向最前端，身体在后方
                switch (gameData.entryBoundary) {
                    case 'right': // 从右边界进入，向左移动
                        // 蛇头在右边界准备向左移动，身体在蛇头右侧（移动方向的后方）
                        for (let i = 0; i < snake.length; i++) {
                            snake[i].x = tileCountX - 1 + i; // 蛇头在边界，身体延伸到边界外（会在渐进渲染时显示）
                        }
                        direction = 'left';
                        nextDirection = 'left';
                        break;
                    case 'left': // 从左边界进入，向右移动  
                        // 蛇头在左边界准备向右移动，身体在蛇头左侧（移动方向的后方）
                        for (let i = 0; i < snake.length; i++) {
                            snake[i].x = 0 - i; // 蛇头在边界，身体延伸到边界外（会在渐进渲染时显示）
                        }
                        direction = 'right';
                        nextDirection = 'right';
                        break;
                    case 'bottom': // 从底部边界进入，向上移动
                        // 蛇头在底边界准备向上移动，身体在蛇头下侧（移动方向的后方）
                        for (let i = 0; i < snake.length; i++) {
                            snake[i].y = tileCountY - 1 + i; // 蛇头在边界，身体延伸到边界外（会在渐进渲染时显示）
                        }
                        direction = 'up';
                        nextDirection = 'up';
                        break;
                    case 'top': // 从顶部边界进入，向下移动
                        // 蛇头在顶边界准备向下移动，身体在蛇头上侧（移动方向的后方）
                        for (let i = 0; i < snake.length; i++) {
                            snake[i].y = 0 - i; // 蛇头在边界，身体延伸到边界外（会在渐进渲染时显示）
                        }
                        direction = 'down';
                        nextDirection = 'down';
                        break;
                }
                
                console.log(`渐进式渲染开始，完整蛇身长度: ${snake.length}，蛇头位置: (${snake[0].x}, ${snake[0].y})，方向: ${direction}`);
                console.log('完整蛇身位置:', snake.map((seg, i) => `${i}: (${seg.x}, ${seg.y})`).join(', '));
                
                // 立即绘制（只显示蛇头）
                draw();
                
                // 启动渐进式渲染定时器
                progressiveRenderState.renderTimer = setInterval(() => {
                    if (progressiveRenderState.visibleSegments < progressiveRenderState.totalSegments) {
                        // 增加可见段数量
                        progressiveRenderState.visibleSegments++;
                        console.log(`渐进式渲染: 显示 ${progressiveRenderState.visibleSegments}/${progressiveRenderState.totalSegments} 段`);
                        
                        // 重新绘制（drawSnake函数会根据visibleSegments决定绘制多少段）
                        draw();
                    } else {
                        // 渐进式渲染完成
                        console.log('渐进式渲染完成');
                        progressiveRenderState.isActive = false;
                        clearInterval(progressiveRenderState.renderTimer);
                        progressiveRenderState.renderTimer = null;
                        
                        // **关键修复**: 渐进式渲染完成后重置边界穿梭标记
                        // 这样后续的 update() 调用将使用正常的移动逻辑，而不是边界穿梭逻辑
                        isBoundaryTraversal = false;
                        console.log('重置边界穿梭标记，后续移动将使用正常逻辑');
                        
                        // 蛇身已经在开始时正确设置，无需再次调整
                        console.log(`边界穿梭完成，最终蛇身结构:`, snake.map((seg, i) => `${i}: (${seg.x}, ${seg.y})`).join(', '));
                        console.log(`蛇头位置: (${snake[0].x}, ${snake[0].y})，方向: ${direction}`);
                        
                        // 渐进式渲染完成后，检查是否需要自动开始游戏
                        if (gameData.autoStart === true) {
                            console.log('渐进式渲染完成，准备自动开始游戏');
                            
                            // 在自动开始前验证蛇的位置和方向是否安全
                            const headAfterMove = {x: snake[0].x, y: snake[0].y};
                            switch(direction) {
                                case 'up': headAfterMove.y--; break;
                                case 'down': headAfterMove.y++; break;
                                case 'left': headAfterMove.x--; break;
                                case 'right': headAfterMove.x++; break;
                            }
                            
                            // 检查下一步移动是否安全
                            const isSafe = headAfterMove.x >= 0 && headAfterMove.x < tileCountX && 
                                          headAfterMove.y >= 0 && headAfterMove.y < tileCountY;
                            
                            console.log('安全性检查:', {
                                currentHead: snake[0],
                                direction: direction,
                                nextPosition: headAfterMove,
                                isSafe: isSafe
                            });
                            
                            if (isSafe) {
                                setTimeout(() => {
                                    if (!gameStarted && !gameOver) {
                                        console.log('执行自动开始游戏（渐进式渲染完成后）- 跳过倒计时');
                                        gamePaused = false;
                                        startGameDirect(); // 使用无倒计时的直接开始
                                    }
                                }, 300); // 减少延迟，让游戏更流畅
                            } else {
                                console.error('自动开始游戏被阻止：下一步移动不安全', {
                                    currentHead: snake[0],
                                    nextPosition: headAfterMove,
                                    direction: direction
                                });
                                
                                // 尝试调整蛇头位置使其安全
                                adjustSnakePositionForSafety(gameData.entryBoundary);
                                
                                // 再次尝试自动开始
                                setTimeout(() => {
                                    if (!gameStarted && !gameOver) {
                                        console.log('调整位置后执行自动开始游戏 - 跳过倒计时');
                                        gamePaused = false;
                                        startGameDirect(); // 使用无倒计时的直接开始
                                    }
                                }, 400); // 减少延迟
                            }
                        }
                    }
                }, progressiveRenderState.renderDelay);
                
            } else {
                // 正常情况：直接应用蛇身数据
                snake = fullSnake;
                console.log('正常游戏状态恢复，无边界穿梭');
            }
            
            // 更新分数显示
            scoreElement.textContent = formatScore(score, CONSTANTS.SCORE_DIGITS);
            
            // 立即绘制一次游戏状态，让用户看到状态已恢复
            draw();
            
            // 处理自动开始游戏的逻辑，添加适当的延迟确保状态稳定
            if (gameData.autoStart === true && !gameData.entryBoundary) {
                // 只有在非边界穿梭时才使用这个逻辑，边界穿梭在渐进式渲染完成后处理
                console.log('准备自动开始游戏（非边界穿梭）');
                
                // 隐藏游戏结束弹窗
                gameOverModal.style.display = 'none';
                
                // 延迟处理自动开始，确保状态稳定和提供更好的用户体验
                const startDelay = 500;
                
                setTimeout(() => {
                    // 确保游戏状态正确后再开始
                    if (!gameStarted && !gameOver) {
                        console.log('执行自动开始游戏（非边界穿梭）- 跳过倒计时');
                        gamePaused = false; // 确保不是暂停状态
                        startGameDirect(); // 使用无倒计时的直接开始
                    } else {
                        console.log('跳过自动开始游戏，当前状态:', { gameStarted, gameOver });
                    }
                }, startDelay);
            } else if (gameData.entryBoundary) {
                // 边界穿梭情况，等待渐进式渲染完成后再处理自动开始
                console.log('边界穿梭情况，等待渐进式渲染完成');
                // 隐藏游戏结束弹窗
                gameOverModal.style.display = 'none';
            } else {
                // 如果需要暂停游戏
                if (gameData.gamePaused === true) {
                    gamePaused = true;
                    pauseResumeBtn.textContent = '继续';
                    pauseResumeBtn.style.display = 'inline-block';
                }
            }
            
            console.log('游戏数据初始化成功，最终状态:', {
                gameStarted, gameOver, gamePaused, 
                autoStart: gameData.autoStart,
                entryBoundary: gameData.entryBoundary,
                receivedAt: gameData.receivedAt
            });
            return true;
        } catch (error) {
            console.error('初始化游戏数据时出错:', error);
            return false;
        }
    };
    
    // 提供给原生层获取当前游戏状态的方法
    window.getCurrentGameState = function() {
        // 构建完整的游戏状态对象
        const gameState = {
            snake: snake.slice(), // 复制蛇的数组，避免引用问题
            food: foods.map(f => ({ x: f.x, y: f.y, type: f.type })),
            direction: direction,
            score: score,
            speed: gameSpeed,
            gameStarted: gameStarted,
            gameOver: gameOver,
            gamePaused: gamePaused,
            boundaryCollision: null  // 默认无边界碰撞
        };
        
        return gameState;
    };
    
    // 主动向Native同步游戏状态的函数
    // eventType: 'critical'（关键事件，立即同步）| 'regular'（常规更新，1秒节流）
    function syncGameStateToNative(forceSync = false, eventType = 'regular') {
        if (window.JSBridge && typeof window.JSBridge.updateGameState === 'function') {
            const isCritical = forceSync || eventType === 'critical';
            const now = Date.now();
            
            // 关键事件或强制同步 → 立即同步；常规事件 → 1秒节流
            if (!isCritical && now - lastRegularSyncTime < 1000) {
                return; // 常规更新节流中，跳过
            }
            
            // 只在游戏进行中且未暂停时同步状态，或强制/关键事件
            if (isCritical || (gameStarted && !gameOver && !gamePaused)) {
                try {
                    const gameState = window.getCurrentGameState();
                    window.JSBridge.updateGameState(JSON.stringify(gameState));
                    lastRegularSyncTime = now;
                } catch (e) {
                    console.error('同步游戏状态到Native失败:', e);
                }
            }
        }
    }
    
    // ================= 迭代难度系统 =================
    
    // 加载历史战绩等级
    function loadHistoryLevel() {
        if (learningParams.recentResults.length === 0) return 0;
        const avg = learningParams.recentResults.reduce((s, r) => s + r.score, 0) / learningParams.recentResults.length;
        return Math.floor(avg / CONSTANTS.HISTORY_BONUS_DIVISOR);
    }
    
    // 保存游戏结果 + 触发AI学习
    function saveGameResult(finalScore, duration) {
        updateLearningModel(finalScore, duration);
    }
    
    // 计算当前迭代等级
    function getIterationLevel() {
        const scoreLevel = Math.floor(score / learningParams.scoreStep);
        const timeLevel = Math.floor(elapsedSeconds / learningParams.timeStep);
        return Math.min(scoreLevel + timeLevel + historyLevel, CONSTANTS.ITERATION_MAX_LEVEL);
    }
    
    // 普通食物分值
    function getNormalPoints() {
        return CONSTANTS.BASE_FOOD_POINTS + getIterationLevel() * CONSTANTS.LEVEL_FOOD_BONUS;
    }
    
    // 毒食物扣分（普通奖励的50%）
    function getToxicPenalty() {
        return -Math.floor(getNormalPoints() * CONSTANTS.TOXIC_PENALTY_RATIO);
    }
    
    // 毒食物缩短节数
    function getShrinkSegments() {
        return CONSTANTS.BASE_SHRINK_SEGMENTS + Math.floor(getIterationLevel() / CONSTANTS.LEVEL_SHRINK_STEP);
    }
    
    // 食物刷新间隔（秒）
    function getFoodInterval() {
        return Math.max(CONSTANTS.MIN_FOOD_INTERVAL,
            CONSTANTS.BASE_FOOD_INTERVAL - getIterationLevel() * learningParams.intervalStep);
    }
    
    // 启动耗时计时器
    function startElapsedTimer() {
        elapsedSeconds = 0;
        if (elapsedTimer) clearInterval(elapsedTimer);
        elapsedTimer = setInterval(() => {
            if (!gamePaused && gameStarted && !gameOver) {
                elapsedSeconds++;
                iterationLevel = getIterationLevel();
                updateLevelDisplay();
            }
        }, 1000);
    }
    
    // 停止耗时计时器
    function stopElapsedTimer() {
        if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    }
    
    // 更新等级显示
    function updateLevelDisplay() {
        const levelEl = document.getElementById('levelDisplay');
        const infoEl = document.getElementById('levelInfo');
        const lv = getIterationLevel();
        const nextScore = (Math.floor(score / learningParams.scoreStep) + 1) * learningParams.scoreStep;
        if (levelEl) levelEl.textContent = `Lv.${lv}`;
        if (infoEl) {
            infoEl.textContent = `🍎+${getNormalPoints()}  ☠${getToxicPenalty()}  ✂-${getShrinkSegments()}  ▶Lv.${lv+1}:${nextScore}分`;
        }
    }
    
    // 启动食物刷新计时器
    function startFoodSpawnTimer() {
        if (foodSpawnTimer) clearInterval(foodSpawnTimer);
        const scheduleNext = () => {
            foodSpawnTimer = setTimeout(() => {
                if (gameStarted && !gameOver && !gamePaused) {
                    generateFood();
                    draw();
                }
                scheduleNext();
            }, getFoodInterval() * 1000);
        };
        scheduleNext();
    }
    
    function stopFoodSpawnTimer() {
        if (foodSpawnTimer) { clearTimeout(foodSpawnTimer); foodSpawnTimer = null; }
    }
    
    // ================= 屏幕适配功能 =================

    function initCanvas() {
        var container = canvas.parentElement;
        var windowWidth = window.innerWidth;
        var windowHeight = window.innerHeight;
        var isLandscape = windowWidth > windowHeight;
        var dpr = window.devicePixelRatio || 1;
        
        var availableWidth, availableHeight;
        
        if (isLandscape) {
            availableHeight = windowHeight * 0.88;
            availableWidth = availableHeight * (CONSTANTS.GRID_COUNT_X / CONSTANTS.GRID_COUNT_Y);
            if (availableWidth > windowWidth * 0.85) {
                availableWidth = windowWidth * 0.85;
                availableHeight = availableWidth / (CONSTANTS.GRID_COUNT_X / CONSTANTS.GRID_COUNT_Y);
            }
        } else {
            availableWidth = windowWidth * 0.92;
            availableHeight = windowHeight * CONSTANTS.PORTRAIT_CANVAS_HEIGHT_RATIO;
        }
        
        var gridResult = calculateGridForBreakpoint(availableWidth, availableHeight);
        tileCountX = gridResult.tileCountX;
        tileCountY = gridResult.tileCountY;
        gridSize = gridResult.gridSize;
        
        var canvasWidth = gridSize * tileCountX;
        var canvasHeight = gridSize * tileCountY;
        
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = canvasHeight + 'px';
        
        document.documentElement.style.setProperty('--canvas-width', canvasWidth + 'px');
        document.documentElement.style.setProperty('--canvas-height', canvasHeight + 'px');
        document.documentElement.style.setProperty('--font-scale', String(canvasWidth / 375));
        
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = false;
        
        canvas.style.margin = '0 auto';
        canvas.style.padding = '0';
        canvas.style.display = 'block';
        document.body.style.backgroundColor = CONSTANTS.BACKGROUND_COLOR;
        
        var sc = document.querySelector('.score-container');
        var bc = document.querySelector('.buttons');
        var ld = document.getElementById('levelDisplay');
        var li = document.getElementById('levelInfo');
        if (sc) sc.style.width = canvasWidth + 'px';
        if (bc) bc.style.width = canvasWidth + 'px';
        if (ld) ld.style.width = canvasWidth + 'px';
        if (li) li.style.width = canvasWidth + 'px';
        
        var gc = document.querySelector('.game-container');
        if (gc) {
            gc.style.flexDirection = isLandscape ? 'row' : 'column';
        }
    }

    // ================= 游戏核心功能 =================

    // 初始化游戏
    function initGame() {
        // 加载自学习参数
        loadLearningParams();
        
        // 获取历史最高分
        highScore = localStorage.getItem('snakeHighScore') || 0;
        highScore = parseInt(highScore);
        
        // 初始化画布
        initCanvas();
        resetGame();
        highScoreElement.textContent = formatScore(highScore, CONSTANTS.SCORE_DIGITS);
        
        // 预加载图片资源
        preloadImages(() => {
            console.log('图片资源加载完成');
            
            // 检查图片加载状态
            checkAndCreateMissingImages();
            
            // 立即绘制游戏
            draw();
            console.log('完成初始绘制');
            console.log('网格尺寸: X=' + tileCountX + ', Y=' + tileCountY);
            console.log('蛇的初始位置:', snake);
        });
    }

    // 重置游戏状态
    function resetGame() {
        // ⚠️ 先结束管理员会话（双重保险，handleGameOver 也会调用）
        if (AdminSession.session?.isActive) {
            AdminSession.end();
        }

        // 清除可能的游戏结束动画
        if (gameOverAnimationState.animationTimer) {
            clearInterval(gameOverAnimationState.animationTimer);
            gameOverAnimationState.animationTimer = null;
        }
        gameOverAnimationState.isActive = false;
        gameOverAnimationState.animationType = null;
        gameOverAnimationState.visibleSegments = 0;
        gameOverAnimationState.boundaryDirection = null;
        
        // 清空食物数组 +  NPC蛆
        foods = [];
        maggots = [];
        maggotCorpses = [];
        
        // 初始化蛇的位置
        snake = [];
        const middlePosX = Math.floor(CONSTANTS.GRID_COUNT_X / 2);
        const middlePosY = Math.floor(CONSTANTS.GRID_COUNT_Y / 2);
        
        for (let i = 0; i < CONSTANTS.INITIAL_SNAKE_LENGTH; i++) {
            snake.push({ x: middlePosX - i, y: middlePosY });
        }
        
        generateFood();
        // 初始多生成几个食物
        generateFood();
        generateFood();
        direction = 'right';
        nextDirection = 'right';
        score = 0;
        gameOver = false;
        isGameOverHandled = false; // 重置游戏结束处理标记
        isBoundaryTraversal = false; // 重置边界穿梭标记
        gameStarted = false;
        gamePaused = false;
        scoreElement.textContent = formatScore(score, CONSTANTS.SCORE_DIGITS);
        gameSpeed = CONSTANTS.GAME_SPEED; // 恒定游戏速度
        
        // 更新UI状态
        pauseResumeBtn.style.display = 'none';
        
        // 重置迭代系统
        stopElapsedTimer();
        stopFoodSpawnTimer();
        elapsedSeconds = 0;
        iterationLevel = 0;
        updateLevelDisplay();
        
        // 在状态重置后立即同步到Native
        syncGameStateToNative(true);
    }

    // 开始倒计时
    function startCountdown(callback) {
        let count = 3;
        countdownOverlay.textContent = count;
        countdownOverlay.style.display = 'flex';
        
        countdownTimer = setInterval(() => {
            count--;
            if (count > 0) {
                countdownOverlay.textContent = count;
            } else {
                clearInterval(countdownTimer);
                countdownOverlay.style.display = 'none';
                callback();
            }
        }, CONSTANTS.COUNTDOWN_DURATION);
    }

    // 暂停和恢复游戏功能
    function togglePauseResume() {
        if (!gameStarted || gameOver) return;
        
        if (gamePaused) {
            // 恢复游戏
            gamePaused = false;
            pauseResumeBtn.textContent = '暂停';
            // 使用恒定游戏速度
            gameSpeed = CONSTANTS.GAME_SPEED;
            gameLoop = setInterval(() => {
                update();
                draw();
                // 在游戏循环中同步状态，确保与游戏节奏一致
                // syncGameStateToNative();
            }, gameSpeed);
            
            // 恢复时同步一次状态
            syncGameStateToNative(true);
        } else {
            // 暂停游戏
            gamePaused = true;
            pauseResumeBtn.textContent = '继续';
            clearInterval(gameLoop);
            _adminPausedGame = false;  // 手动暂停优先，取消管理员自动恢复

            // 暂停时同步一次状态
            syncGameStateToNative(true);
        }
    }
    
    // 处理应用进入后台和返回前台
    function handleVisibilityChange() {
        if (document.hidden) {
            // 页面不可见时，如果游戏正在进行且未暂停，则暂停游戏
            if (gameStarted && !gameOver && !gamePaused) {
                gamePaused = true;
                pauseResumeBtn.textContent = '继续';
                clearInterval(gameLoop);
                // 同步状态到Native
                syncGameStateToNative(true);
            }
        }
    }
    
    // 添加页面可见性事件监听
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 开始游戏（带倒计时）
    function startGame() {
        console.log('尝试开始游戏 - 当前状态:', { gameStarted, gameOver, gamePaused });
        
        // 删除这个检查，允许在恢复后重新开始游戏
        // if (gameStarted) return;
        
        startCountdown(() => {
            console.log('倒计时结束，正式开始游戏');
            startGameDirect();
        });
    }

    // 直接开始游戏（无倒计时，用于分布式恢复）
    function startGameDirect() {
        console.log('直接开始游戏（无倒计时）');
        gameStarted = true;
        gameOver = false;
        isGameOverHandled = false;
        gamePaused = false;

        // 激活管理员会话 + 启动实时监控
        activateAdminOnGameStart();
        LocalAdminEngine.startMonitor();

        // 加载历史战绩等级
        historyLevel = loadHistoryLevel();
        iterationLevel = getIterationLevel();
        updateLevelDisplay();
        
        // 启动计时器
        startElapsedTimer();
        startFoodSpawnTimer();
        startBtn.style.display = 'none';
        restartBtn.style.display = 'inline-block';
        pauseResumeBtn.style.display = 'inline-block';
        pauseResumeBtn.textContent = '暂停';
        
        // 确保在开始新游戏前先清除现有的游戏循环
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
        
        // 使用恒定游戏速度
        gameSpeed = CONSTANTS.GAME_SPEED;
        console.log('设置游戏速度为:', gameSpeed);
        
        gameLoop = setInterval(() => {
            update();
            draw();
            // 在游戏循环中同步状态，确保与游戏节奏一致
            // syncGameStateToNative();
        }, gameSpeed);
        console.log('游戏循环已创建，间隔:', gameSpeed);
    }


// 游戏结束动画函数
function startGameOverAnimation(boundaryCollision = null) {
    console.log('开始游戏结束动画，边界碰撞:', boundaryCollision);
    
    // 清除可能存在的动画定时器
    if (gameOverAnimationState.animationTimer) {
        clearInterval(gameOverAnimationState.animationTimer);
        gameOverAnimationState.animationTimer = null;
    }
    
    // 设置动画状态
    gameOverAnimationState.isActive = true;
    gameOverAnimationState.visibleSegments = snake.length;
    gameOverAnimationState.boundaryDirection = boundaryCollision;
    
    if (boundaryCollision) {
        // 边界碰撞：蛇向边界外移动消失
        gameOverAnimationState.animationType = 'boundary-exit';
        startBoundaryExitAnimation(boundaryCollision);
    } else {
        // 自身碰撞：从尾部开始逐渐消失
        gameOverAnimationState.animationType = 'disappear';
        startDisappearAnimation();
    }
}

// 边界穿出动画
function startBoundaryExitAnimation(boundaryDirection) {
    console.log('开始边界穿出动画，方向:', boundaryDirection);
    
    gameOverAnimationState.animationTimer = setInterval(() => {
        // 根据边界方向移动整条蛇
        for (let i = 0; i < snake.length; i++) {
            switch (boundaryDirection) {
                case 'left':
                    snake[i].x--;
                    break;
                case 'right':
                    snake[i].x++;
                    break;
                case 'top':
                    snake[i].y--;
                    break;
                case 'bottom':
                    snake[i].y++;
                    break;
            }
        }
        
        // 重绘游戏
        draw();
        
        // 检查是否所有蛇身段都移出了边界
        let allOutOfBounds = true;
        for (let segment of snake) {
            if (segment.x >= 0 && segment.x < tileCountX && 
                segment.y >= 0 && segment.y < tileCountY) {
                allOutOfBounds = false;
                break;
            }
        }
        
        if (allOutOfBounds) {
            // 动画完成
            clearInterval(gameOverAnimationState.animationTimer);
            gameOverAnimationState.animationTimer = null;
            gameOverAnimationState.isActive = false;
            console.log('边界穿出动画完成');
            
            // 边界穿出动画完成后，检查是否需要显示游戏结束对话框
            // 如果JSBridge未定义，或者无边界碰撞相关的设备间迁移，则显示对话框
            if (!window.JSBridge) {
                setTimeout(() => {
                    showGameOverDialog();
                }, 200);
            }
        }
    }, CONSTANTS.GAME_OVER_ANIMATION_INTERVAL);
}

// 逐渐消失动画
function startDisappearAnimation() {
    console.log('开始逐渐消失动画');
    
    gameOverAnimationState.animationTimer = setInterval(() => {
        if (gameOverAnimationState.visibleSegments > 0) {
            gameOverAnimationState.visibleSegments--;
            draw(); // 重绘，显示较少的蛇身段
            console.log('蛇身消失中，剩余段数:', gameOverAnimationState.visibleSegments);
        } else {
            // 动画完成
            clearInterval(gameOverAnimationState.animationTimer);
            gameOverAnimationState.animationTimer = null;
            gameOverAnimationState.isActive = false;
            console.log('逐渐消失动画完成');
            
            // 动画完成后显示游戏结束弹窗
            setTimeout(() => {
                showGameOverDialog();
            }, 200);
        }
    }, CONSTANTS.GAME_OVER_ANIMATION_INTERVAL);
}

// 显示得分动画
function showScoreAnimation(x, y, points, color = '#FFD700') {
    scoreAnimation.textContent = points > 0 ? `+${points}` : `${points}`;
    scoreAnimation.style.left = `${x}px`;
    scoreAnimation.style.top = `${y - 20}px`;
    scoreAnimation.style.color = color;
    scoreAnimation.style.display = 'block';
    
    // 重置动画
    scoreAnimation.style.animation = 'none';
    scoreAnimation.offsetHeight; // 触发重绘
    scoreAnimation.style.animation = 'float-up 1s ease-out forwards';
    
    // 动画结束后隐藏
    setTimeout(() => {
        scoreAnimation.style.display = 'none';
    }, CONSTANTS.ANIMATION_DURATION);
}

// 游戏结束处理
function handleGameOver(boundaryCollision = null) {
    // 防止重复触发游戏结束逻辑
    if (isGameOverHandled) return;
    isGameOverHandled = true;

    // ⚠️ 第一件事：结束管理员会话，复原所有临时修改
    if (AdminSession.session?.isActive) {
        AdminSession.end();
    }
    // 隐藏流转和管理员按钮
    var tb = document.getElementById('transferBtn');
    if (tb) tb.style.display = 'none';

    gameStarted = false;
    gameOver = true;
    gamePaused = false;
    
    // ★ 管理员分析本局 + 停止实时监控
    var deathCause = boundaryCollision ? 'wall' : 'self';
    LocalAdminEngine.analyzeSession(score, elapsedSeconds, deathCause);
    LocalAdminEngine.stopMonitor();

    // 保存本局战绩 + 停止计时器
    saveGameResult(score, elapsedSeconds);
    stopElapsedTimer();
    stopFoodSpawnTimer();
    // 停止游戏循环
    if (gameLoop) {
        clearInterval(gameLoop);
        gameLoop = null;
    }
    
    // 保持恒定游戏速度
    gameSpeed = CONSTANTS.GAME_SPEED;
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snakeHighScore', highScore);
        highScoreElement.textContent = formatScore(highScore, CONSTANTS.SCORE_DIGITS);
    }
    
    // 获取当前游戏状态数据
    const gameState = window.getCurrentGameState();
    
    // 如果是边界碰撞，添加碰撞边界信息到游戏状态
    if (boundaryCollision) {
        gameState.boundaryCollision = boundaryCollision;
    }
    
    // 发送游戏结束消息给原生层，同时传递完整的游戏状态数据
    if (window.JSBridge) {
        // 直接传递游戏状态数据，包含边界碰撞信息
        window.JSBridge.gameOver(JSON.stringify(gameState));
        console.log('H5游戏结束，传递完整游戏数据：', gameState);
    } else {
        console.log('H5游戏结束，分数：', score, '(JSBridge未定义)');
    }
    
    // 启动游戏结束动画而不是立即显示对话框
    startGameOverAnimation(boundaryCollision);
}

// 显示游戏结束弹窗
window.showGameOverDialog = function() {
    console.log('显示游戏结束弹窗');
    finalScoreElement.textContent = score;
    gameOverModal.style.display = 'flex';
    pauseResumeBtn.style.display = 'none';
}

// 内部函数，用于在游戏结束时显示弹窗
function showGameOverDialog() {
    // 调用全局函数
    window.showGameOverDialog();
}

// 随机生成食物，追加到食物数组
function generateFood() {
    const isShrink = Math.random() < learningParams.shrinkProb;
    let newFood;
    
    if (isShrink) {
        newFood = {
            x: Math.floor(Math.random() * tileCountX),
            y: Math.floor(Math.random() * tileCountY),
            type: 'shrink'
        };
    } else {
        const foodIndex = Math.floor(Math.random() * CONSTANTS.FOOD_IMAGES.length);
        newFood = {
            x: Math.floor(Math.random() * tileCountX),
            y: Math.floor(Math.random() * tileCountY),
            type: 'normal',
            imageKey: `FOOD_${foodIndex}`,
            imageIndex: foodIndex
        };
    }
    
    // 确保不生成在蛇身或已有食物上
    for (let segment of snake) {
        if (segment.x === newFood.x && segment.y === newFood.y) return generateFood();
    }
    for (let f of foods) {
        if (f.x === newFood.x && f.y === newFood.y) return generateFood();
    }
    foods.push(newFood);
}

// ================= 游戏逻辑更新 =================

// 更新游戏状态
function update() {
    if (gameOver) return;
    
    // 在渐进式渲染期间跳过游戏逻辑更新
    if (progressiveRenderState.isActive) {
        console.log('渐进式渲染期间跳过游戏逻辑更新');
        return;
    }

    // 更新方向
    direction = nextDirection;

    // 移动蛇
    const head = {x: snake[0].x, y: snake[0].y};
    
    switch(direction) {
        case 'up': head.y--; break;
        case 'down': head.y++; break;
        case 'left': head.x--; break;
        case 'right': head.x++; break;
    }

    // 检查碰撞边界
    if (head.x < 0 || head.x >= tileCountX || head.y < 0 || head.y >= tileCountY) {
        // 🛡️ 无敌模式：穿墙环绕，不触发游戏结束
        if (AdminSession.isInvincible()) {
            if (head.x < 0) head.x = tileCountX - 1;
            else if (head.x >= tileCountX) head.x = 0;
            else if (head.y < 0) head.y = tileCountY - 1;
            else if (head.y >= tileCountY) head.y = 0;
            console.log('🛡️ 无敌模式：穿墙环绕');
        } else {
            // 记录碰撞的边界方向
            let boundaryCollision = null;
            if (head.x < 0) boundaryCollision = 'left';
            else if (head.x >= tileCountX) boundaryCollision = 'right';
            else if (head.y < 0) boundaryCollision = 'top';
            else if (head.y >= tileCountY) boundaryCollision = 'bottom';

            handleGameOver(boundaryCollision);
            return;
        }
    }

    // 检查碰撞自身（在渐进式渲染期间跳过自身碰撞检测）
    if (!progressiveRenderState.isActive) {
        for (let i = 0; i < snake.length; i++) {
            if (snake[i].x === head.x && snake[i].y === head.y) {
                // 🛡️ 无敌模式：忽略自身碰撞
                if (AdminSession.isInvincible()) {
                    console.log('🛡️ 无敌模式：忽略自身碰撞');
                } else {
                    handleGameOver();
                    return;
                }
            }
        }
    } else {
        console.log('渐进式渲染期间跳过自身碰撞检测');
    }

    // 处理正常移动逻辑
    snake.unshift(head);

    // 检查是否吃到任意食物
    let ateFood = false;
    for (let fi = foods.length - 1; fi >= 0; fi--) {
        const f = foods[fi];
        if (head.x === f.x && head.y === f.y) {
            ateFood = true;
            if (f.type === 'shrink') {
                const shrinkCount = Math.min(getShrinkSegments(), snake.length - 1);
                for (let i = 0; i < shrinkCount; i++) { snake.pop(); }
                const penalty = getToxicPenalty();
                score += penalty;
                scoreElement.textContent = formatScore(Math.max(0, score), CONSTANTS.SCORE_DIGITS);
                const fpx = f.x * gridSize + canvas.offsetLeft + gridSize/2;
                const fpy = f.y * gridSize + canvas.offsetTop + gridSize/2;
                showScoreAnimation(fpx, fpy, penalty, '#FF4444');
            } else {
                score += getNormalPoints();
                scoreElement.textContent = formatScore(score, CONSTANTS.SCORE_DIGITS);
                const fpx = f.x * gridSize + canvas.offsetLeft + gridSize/2;
                const fpy = f.y * gridSize + canvas.offsetTop + gridSize/2;
                showScoreAnimation(fpx, fpy, getNormalPoints());
            }
            iterationLevel = getIterationLevel();
            updateLevelDisplay();
            foods.splice(fi, 1); // 移除被吃掉的食物
        }
    }
    
    if (ateFood) {
        // 补充新食物
        generateFood();
        syncGameStateToNative(true, 'critical');
    } else {
        snake.pop();
    }

    // 更新NPC蛆
    updateMaggots();
}

// ================= 游戏渲染 =================

// 绘制游戏
function draw() {
    // 清空画布
    ctx.fillStyle = CONSTANTS.CANVAS_BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格线（可选，帮助渲染更清晰）
    drawGrid();
    
    // 绘制蛇
    drawSnake();
    
    // 绘制食物
    drawFood();

    // 绘制NPC蛆和尸体
    drawMaggots();

    // 游戏结束显示（仅在动画完成后显示覆盖层）
    if (gameOver && !gameOverAnimationState.isActive) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // ctx.fillStyle = '#fff';
        // ctx.font = '30px Arial';
        // ctx.textAlign = 'center';
        // ctx.fillText('游戏结束', canvas.width / 2, canvas.height / 2);
    }
}
    
// 绘制网格线（可选，提高渲染清晰度）
function drawGrid() {
    ctx.strokeStyle = CONSTANTS.GRID_LINE_COLOR;
    ctx.lineWidth = Math.max(1, canvas.width * CONSTANTS.GRID_LINE_WIDTH / 2000);
    
    // 绘制垂直线
    for (let i = 1; i < tileCountX; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, tileCountY * gridSize);
        ctx.stroke();
    }
    
    // 绘制水平线
    for (let i = 1; i < tileCountY; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(tileCountX * gridSize, i * gridSize);
        ctx.stroke();
    }
}

function drawSnake() {
        // 调试信息
        console.log('Drawing snake:', snake.length, 'segments');
        console.log('Grid size:', gridSize);
        console.log('Images loaded:', imagesLoaded);
        console.log('Progressive render active:', progressiveRenderState.isActive);
        console.log('Game over animation active:', gameOverAnimationState.isActive);
        
        // 确定要绘制的蛇身段数量
        let segmentsToDraw = snake.length;
        if (progressiveRenderState.isActive) {
            segmentsToDraw = Math.min(progressiveRenderState.visibleSegments, snake.length);
            console.log(`渐进式渲染：绘制 ${segmentsToDraw}/${snake.length} 段`);
        } else if (gameOverAnimationState.isActive) {
            // 游戏结束动画期间，根据动画类型决定绘制的段数
            if (gameOverAnimationState.animationType === 'disappear') {
                // 逐渐消失动画：从尾部开始减少可见段数
                segmentsToDraw = gameOverAnimationState.visibleSegments;
                console.log(`游戏结束消失动画：绘制 ${segmentsToDraw}/${snake.length} 段`);
            } else if (gameOverAnimationState.animationType === 'boundary-exit') {
                // 边界穿出动画：绘制所有段，但可能有些段已经移出边界
                segmentsToDraw = snake.length;
                console.log(`游戏结束边界穿出动画：绘制所有段，当前位置会在边界外`);
            }
        }
        
        // 绘制蛇身（仅绘制可见段）
        for (let index = 0; index < segmentsToDraw; index++) {
            const segment = snake[index];
            
            // **关键修复**: 根据动画状态决定是否绘制边界外的蛇身段
            const isOutOfBounds = segment.x < 0 || segment.x >= tileCountX || segment.y < 0 || segment.y >= tileCountY;
            
            if (isOutOfBounds) {
                // 在边界穿出动画期间，允许绘制边界外的段（实现穿出效果）
                // 在其他情况下（渐进式渲染等），跳过边界外的段
                if (gameOverAnimationState.isActive && gameOverAnimationState.animationType === 'boundary-exit') {
                    console.log(`边界穿出动画：绘制边界外的蛇身段 ${index}: (${segment.x}, ${segment.y})`);
                } else {
                    console.log(`跳过边界外的蛇身段 ${index}: (${segment.x}, ${segment.y})`);
                    continue; // 跳过边界外的段
                }
            }
            
            // 获取当前段、前一段和后一段用于确定连接方式
            const prev = index > 0 ? snake[index - 1] : null;
            const next = index < segmentsToDraw - 1 ? snake[index + 1] : null;
            
            // 计算绘制位置
            const x = segment.x * gridSize;
            const y = segment.y * gridSize;
            
            // 调试信息
            if (index === 0) {
                console.log('Snake head position:', segment.x, segment.y);
                console.log('Drawing at:', x, y);
            }
            
            if (imagesLoaded) {
                // 确保所有需要的图片都已加载到imageCache中
                if (index === 0) {
                    // 蛇头部分 - 根据移动方向选择对应的蛇头图片
                    let headImageKey = 'HEAD';
                    
                    // 根据当前方向选择正确的蛇头图片
                    if (direction === 'left') {
                        headImageKey = 'HEAD_LEFT';
                    } else if (direction === 'right') {
                        headImageKey = 'HEAD_RIGHT';
                    }
                    
                    const headImage = imageCache[headImageKey];
                    console.log('Head image:', headImageKey, headImage ? 'loaded' : 'not loaded');
                    
                    if (headImage && headImage.complete && !headImage.error) {
                        // 绘制对应方向的蛇头
                        ctx.drawImage(headImage, x, y, gridSize, gridSize);
                    } else {
                        // 备用绘制方法，使用简单的矩形
                        ctx.fillStyle = '#4CAF50';
                        ctx.fillRect(x, y, gridSize, gridSize);
                        // 添加眼睛，根据方向调整位置
                        ctx.fillStyle = '#000';
                        if (direction === 'left') {
                            ctx.fillRect(x + gridSize * 0.2, y + gridSize * 0.3, gridSize * 0.1, gridSize * 0.1);
                        } else if (direction === 'right') {
                            ctx.fillRect(x + gridSize * 0.7, y + gridSize * 0.3, gridSize * 0.1, gridSize * 0.1);
                        } else if (direction === 'up') {
                            ctx.fillRect(x + gridSize * 0.3, y + gridSize * 0.2, gridSize * 0.1, gridSize * 0.1);
                        } else { // down
                            ctx.fillRect(x + gridSize * 0.3, y + gridSize * 0.7, gridSize * 0.1, gridSize * 0.1);
                        }
                    }
                } else {
                    // 蛇身体部分
                    
                    // 检查是否为转弯（拐角）
                    if (prev && next && ((prev.x !== next.x) && (prev.y !== next.y))) {
                        // 确定拐角类型
                        let cornerImage = null;
                        
                        // 根据前后节点的相对位置确定使用哪个拐角图片
                        
                        // 判断转弯方向，按照拐角图片与转弯方向的关系
                        // TOP_RIGHT (右上角): 应该用于右向下、上向左的转弯
                        // TOP_LEFT (左上角): 应该用于左向下、上向右的转弯
                        // BOTTOM_RIGHT (右下角): 应该用于右向上、下向左的转弯
                        // BOTTOM_LEFT (左下角): 应该用于左向上、下向右的转弯
                        
                        let turnDirection = '';
                        let cornerType = '';
                        let fromDirection = '';
                        let toDirection = '';
                        
                        // 先确定蛇来自哪个方向
                        if (prev.x < segment.x) {
                            fromDirection = 'right'; // 蛇从左向右移动
                        } else if (prev.x > segment.x) {
                            fromDirection = 'left'; // 蛇从右向左移动
                        } else if (prev.y < segment.y) {
                            fromDirection = 'down'; // 蛇从上向下移动
                        } else if (prev.y > segment.y) {
                            fromDirection = 'up'; // 蛇从下向上移动
                        }
                        
                        // 然后确定蛇要去向哪个方向
                        if (next.x < segment.x) {
                            toDirection = 'left'; // 蛇要向左移动
                        } else if (next.x > segment.x) {
                            toDirection = 'right'; // 蛇要向右移动
                        } else if (next.y < segment.y) {
                            toDirection = 'up'; // 蛇要向上移动
                        } else if (next.y > segment.y) {
                            toDirection = 'down'; // 蛇要向下移动
                        }
                        
                        // 根据转弯方向选择正确的拐角图片
                        // TOP_RIGHT (右上角): 应该用于右向下、上向左的转弯
                        // TOP_LEFT (左上角): 应该用于左向下、上向右的转弯
                        // BOTTOM_RIGHT (右下角): 应该用于右向上、下向左的转弯
                        // BOTTOM_LEFT (左下角): 应该用于左向上、下向右的转弯
                        
                        if ((fromDirection === 'right' && toDirection === 'down') || 
                            (fromDirection === 'up' && toDirection === 'left')) {
                            // 右向下或上向左 - 使用右上角
                            cornerImage = imageCache['BODY_CORNER_TOP_RIGHT'];
                            turnDirection = `${fromDirection}向${toDirection}转弯`;
                            cornerType = 'BODY_CORNER_TOP_RIGHT (右上角)';
                        } else if ((fromDirection === 'left' && toDirection === 'down') || 
                                   (fromDirection === 'up' && toDirection === 'right')) {
                            // 左向下或上向右 - 使用左上角
                            cornerImage = imageCache['BODY_CORNER_TOP_LEFT'];
                            turnDirection = `${fromDirection}向${toDirection}转弯`;
                            cornerType = 'BODY_CORNER_TOP_LEFT (左上角)';
                        } else if ((fromDirection === 'right' && toDirection === 'up') || 
                                   (fromDirection === 'down' && toDirection === 'left')) {
                            // 右向上或下向左 - 使用右下角
                            cornerImage = imageCache['BODY_CORNER_BOTTOM_RIGHT'];
                            turnDirection = `${fromDirection}向${toDirection}转弯`;
                            cornerType = 'BODY_CORNER_BOTTOM_RIGHT (右下角)';
                        } else if ((fromDirection === 'left' && toDirection === 'up') || 
                                   (fromDirection === 'down' && toDirection === 'right')) {
                            // 左向上或下向右 - 使用左下角
                            cornerImage = imageCache['BODY_CORNER_BOTTOM_LEFT'];
                            turnDirection = `${fromDirection}向${toDirection}转弯`;
                            cornerType = 'BODY_CORNER_BOTTOM_LEFT (左下角)';
                        }
                        
                        // 输出日志，包含转弯方向和选择的图片
                        console.log(`蛇转弯: 从${fromDirection}向${toDirection}, 使用图片: ${cornerType}`);
                        console.log(`前一节: (${prev.x},${prev.y}), 当前节点: (${segment.x},${segment.y}), 下一节: (${next.x},${next.y})`);
                        
                        
                        if (cornerImage && cornerImage.complete && !cornerImage.error) {
                            ctx.drawImage(cornerImage, x, y, gridSize, gridSize);
                        } else {
                            // 如果没有找到合适的拐角图片或图片加载失败，使用备用渲染
                            const hue = (CONSTANTS.SNAKE_BODY_BASE_COLOR + index * 2) % 360;
                            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
                            ctx.fillRect(x, y, gridSize, gridSize);
                        }
                    } else {
                        // 直线身体部分
                        let bodyImage = null;
                        
                        if (prev && next) {
                            // 中间节点
                            if (prev.x !== segment.x || next.x !== segment.x) {
                                // 水平移动
                                bodyImage = imageCache['BODY_HORIZONTAL'];
                            } else {
                                // 垂直移动
                                bodyImage = imageCache['BODY_VERTICAL'];
                            }
                        } else if (prev) {
                            // 尾部节点（最后一节）
                            if (prev.x !== segment.x) {
                                // 水平移动
                                bodyImage = imageCache['BODY_HORIZONTAL'];
                            } else {
                                // 垂直移动
                                bodyImage = imageCache['BODY_VERTICAL'];
                            }
                        }
                        
                        if (bodyImage && bodyImage.complete && !bodyImage.error) {
                            ctx.drawImage(bodyImage, x, y, gridSize, gridSize);
                        } else {
                            // 如果图片加载失败，使用备用渲染
                            const hue = (CONSTANTS.SNAKE_BODY_BASE_COLOR + index * 2) % 360;
                            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
                            ctx.fillRect(x, y, gridSize, gridSize);
                        }
                    }
                }
            } else {
                // 图片未加载，使用备用渲染方法
                if (index === 0) {
                    // 如果是蛇头，使用单一蛇头图片
                    ctx.fillStyle = CONSTANTS.SNAKE_HEAD_COLOR;
                    ctx.fillRect(x, y, gridSize, gridSize);
                } else {
                    // 如果是蛇身，使用渐变颜色
                    const hue = (CONSTANTS.SNAKE_BODY_BASE_COLOR + index * 2) % 360;
                    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
                    ctx.fillRect(x, y, gridSize, gridSize);
                }
            }
        }
    }
    
    // 绘制所有食物
    function drawFood() {
        for (let fi = 0; fi < foods.length; fi++) {
            const f = foods[fi];
            const x = f.x * gridSize;
            const y = f.y * gridSize;
        
        if (f.type === 'shrink') {
            // 有毒食物：像素风毒蘑菇小怪（Canvas 绘制）
            const s = gridSize / 10;
            const px = (rx, ry, w, h, color) => {
                ctx.fillStyle = color;
                ctx.fillRect(x + rx * s, y + ry * s, w * s, h * s);
            };
            px(1, 0, 8, 2, '#1B7A2D');
            px(0, 2, 10, 1, '#1B7A2D');
            px(0, 3, 3, 1, '#1B7A2D');
            px(7, 3, 3, 1, '#1B7A2D');
            px(3, 1, 2, 1, '#2ECC71');
            px(2, 1, 1, 1, '#A3FF00');
            px(6, 1, 1, 1, '#A3FF00');
            px(3, 4, 2, 2, '#00FF41');
            px(6, 4, 2, 2, '#00FF41');
            px(4, 4, 1, 1, '#FFFFFF');
            px(7, 4, 1, 1, '#FFFFFF');
            px(3, 6, 4, 2, '#A8E6CF');
            px(4, 8, 1, 1, '#1B5E20');
            px(5, 8, 1, 1, '#1B5E20');
            px(5, 9, 1, 1, '#1B5E20');
            ctx.fillStyle = 'rgba(0, 255, 100, 0.1)';
            ctx.beginPath();
            ctx.arc(x + gridSize / 2, y + gridSize / 2, gridSize * 0.55, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const foodImage = imageCache[f.imageKey];
            if (foodImage && foodImage.complete && !foodImage.error) {
                ctx.drawImage(foodImage, x, y, gridSize, gridSize);
            } else {
                const hue = (f.x * 37 + f.y * 91) % 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.fillRect(x + 2, y + 2, gridSize - 4, gridSize - 4);
            }
        }
        } // end for loop
    } // end drawFood

    // ================= 用户输入处理 =================
    let touchStartX = 0;
    let touchStartY = 0;
    
    canvas.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        e.preventDefault();
    }, false);
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault(); // 防止滚动
    }, false);
    
    canvas.addEventListener('touchend', (e) => {
        if (!gameStarted) {
            startGame();
            return;
        }
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        
        // 确定滑动方向
        if (Math.abs(dx) > Math.abs(dy)) {
            // 水平滑动
            if (dx > CONSTANTS.SWIPE_THRESHOLD && direction !== 'left') {
                nextDirection = 'right';
            } else if (dx < -CONSTANTS.SWIPE_THRESHOLD && direction !== 'right') {
                nextDirection = 'left';
            }
        } else {
            // 垂直滑动
            if (dy > CONSTANTS.SWIPE_THRESHOLD && direction !== 'up') {
                nextDirection = 'down';
            } else if (dy < -CONSTANTS.SWIPE_THRESHOLD && direction !== 'down') {
                nextDirection = 'up';
            }
        }
        
        // 方向改变时同步到Native
        syncGameStateToNative();
        
        e.preventDefault();
    }, false);

    // 添加键盘事件监听
    document.addEventListener('keydown', (e) => {
        if (gameOver) return;
        
        switch(e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                if (direction !== 'down') {
                    nextDirection = 'up';
                    // 方向改变时同步到Native
                    syncGameStateToNative();
                }
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                if (direction !== 'up') {
                    nextDirection = 'down';
                    syncGameStateToNative();
                }
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                if (direction !== 'right') {
                    nextDirection = 'left';
                    syncGameStateToNative();
                }
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                if (direction !== 'left') {
                    nextDirection = 'right';
                    syncGameStateToNative();
                }
                break;
            case ' ':
            case 'p':
            case 'P':
                togglePauseResume();
                break;
        }
    });

    // ================= 事件监听器和游戏初始化 =================

    // 添加开始/重新开始按钮事件
    startBtn.addEventListener('click', startGame);
    
    restartBtn.addEventListener('click', () => {
        if (gameLoop) {
            clearInterval(gameLoop);
            gameLoop = null;
        }
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        resetGame();
        // 使用恒定游戏速度
        gameSpeed = CONSTANTS.GAME_SPEED;
        startGame();
    });
    
    playAgainBtn.addEventListener('click', () => {
        gameOverModal.style.display = 'none';
        resetGame();
        // 使用恒定游戏速度
        gameSpeed = CONSTANTS.GAME_SPEED;
        startGame();
    });
    
    // 添加暂停/恢复按钮事件
    pauseResumeBtn.addEventListener('click', togglePauseResume);

    // 流转按钮
    var transferBtn = document.getElementById('transferBtn');
    if (transferBtn) {
        transferBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (gameStarted && !gameOver && window.JSBridge && typeof window.JSBridge.requestTransfer === 'function') {
                if (!gamePaused) {
                    gamePaused = true;
                    pauseResumeBtn.textContent = '继续';
                    if (gameLoop) { clearInterval(gameLoop); gameLoop = null; }
                }
                window.JSBridge.requestTransfer(JSON.stringify(window.getCurrentGameState()));
            }
        });
    }

    // 管理员触发按钮
    const adminTriggerBtn = document.getElementById('adminTriggerBtn');
    if (adminTriggerBtn) {
        adminTriggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (gameStarted && !gameOver) {
                requestAdminQA();
            }
        });
    }

    // 管理员弹窗：点击遮罩层关闭（等同选择"跳过"）
    const adminModal = document.getElementById('adminModal');
    if (adminModal) {
        adminModal.addEventListener('click', (e) => {
            if (e.target === adminModal) {
                // 点击的是遮罩层，不是内容区
                AdminSession._hideModal();
                resumeAfterAdmin();
            }
        });
    }

    // 处理窗口大小变化（游戏中也实时适配）
    var _resizeDebounce = null;
    window.addEventListener('resize', function() {
        if (_resizeDebounce) clearTimeout(_resizeDebounce);
        _resizeDebounce = setTimeout(function() {
            var wasRunning = gameStarted && !gamePaused && !gameOver;
            if (wasRunning && gameLoop) { clearInterval(gameLoop); gameLoop = null; }
            initCanvas();
            draw();
            if (wasRunning) {
                gameLoop = setInterval(function() { update(); draw(); }, gameSpeed);
            }
        }, 250);
    });
    window.addEventListener('orientationchange', function() {
        setTimeout(function() {
            var wasRunning = gameStarted && !gamePaused && !gameOver;
            if (wasRunning && gameLoop) { clearInterval(gameLoop); gameLoop = null; }
            initCanvas();
            draw();
            if (wasRunning) {
                gameLoop = setInterval(function() { update(); draw(); }, gameSpeed);
            }
        }, 300);
    });

    // 页面卸载前，确保当前状态已同步
    window.addEventListener('beforeunload', () => {
        syncGameStateToNative(true); // 使用强制同步
    });

    // 初始化游戏
    initGame();
    draw();
    
    // 创建旋转后的图像
    function createRotatedImage(sourceImg, angle) {
        if (!sourceImg || !sourceImg.complete) {
            return null;
        }
        
        // 创建临时画布
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = gridSize;
        tempCanvas.height = gridSize;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 在画布中心旋转并绘制
        tempCtx.save();
        tempCtx.translate(gridSize/2, gridSize/2);
        tempCtx.rotate(angle);
        tempCtx.drawImage(sourceImg, -gridSize/2, -gridSize/2, gridSize, gridSize);
        tempCtx.restore();
        
        return tempCanvas;
    }
    
    // 创建水平或垂直翻转的图像
    function createFlippedImage(sourceImg, flipH, flipV) {
        if (!sourceImg || !sourceImg.complete) {
            return null;
        }
        
        // 创建临时画布
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = gridSize;
        tempCanvas.height = gridSize;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 应用翻转
        tempCtx.save();
        if (flipH) {
            tempCtx.translate(gridSize, 0);
            tempCtx.scale(-1, 1);
        }
        if (flipV) {
            tempCtx.translate(0, gridSize);
            tempCtx.scale(1, -1);
        }
        tempCtx.drawImage(sourceImg, 0, 0, gridSize, gridSize);
        tempCtx.restore();
        
        return tempCanvas;
    }
});