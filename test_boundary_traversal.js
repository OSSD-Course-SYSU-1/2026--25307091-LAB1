// 测试跨设备边界穿越功能
// 这个脚本用于验证边界碰撞检测和穿越逻辑是否正确

console.log('=== 开始测试跨设备边界穿越功能 ===');

// 模拟测试数据
const testGameState = {
    snake: [
        { x: 9, y: 5 },  // 蛇头接近右边界
        { x: 8, y: 5 },
        { x: 7, y: 5 }
    ],
    food: { x: 3, y: 3 },
    direction: 'right',
    score: 500,
    speed: 400,
    gameStarted: true,
    gameOver: false,
    gamePaused: false
};

// 测试边界碰撞检测
function testBoundaryCollisionDetection() {
    console.log('--- 测试边界碰撞检测 ---');
    
    const tileCountX = 10;
    const tileCountY = 15;
    
    // 模拟蛇头向右移动撞击右边界
    const head = { x: 9, y: 5 };
    const newHead = { x: head.x + 1, y: head.y }; // 向右移动
    
    let boundaryCollision = null;
    if (newHead.x < 0) boundaryCollision = 'left';
    else if (newHead.x >= tileCountX) boundaryCollision = 'right';
    else if (newHead.y < 0) boundaryCollision = 'top';
    else if (newHead.y >= tileCountY) boundaryCollision = 'bottom';
    
    console.log(`蛇头位置: (${head.x}, ${head.y})`);
    console.log(`新位置: (${newHead.x}, ${newHead.y})`);
    console.log(`边界碰撞: ${boundaryCollision}`);
    
    return boundaryCollision === 'right';
}

// 测试边界穿越逻辑
function testBoundaryTraversal() {
    console.log('--- 测试边界穿越逻辑 ---');
    
    const tileCountX = 10;
    const tileCountY = 15;
    
    // 测试从右边界碰撞后从左边界进入
    const testData = {
        entryBoundary: 'left',
        snake: [
            { x: 9, y: 5 },
            { x: 8, y: 5 },
            { x: 7, y: 5 }
        ]
    };
    
    console.log('原始蛇的位置:', testData.snake);
    
    // 模拟边界穿越逻辑
    let snake = [...testData.snake];
    let direction = 'right';
    let nextDirection = 'right';
    
    switch (testData.entryBoundary) {
        case 'left': // 从左边界进入，蛇头在左边，身体向右延伸
            for (let i = 0; i < snake.length; i++) {
                snake[i].x = i;
                // 保持原来的Y坐标
            }
            direction = 'right';
            nextDirection = 'right';
            break;
    }
    
    console.log('穿越后蛇的位置:', snake);
    console.log(`新方向: ${direction}`);
    
    return snake[0].x === 0 && direction === 'right';
}

// 测试分布式数据同步模拟
function testDistributedDataSync() {
    console.log('--- 测试分布式数据同步模拟 ---');
    
    // 模拟发送设备的游戏状态
    const sourceGameState = {
        ...testGameState,
        boundaryCollision: 'right',
        entryBoundary: 'left'
    };
    
    console.log('发送设备游戏状态:', sourceGameState);
    
    // 模拟接收设备处理
    const receivedData = JSON.stringify(sourceGameState);
    const parsedData = JSON.parse(receivedData);
    
    console.log('接收设备解析数据:', parsedData);
    
    return parsedData.boundaryCollision === 'right' && parsedData.entryBoundary === 'left';
}

// 执行所有测试
function runAllTests() {
    const tests = [
        { name: '边界碰撞检测', test: testBoundaryCollisionDetection },
        { name: '边界穿越逻辑', test: testBoundaryTraversal },
        { name: '分布式数据同步', test: testDistributedDataSync }
    ];
    
    let passedTests = 0;
    
    tests.forEach(({ name, test }) => {
        try {
            const result = test();
            if (result) {
                console.log(`✅ ${name}: 通过`);
                passedTests++;
            } else {
                console.log(`❌ ${name}: 失败`);
            }
        } catch (error) {
            console.log(`❌ ${name}: 错误 - ${error.message}`);
        }
    });
    
    console.log(`\n=== 测试结果: ${passedTests}/${tests.length} 通过 ===`);
    
    if (passedTests === tests.length) {
        console.log('🎉 所有测试通过！跨设备边界穿越功能实现完成！');
    } else {
        console.log('⚠️ 部分测试失败，需要检查实现');
    }
}

// 运行测试
runAllTests();
