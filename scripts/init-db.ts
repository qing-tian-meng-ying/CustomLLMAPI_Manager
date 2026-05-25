/**
 * 数据库初始化脚本
 * 用于创建数据库表和插入示例数据
 */

import { getDatabase } from '../src/storage/database/sqlite-client';
import { apiKeys } from '../src/storage/database/shared/schema';

async function initDatabase() {
	console.log('🚀 开始初始化数据库...\n');
	
	try {
		// 获取数据库实例（会自动创建表）
		const db = getDatabase();
		
		console.log('✅ 数据库表创建成功\n');
		
		// 检查是否已有数据
		const existingKeys = await db.select().from(apiKeys).limit(1);
		
		if (existingKeys.length > 0) {
			console.log('ℹ️  数据库已包含数据，跳过示例数据插入');
			return;
		}
		
		// 插入示例 API Key（可选）
		console.log('📝 插入示例数据...\n');
		
		const exampleKeys = [
			{
				id: crypto.randomUUID(),
				name: 'OpenAI 示例',
				provider: 'openai',
				base_url: 'https://api.openai.com/v1',
				api_key: 'sk-example-key-replace-with-real-key',
				models: JSON.stringify(['gpt-4o-mini']), // 改为 models 数组
				is_active: false, // 默认不激活示例
				is_default: false,
				created_at: new Date(),
			},
			{
				id: crypto.randomUUID(),
				name: 'DeepSeek 示例',
				provider: 'deepseek',
				base_url: 'https://api.deepseek.com',
				api_key: 'sk-example-key-replace-with-real-key',
				models: JSON.stringify(['deepseek-chat']), // 改为 models 数组
				is_active: false,
				is_default: false,
				created_at: new Date(),
			},
		];
		
		for (const key of exampleKeys) {
			await db.insert(apiKeys).values(key);
			console.log(`  ✓ 已添加: ${key.name} (${key.provider})`);
		}
		
		console.log('\n✅ 数据库初始化完成！');
		console.log('\n📌 提示:');
		console.log('  - 示例 API Key 已添加但未激活');
		console.log('  - 请访问 http://localhost:5000/keys 管理 API Keys');
		console.log('  - 数据库文件位置: data/api-gateway.db\n');
		
	} catch (error) {
		console.error('❌ 数据库初始化失败:', error);
		process.exit(1);
	}
}

// 运行初始化
initDatabase();
