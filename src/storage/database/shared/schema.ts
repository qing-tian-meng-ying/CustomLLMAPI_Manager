import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"

// 网关 API Key 表（给用户使用的 Key）
export const gatewayApiKeys = sqliteTable(
	"gateway_api_keys",
	{
		id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
		name: text("name").notNull(), // Key 名称
		key: text("key").notNull().unique(), // 实际的 API Key（sk-xxx 格式）
		is_active: integer("is_active", { mode: 'boolean' }).default(true).notNull(),
		rate_limit: integer("rate_limit"), // 每分钟请求限制
		total_requests: integer("total_requests").default(0).notNull(), // 总请求数
		total_tokens: integer("total_tokens").default(0).notNull(), // 总 token 数
		last_used_at: integer("last_used_at", { mode: 'timestamp' }), // 最后使用时间
		created_at: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
		updated_at: integer("updated_at", { mode: 'timestamp' }),
	},
	(table) => ({
		keyIdx: index("gateway_api_keys_key_idx").on(table.key),
		isActiveIdx: index("gateway_api_keys_is_active_idx").on(table.is_active),
	})
);

// 上游 API Key 配置表（配置的第三方服务商 Key）
export const apiKeys = sqliteTable(
	"api_keys",
	{
		id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
		name: text("name").notNull(),
		provider: text("provider").notNull(),
		base_url: text("base_url").notNull(),
		api_key: text("api_key").notNull(),
		models: text("models").notNull(), // JSON 数组，如 ["gpt-4o", "gpt-4o-mini"]
		is_active: integer("is_active", { mode: 'boolean' }).default(true).notNull(),
		is_default: integer("is_default", { mode: 'boolean' }).default(false).notNull(),
		priority: integer("priority").default(0).notNull(), // 优先级，数字越大优先级越高
		created_at: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
		updated_at: integer("updated_at", { mode: 'timestamp' }),
	},
	(table) => ({
		providerIdx: index("api_keys_provider_idx").on(table.provider),
		isActiveIdx: index("api_keys_is_active_idx").on(table.is_active),
		isDefaultIdx: index("api_keys_is_default_idx").on(table.is_default),
		priorityIdx: index("api_keys_priority_idx").on(table.priority),
	})
);

// 模型路由表：同一模型可绑定多个上游 Key，priority 数字越小优先级越高
export const modelRoutes = sqliteTable(
	"model_routes",
	{
		id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
		model: text("model").notNull(), // 展示用的模型名称
		model_key: text("model_key").notNull(), // 小写规范化名称，用于大小写无关匹配
		api_key_id: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
		priority: integer("priority").default(1).notNull(), // 1 为最高优先级
		is_active: integer("is_active", { mode: 'boolean' }).default(true).notNull(),
		created_at: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
		updated_at: integer("updated_at", { mode: 'timestamp' }),
	},
	(table) => ({
		modelKeyIdx: index("model_routes_model_key_idx").on(table.model_key),
		apiKeyIdIdx: index("model_routes_api_key_id_idx").on(table.api_key_id),
		modelPriorityIdx: index("model_routes_model_priority_idx").on(table.model_key, table.priority),
	})
);

// API 调用日志表
export const apiCallLogs = sqliteTable(
	"api_call_logs",
	{
		id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
		gateway_key_id: text("gateway_key_id").references(() => gatewayApiKeys.id), // 使用的网关 Key
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		api_key_id: text("api_key_id").references(() => apiKeys.id), // 使用的上游 Key
		endpoint: text("endpoint").notNull(),
		request_method: text("request_method").notNull(),
		request_headers: text("request_headers"), // JSON string
		request_body: text("request_body"), // JSON string
		request_tokens: integer("request_tokens"),
		response_status: integer("response_status"),
		response_body: text("response_body"), // JSON string
		response_tokens: integer("response_tokens"),
		total_tokens: integer("total_tokens"),
		duration_ms: integer("duration_ms"),
		error_message: text("error_message"),
		ip_address: text("ip_address"),
		user_agent: text("user_agent"),
		created_at: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
	},
	(table) => ({
		gatewayKeyIdIdx: index("api_call_logs_gateway_key_id_idx").on(table.gateway_key_id),
		providerIdx: index("api_call_logs_provider_idx").on(table.provider),
		modelIdx: index("api_call_logs_model_idx").on(table.model),
		createdAtIdx: index("api_call_logs_created_at_idx").on(table.created_at),
		apiKeyIdIdx: index("api_call_logs_api_key_id_idx").on(table.api_key_id),
	})
);
