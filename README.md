# daily-hot-api

**热榜数据查询服务**：提供多个平台热榜数据查询，并支持 **高性能内存 TTL 缓存**（可配置缓存时间）。

## 依赖

- Bun >=1.3.2

## 运行方式

构建并启动服务：

```bash
cd daily-hot-api
bun i
bun run start
# 调试模式
bun run dev
```

## 环境变量

- `DAILY_HOT_CACHE_TTL_MS`：默认缓存毫秒数，默认 `60000`
- `DAILY_HOT_TIMEOUT_MS`：请求超时毫秒数，默认 `10000`
- `DAILY_HOT_MAX_CONCURRENCY`：批量请求最大并发，默认 `6`

## API 接口

### 1. 测试接口

- **路径**：`/test`
- **方法**：GET
- **描述**：测试服务是否正常运行
- **响应**：`{ "message": "Test endpoint works!" }`

### 2. 获取热榜来源

- **路径**：`/sources`
- **方法**：GET
- **描述**：获取所有支持的热榜来源列表
- **响应**：热榜来源数组，每个元素包含 `id`、`label` 和 `tip` 字段

### 3. 获取缓存统计

- **路径**：`/cache/stats`
- **方法**：GET
- **描述**：查看缓存命中统计信息
- **响应**：缓存统计数据，包含 `hits`（命中次数）、`misses`（未命中次数）和 `size`（当前缓存大小）

### 4. 清空缓存

- **路径**：`/cache/clear`
- **方法**：GET
- **描述**：清空所有缓存数据
- **响应**：`{ "ok": true }`

### 5. 获取热榜数据

- **路径**：`/:sources`
- **方法**：GET
- **描述**：获取单个或多个热榜数据
- **参数**：
  - **路径参数**：
    - `sources`：热榜来源名称，多个来源用逗号分隔
  - **查询参数**：
    - `limit`：限制返回数量（可选）
    - `cacheTtlMs`：缓存时间（毫秒）（可选）
    - `forceRefresh`：是否强制刷新缓存（可选，值为 `true` 时强制刷新）
    - `timeoutMs`：请求超时时间（毫秒）（可选）
    - `concurrency`：并发请求数量（可选，仅在获取多个热榜时有效）
    - `merge`：是否合并多个热榜数据（可选，值为 `true` 时合并）
    - `fields`：字段过滤，只返回指定的字段（可选，多个字段用逗号分隔）
- **响应**：
  - 单个热榜：包含热榜数据、缓存状态等信息
  - 多个热榜（未合并）：包含多个热榜的结果数组
  - 多个热榜（合并）：包含合并后的热榜数据，按热度排序

## 支持的热榜来源

| ID              | 名称          | 说明           |
| --------------- | ----------- | ------------ |
| weibo           | 微博          | 热搜榜          |
| xiaohongshu     | 小红书         | 实时热榜         |
| bilibili        | 哔哩哔哩        | 热门榜          |
| douyin          | 抖音          | 热点榜          |
| toutiao         | 今日头条        | 热榜           |
| zhihu           | 知乎          | 热榜           |
| baidu           | 百度          | 热搜榜（无desc字段） |
| baidu-realtime  | 百度          | 实时热搜         |
| baidu-movie     | 百度          | 电影榜          |
| baidu-teleplay  | 百度          | 电视剧榜         |
| baidu-novel     | 百度          | 小说榜          |
| baidu-car       | 百度          | 汽车榜          |
| baidu-game      | 百度          | 游戏榜          |
| baidutieba      | 百度贴吧        | 热议榜          |
| qq              | 腾讯新闻        | 热点榜          |
| hupu            | 虎扑          | 步行街热帖        |
| juejin          | 稀土掘金        | 热榜           |
| github-trending | Github      | 热门仓库         |
| hello-github    | HelloGithub | 精选           |
| csdn            | CSDN        | 热榜           |
| netease         | 网易新闻        | 热榜           |
| quark           | 夸克          | 今日热点         |
| lol             | 英雄联盟        | 更新公告         |
| thepaper        | 澎湃新闻        | 热榜           |
| kuaishou        | 快手          | 热榜           |
| dongchedi       | 懂车帝         | 热搜榜          |
| history-today   | 百度百科        | 历史上的今天       |
| weread          | 微信读书        | 飙升榜          |
| douban-movic    | 豆瓣电影        | 新片榜          |
| netease-music   | 网易云音乐       | 热歌榜          |
| woshipm         | 人人都是产品经理    | 热榜           |
| 36kr            | 36氪         | 24小时热榜       |
| huxiu           | 虎嗅          | 最新资讯         |
| zhihu-daily     | 知乎日报        | 推荐榜          |
| ifanr           | 爱范儿         | 快讯           |
| ithome          | IT之家        | 热榜           |
| 51cto           | 51CTO         | 推荐榜         |
| 52pojie         | 吾爱破解        | 榜单           |
| acfun           | AcFun         | 排行榜         |
| coolapk         | 酷安          | 热榜           |
| dgtle           | 数字尾巴        | 热门           |
| douban-group    | 豆瓣讨论小组      | 讨论精选         |
| earthquake      | 中国地震台       | 地震速报         |
| genshin         | 原神          | 最新消息         |
| guokr           | 果壳          | 热门文章         |
| hackernews      | Hacker News   | 热门           |
| honkai          | 崩坏3         | 最新动态         |
| hostloc         | 全球主机交流      | 榜单           |
| ithome-xijiayi  | IT之家        | 喜加一         |
| jianshu         | 简书          | 热门推荐         |
| miyoushe        | 米游社         | 最新消息         |
| netease-news    | 网易新闻        | 热点榜         |
| ngabbs          | NGA          | 热帖           |
| nodeseek        | NodeSeek      | 最新动态         |
| qq-news         | 腾讯新闻        | 热点榜         |
| sina-news       | 新浪新闻        | 热点榜         |
| sina            | 新浪网         | 热榜           |
| smzdm           | 什么值得买       | 热门           |
| sspai           | 少数派         | 热榜           |
| starrail        | 崩坏：星穹铁道     | 最新动态         |
| v2ex            | V2EX         | 主题榜         |
| weatheralarm    | 中央气象台       | 全国气象预警       |

## 使用范例

### 1. 测试服务

```bash
curl http://localhost:4000/test
```

### 2. 获取热榜来源

```bash
curl http://localhost:4000/sources
```

### 3. 获取单个热榜数据

```bash
# 获取知乎热榜（默认缓存）
curl http://localhost:4000/zhihu

# 获取微博热榜，限制返回5条
curl http://localhost:4000/weibo?limit=5

# 获取抖音热榜，强制刷新缓存
curl http://localhost:4000/douyin?forceRefresh=true

# 获取B站热榜，设置缓存时间为30秒
curl http://localhost:4000/bilibili?cacheTtlMs=30000

# 获取GitHub热榜，只返回标题和链接字段
curl http://localhost:4000/github-trending?fields=title,url
```

### 4. 批量获取多个热榜数据

```bash
# 同时获取知乎和微博热榜
curl http://localhost:4000/zhihu,weibo

# 同时获取多个热榜，限制返回3条
curl http://localhost:4000/zhihu,weibo,douyin?limit=3

# 同时获取多个热榜并合并数据
curl http://localhost:4000/zhihu,weibo,douyin?merge=true

# 同时获取多个热榜，合并数据并只返回标题和热度字段
curl http://localhost:4000/zhihu,weibo,douyin?merge=true&fields=title,hot
```

### 5. 查看缓存统计

```bash
curl http://localhost:4000/cache/stats
```

### 6. 清空缓存

```bash
curl http://localhost:4000/cache/clear
```

## 响应格式说明

### 单个热榜响应

```json
{
  "source": "zhihu",
  "cached": false,
  "fromCache": false,
  "expiresAt": 1711344000000,
  "updateTime": "2026-03-25T12:00:00.000Z",
  "total": 10,
  "data": [
    {
      "title": "示例标题",
      "url": "https://example.com",
      "hot": "10000",
      "desc": "示例描述"
    },
    // 更多热榜数据...
  ]
}
```

### 多个热榜响应（未合并）

```json
{
  "total": 2,
  "results": [
    {
      "source": "zhihu",
      "cached": false,
      "fromCache": false,
      "expiresAt": 1711344000000,
      "updateTime": "2026-03-25T12:00:00.000Z",
      "total": 10,
      "data": [
        // 知乎热榜数据...
      ]
    },
    {
      "source": "weibo",
      "cached": false,
      "fromCache": false,
      "expiresAt": 1711344000000,
      "updateTime": "2026-03-25T12:00:00.000Z",
      "total": 10,
      "data": [
        // 微博热榜数据...
      ]
    }
  ]
}
```

### 多个热榜响应（合并）

```json
{
  "source": "zhihu,weibo",
  "cached": false,
  "fromCache": false,
  "expiresAt": 1711344000000,
  "updateTime": "2026-03-25T12:00:00.000Z",
  "total": 20,
  "data": [
    {
      "title": "示例标题1",
      "url": "https://example.com/1",
      "hot": "10000",
      "desc": "示例描述1",
      "source": "zhihu"
    },
    {
      "title": "示例标题2",
      "url": "https://example.com/2",
      "hot": "9000",
      "desc": "示例描述2",
      "source": "weibo"
    },
    // 更多合并后的数据...
  ]
}
```

## ⚠️ 免责声明

> ⚠️ **重要提醒：请仔细阅读以下声明**

### 📋 使用条款

1. **数据来源**：本项目通过公开 API 和网页抓取获取数据，仅供学习和研究使用
2. **合规使用**：用户需遵守各平台的使用条款和相关法律法规
3. **商业使用**：禁止将本项目用于任何商业用途
4. **数据准确性**：不保证数据的实时性和准确性

### 🛡️ 责任限制

- 本项目仅供技术研究和学习交流使用
- 任何因使用本项目产生的法律风险由使用者自行承担
- 如有平台方要求移除相关接口，请及时联系我们处理
- 项目维护者不承担任何直接或间接的损失责任

