import * as dotenv from 'dotenv';

// 加载 .env 文件中的环境变量
dotenv.config();

/**
 * 从环境变量中读取整数，如果不存在或解析失败则返回默认值
 * @param key 环境变量键名
 * @param fallback 默认值
 * @returns 解析后的整数值或默认值
 */
const intFromEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  cacheTtlMs: intFromEnv("DAILY_HOT_CACHE_TTL_MS", 60_000),
  timeoutMs: intFromEnv("DAILY_HOT_TIMEOUT_MS", 10_000),
  maxConcurrency: intFromEnv("DAILY_HOT_MAX_CONCURRENCY", 6),
} as const;
