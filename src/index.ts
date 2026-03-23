#!/usr/bin/env node

import { Hono } from "hono";
import { TtlCache } from "./cache.js";
import { runWithConcurrency } from "./concurrency.js";
import { config } from "./config.js";
import { fetchHotList } from "./providers/index.js";
import { HOT_SOURCES } from "./sources.js";
import type { HotListItem } from "./types.js";

const cache = new TtlCache<HotListItem[]>();
const app = new Hono();

// CORS middleware
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  await next();
});

// Test endpoint
app.get('/test', (c) => {
  return c.json({ message: "Test endpoint works!" }, 200);
});

// API endpoints
app.get('/sources', (c) => {
  return c.json(HOT_SOURCES, 200);
});

app.get('/cache/stats', (c) => {
  return c.json(cache.stats, 200);
});

app.get('/cache/clear', (c) => {
  cache.clear();
  return c.json({ ok: true }, 200);
});

// 处理热榜数据: /{sourcename}获取单个或多个热榜的接口
app.get('/:sources', async (c) => {
  try {
    const sourceStr = c.req.param('sources');
    const sources = sourceStr.split(',').map(s => s.trim());
    
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    const cacheTtlMs = c.req.query('cacheTtlMs') ? Number(c.req.query('cacheTtlMs')) : config.cacheTtlMs;
    const forceRefresh = c.req.query('forceRefresh') === 'true';
    const timeoutMs = c.req.query('timeoutMs') ? Number(c.req.query('timeoutMs')) : undefined;
    const concurrency = c.req.query('concurrency') ? Number(c.req.query('concurrency')) : undefined;
    const merge = c.req.query('merge') === 'true';
    const fields = c.req.query('fields') ? c.req.query('fields')?.split(',').map(f => f.trim()) : undefined;

    if (sources.length === 0) {
      return c.json({ error: "Missing required parameter: sources" }, 400);
    }

    // 处理字段过滤函数
    const filterFields = (items: HotListItem[]) => {
      if (!fields || fields.length === 0) {
        return items;
      }
      return items.map(item => {
        const filteredItem: HotListItem = {} as HotListItem;
        fields.forEach(field => {
          if (field in item) {
            filteredItem[field] = item[field];
          }
        });
        return filteredItem;
      });
    };

    // 单个来源的处理逻辑
    if (sources.length === 1) {
      const source = sources[0];
      const cacheKey = JSON.stringify({ source });
      const cached = await cache.getOrSet(
        cacheKey,
        cacheTtlMs,
        () => fetchHotList(source, { timeoutMs: timeoutMs ?? config.timeoutMs }),
        { forceRefresh }
      );

      let data = limit ? cached.value.slice(0, limit) : cached.value;
      data = filterFields(data);
      
      return c.json({
        source,
        cached: cached.cached,
        fromCache: cached.cached,
        expiresAt: cached.expiresAt,
        updateTime: new Date(cached.expiresAt - cacheTtlMs).toISOString(),
        total: data.length,
        data,
      }, 200);
    }

    // 多个来源的处理逻辑
    const results = await runWithConcurrency(sources, concurrency ?? config.maxConcurrency, async (source: string, index: number) => {
      try {
        const cacheKey = JSON.stringify({ source });
        const cached = await cache.getOrSet(
          cacheKey,
          cacheTtlMs,
          () => fetchHotList(source, { timeoutMs: timeoutMs ?? config.timeoutMs }),
          { forceRefresh }
        );
        
        // 计算每个源应分配的limit数量
        let sourceLimit: number | undefined;
        if (limit) {
          const baseLimit = Math.floor(limit / sources.length);
          const remainder = limit % sources.length;
          sourceLimit = baseLimit + (index < remainder ? 1 : 0);
        }
        
        let data = sourceLimit ? cached.value.slice(0, sourceLimit) : cached.value;
        data = filterFields(data);
        return { 
          source, 
          cached: cached.cached, 
          fromCache: cached.cached, 
          expiresAt: cached.expiresAt, 
          updateTime: new Date(cached.expiresAt - cacheTtlMs).toISOString(), 
          total: data.length, 
          data };
      } catch (error) {
        return { source, error: error instanceof Error ? error.message : String(error), data: [] };
      }
    });

    // 合并多个来源的数据
    if (merge) {
      // 合并所有来源的data
      let mergedData: HotListItem[] = [];
      results.forEach(result => {
        // 为每个item添加source字段，以便区分来源
        const dataWithSource = result.data.map(item => ({
          ...item,
          source: result.source
        }));
        mergedData = [...mergedData, ...dataWithSource];
      });
      
      // 按热度排序（如果有hot字段）
      mergedData.sort((a, b) => {
        const hotA = typeof a.hot === 'string' ? parseInt(a.hot) : a.hot || 0;
        const hotB = typeof b.hot === 'string' ? parseInt(b.hot) : b.hot || 0;
        return hotB - hotA;
      });
      
      // 应用limit
      if (limit) {
        mergedData = mergedData.slice(0, limit);
      }
      
      // 对合并后的数据应用字段过滤
      mergedData = filterFields(mergedData);
      
      const expiresAtValues = results.map(r => r.expiresAt).filter((exp): exp is number => exp !== undefined);
      const minExpiresAt = expiresAtValues.length > 0 ? Math.min(...expiresAtValues) : Date.now() + cacheTtlMs;
      return c.json({
        source: sources.join(','),
        cached: results.some(r => r.cached),
        fromCache: results.some(r => r.cached),
        expiresAt: minExpiresAt,
        updateTime: new Date(minExpiresAt - cacheTtlMs).toISOString(),
        total: mergedData.length,
        data: mergedData,
      }, 200);
    }

    // 默认不合并，返回原始格式
    return c.json({
      total: results.length,
      results,
    }, 200);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// RSS feed endpoint
app.get('/rss/:sources', async (c) => {
  try {
    const sourceStr = c.req.param('sources');
    const sources = sourceStr.split(',').map(s => s.trim());
    
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    const cacheTtlMs = c.req.query('cacheTtlMs') ? Number(c.req.query('cacheTtlMs')) : config.cacheTtlMs;
    const forceRefresh = c.req.query('forceRefresh') === 'true';
    const timeoutMs = c.req.query('timeoutMs') ? Number(c.req.query('timeoutMs')) : undefined;
    const concurrency = c.req.query('concurrency') ? Number(c.req.query('concurrency')) : undefined;
    const merge = c.req.query('merge') === 'true';

    if (sources.length === 0) {
      return c.json({ error: "Missing required parameter: sources" }, 400);
    }

    // 单个来源的处理逻辑
    if (sources.length === 1) {
      const source = sources[0];
      const cacheKey = JSON.stringify({ source });
      const cached = await cache.getOrSet(
        cacheKey,
        cacheTtlMs,
        () => fetchHotList(source, { timeoutMs: timeoutMs ?? config.timeoutMs }),
        { forceRefresh }
      );

      let data = limit ? cached.value.slice(0, limit) : cached.value;
      
      const updateTime = new Date(cached.expiresAt - cacheTtlMs).toISOString();
      return c.body(
        generateRssFeed(source, data, updateTime),
        200,
        { 'Content-Type': 'application/rss+xml; charset=utf-8' }
      );
    }

    // 计算最小expiresAt值以确定updateTime
    const resultsWithExpiresAt = await runWithConcurrency(sources, concurrency ?? config.maxConcurrency, async (source: string, index: number) => {
      try {
        const cacheKey = JSON.stringify({ source });
        const cached = await cache.getOrSet(
          cacheKey,
          cacheTtlMs,
          () => fetchHotList(source, { timeoutMs: timeoutMs ?? config.timeoutMs }),
          { forceRefresh }
        );
        
        // 计算每个源应分配的limit数量
        let sourceLimit: number | undefined;
        if (limit) {
          const baseLimit = Math.floor(limit / sources.length);
          const remainder = limit % sources.length;
          sourceLimit = baseLimit + (index < remainder ? 1 : 0);
        }
        
        return {
          items: sourceLimit ? cached.value.slice(0, sourceLimit) : cached.value,
          expiresAt: cached.expiresAt
        };
      } catch (error) {
        return { items: [], expiresAt: Date.now() + cacheTtlMs };
      }
    });
    
    // 提取items和计算最小expiresAt
    const itemsList = resultsWithExpiresAt.map(r => r.items);
    const expiresAtValues = resultsWithExpiresAt.map(r => r.expiresAt);
    const minExpiresAt = Math.min(...expiresAtValues);
    const updateTime = new Date(minExpiresAt - cacheTtlMs).toISOString();
    
    // 合并多个来源的数据
    let allItems: HotListItem[] = [];
    if (merge) {
      // 合并所有来源的数据
      itemsList.forEach((items, index) => {
        const source = sources[index];
        const itemsWithSource = items.map(item => ({
          ...item,
          source
        }));
        allItems = [...allItems, ...itemsWithSource];
      });
      
      // 按热度排序（如果有hot字段）
      allItems.sort((a, b) => {
        const hotA = typeof a.hot === 'string' ? parseInt(a.hot) : a.hot || 0;
        const hotB = typeof b.hot === 'string' ? parseInt(b.hot) : b.hot || 0;
        return hotB - hotA;
      });
      
      // 应用limit
      if (limit) {
        allItems = allItems.slice(0, limit);
      }
    } else {
      // 不合并，按来源顺序添加
      itemsList.forEach((items, index) => {
        const source = sources[index];
        const itemsWithSource = items.map(item => ({
          ...item,
          source
        }));
        allItems = [...allItems, ...itemsWithSource];
      });
    }

    return c.body(
      generateRssFeed(sources.join(','), allItems, updateTime),
      200,
      { 'Content-Type': 'application/rss+xml; charset=utf-8' }
    );
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// 获取来源标签的函数
function getSourceLabel(sourceInput: string): string {
  const sources = sourceInput.split(',');
  const labels = sources.map(sourceId => {
    const source = HOT_SOURCES.find(s => s.id === sourceId.trim());
    return source ? source.label + `-${source.tip}` || source.label : sourceId.trim();
  });
  return labels.join(', ');
}

// 生成RSS feed的函数
function generateRssFeed(source: string, items: HotListItem[], updateTime?: string): string {
  const now = updateTime || new Date().toISOString();
  const sourceLabel = getSourceLabel(source);
  const feedTitle = `Daily Hot - ${sourceLabel}`;
  const feedDescription = `Hot trends from ${sourceLabel}`;
  const feedLink = `/${source}`;
  
  const rssItems = items.map(item => {
    const title = escapeXml(item.title || '');
    const link = item.url || item.mobileUrl || '';
    const description = escapeXml(item.desc || item.title || '');
    const pubDate = new Date().toUTCString();
    const guid = item.id ? item.id.toString() : link;
    
    return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <guid>${guid}</guid>
    </item>`;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${feedTitle}</title>
    <description>${feedDescription}</description>
    <link>${feedLink}</link>
    <lastBuildDate>${now}</lastBuildDate>
    <pubDate>${now}</pubDate>
${rssItems}
  </channel>
</rss>`;
}

// XML转义函数
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Default response
app.get('*', (c) => {
  return c.json({ message: "Welcome to Daily Hot API" }, 200);
});

const port = 4000;
console.log(`Server running on port :${port}`);
export default { port, fetch: app.fetch };
