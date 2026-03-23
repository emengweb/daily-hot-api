import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";
import dayjs from "dayjs";

import type { HotListItem } from "../types.js";

export type FetchHotListOptions = {
  timeoutMs: number;
};

export type HotListProvider = (options: FetchHotListOptions) => Promise<HotListItem[]>;

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const fetchWithTimeout = async (url: string, init: RequestInit | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchJson = async <T>(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<T> => {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
};

const fetchText = async (url: string, init: RequestInit | undefined, timeoutMs: number): Promise<string> => {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
};

const getWereadID = (bookId: string) => {
  const str = CryptoJS.MD5(bookId).toString();
  let strSub = str.substring(0, 3);
  let fa: [string, string[]];

  if (/^\d*$/.test(bookId)) {
    const chunks: string[] = [];
    for (let i = 0; i < bookId.length; i += 9) {
      const chunk = bookId.substring(i, i + 9);
      chunks.push(parseInt(chunk, 10).toString(16));
    }
    fa = ["3", chunks];
  } else {
    let hexStr = "";
    for (let i = 0; i < bookId.length; i++) {
      hexStr += bookId.charCodeAt(i).toString(16);
    }
    fa = ["4", [hexStr]];
  }

  strSub += fa[0];
  strSub += "2" + str.substring(str.length - 2);
  for (let i = 0; i < fa[1].length; i++) {
    const sub = fa[1][i];
    const subLength = sub.length.toString(16);
    const subLengthPadded = subLength.length === 1 ? "0" + subLength : subLength;
    strSub += subLengthPadded + sub;
    if (i < fa[1].length - 1) {
      strSub += "g";
    }
  }

  if (strSub.length < 20) {
    strSub += str.substring(0, 20 - strSub.length);
  }

  const finalStr = CryptoJS.MD5(strSub).toString();
  strSub += finalStr.substring(0, 3);
  return strSub;
};

const convertMillisecondsToTime = (milliseconds: number): string => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor(milliseconds / (1000 * 60));
  const formattedSeconds = seconds < 10 ? "0" + seconds : seconds.toString();
  const formattedMinutes = minutes < 10 ? "0" + minutes : minutes.toString();
  return `${formattedMinutes}:${formattedSeconds}`;
};

const formatGithubStars = (count: number): string => {
  if (count < 1000) return count.toString();
  if (count < 1_000_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
};

export const providers: Record<string, HotListProvider> = {
  weibo: async ({ timeoutMs }) => {
    const url = "https://weibo.com/ajax/side/hotSearch";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          Referer: "https://weibo.com/",
          Accept: "application/json",
        },
      },
      timeoutMs
    );
    if (body.ok !== 1) return [];
    return (body.data?.realtime ?? []).map((v: any) => {
      const key = v.word_scheme ? v.word_scheme : `#${v.word}`;
      return {
        id: v.mid,
        title: v.word,
        desc: key,
        hot: v.num,
        label: v.label_name,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(key)}&t=31&band_rank=1&Refer=top`,
        mobileUrl: `https://s.weibo.com/weibo?q=${encodeURIComponent(key)}&t=31&band_rank=1&Refer=top`,
      } satisfies HotListItem;
    });
  },

  xiaohongshu: async ({ timeoutMs }) => {
    const url = "https://edith.xiaohongshu.com/api/sns/v1/search/hot_list";
    const xhsHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.7(0x18000733) NetType/WIFI Language/zh_CN",
      referer: "https://app.xhs.cn/",
      "xy-direction": "22",
      shield:
        "XYAAAAAQAAAAEAAABTAAAAUzUWEe4xG1IYD9/c+qCLOlKGmTtFa+lG434Oe+FTRagxxoaz6rUWSZ3+juJYz8RZqct+oNMyZQxLEBaBEL+H3i0RhOBVGrauzVSARchIWFYwbwkV",
      "xy-platform-info":
        "platform=iOS&version=8.7&build=8070515&deviceId=C323D3A5-6A27-4CE6-AA0E-51C9D4C26A24&bundle=com.xingin.discover",
      "xy-common-params":
        "app_id=ECFAAF02&build=8070515&channel=AppStore&deviceId=C323D3A5-6A27-4CE6-AA0E-51C9D4C26A24&device_fingerprint=20230920120211bd7b71a80778509cf4211099ea911000010d2f20f6050264&device_fingerprint1=20230920120211bd7b71a80778509cf4211099ea911000010d2f20f6050264&device_model=phone&fid=1695182528-0-0-63b29d709954a1bb8c8733eb2fb58f29&gid=7dc4f3d168c355f1a886c54a898c6ef21fe7b9a847359afc77fc24ad&identifier_flag=0&lang=zh-Hans&launch_id=716882697&platform=iOS&project_id=ECFAAF&sid=session.1695189743787849952190&t=1695190591&teenager=0&tz=Asia/Shanghai&uis=light&version=8.7",
    };
    const body = await fetchJson<any>(url, { headers: xhsHeaders }, timeoutMs);
    if (!body.success) return [];
    return (body.data?.items ?? []).map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        hot: v.score,
        label: !v.word_type || v.word_type === "无" ? undefined : v.word_type,
        url: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(v.title)}`,
        mobileUrl: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(v.title)}`,
      } satisfies HotListItem;
    });
  },

  bilibili: async ({ timeoutMs }) => {
    const url = "https://api.bilibili.com/x/web-interface/ranking/v2";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          Referer: "https://www.bilibili.com/ranking/all",
          "User-Agent": DEFAULT_USER_AGENT,
        },
      },
      timeoutMs
    );
    const data = body?.data?.realtime || body?.data?.list;
    if (!data) return [];
    return data.map((v: any) => {
      return {
        id: v.bvid,
        title: v.title,
        desc: v.desc,
        pic: String(v.pic || "").replace(/http:/, "https:"),
        hot: v.stat?.view,
        url: v.short_link_v2 || `https://b23.tv/${v.bvid}`,
        mobileUrl: `https://m.bilibili.com/video/${v.bvid}`,
      } satisfies HotListItem;
    });
  },

  douyin: async ({ timeoutMs }) => {
    const url = "https://aweme.snssdk.com/aweme/v1/hot/search/list/";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.status_code !== 0) return [];
    return (body.data?.word_list ?? []).map((v: any) => {
      return {
        id: v.group_id,
        title: v.word,
        pic: `${v.word_cover?.url_list?.[0] ?? ""}`,
        hot: Number(v.hot_value),
        url: `https://www.douyin.com/hot/${encodeURIComponent(v.sentence_id)}`,
        mobileUrl: `https://www.douyin.com/hot/${encodeURIComponent(v.sentence_id)}`,
      } satisfies HotListItem;
    });
  },

  toutiao: async ({ timeoutMs }) => {
    const url = "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.status !== "success") return [];
    return (body.data ?? []).map((v: any) => {
      return {
        id: v.ClusterId,
        title: v.Title,
        pic: v.Image?.url,
        hot: v.HotValue,
        url: `https://www.toutiao.com/trending/${v.ClusterIdStr}/`,
        mobileUrl: `https://api.toutiaoapi.com/feoffline/amos_land/new/html/main/index.html?topic_id=${v.ClusterIdStr}`,
      } satisfies HotListItem;
    });
  },

  zhihu: async ({ timeoutMs }) => {
    const url = "https://api.zhihu.com/topstory/hot-list";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (!body.data) return [];
    return body.data.map((v: any) => {
      const rawHot = parseInt(String(v.detail_text || "").replace(/[^\d]/g, ""), 10);
      return {
        id: v.id,
        title: v.target?.title,
        desc: v.target?.excerpt || v.target?.description,
        pic: v.children?.[0]?.thumbnail,
        hot: (Number.isFinite(rawHot) ? rawHot : 0) * 10000,
        url: `https://www.zhihu.com/question/${String(v.card_id || "").replace("Q_", "")}`,
        mobileUrl: `https://www.zhihu.com/question/${String(v.card_id || "").replace("Q_", "")}`,
      } satisfies HotListItem;
    });
  },

  baidu: async ({ timeoutMs }) => {
    const url = "https://top.baidu.com/api/board?platform=wise&tab=realtime";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (!body.success) return [];
    const list = body.data?.cards?.[0]?.content?.[0]?.content ?? [];
    return list.map((v: any) => {
      return {
        id: v.index,
        title: v.word,
        label: v.newHotName,
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(v.word)}`,
        mobileUrl: v.url,
      } satisfies HotListItem;
    });
  },

  "baidu-realtime": async ({ timeoutMs }) => {
    const url = "https://top.baidu.com/board?tab=realtime";
    const html = await fetchText(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      },
      timeoutMs
    );
    const pattern = /<!--s-data:(.*?)-->/s;
    const matchResult = html.match(pattern);
    if (!matchResult) {
      return [];
    }
    let jsonObject: any[] = [];
    try {
      const sData = JSON.parse(matchResult[1]);
      const cardContent = sData.data?.cards?.[0]?.content ?? sData.cards?.[0]?.content;
      if (Array.isArray(cardContent)) {
        if (cardContent.length > 0 && Array.isArray(cardContent[0]?.content)) {
          jsonObject = cardContent[0].content!;
        } else {
          jsonObject = cardContent;
        }
      }
    } catch {
      jsonObject = [];
    }
    return jsonObject.map((v, index: number) => {
      const title = v.word ?? v.title ?? "";
      return {
        id: v.index ?? index + 1,
        title,
        desc: v.desc ?? "",
        cover: v.img ?? v.imgInfo?.src ?? "",
        author: v.show?.length ? v.show : "",
        hot: parseInt((v.hotScore ?? v.hotTag ?? "0").toString(), 10) || 0,
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(v.query ?? title)}`,
        mobileUrl: v.rawUrl ?? v.url ?? "",
      } satisfies HotListItem;
    });
  },

  "baidu-movie": async ({ timeoutMs }) => {
    const url = "https://top.baidu.com/board?tab=movie";
    const html = await fetchText(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      },
      timeoutMs
    );
    const pattern = /<!--s-data:(.*?)-->/s;
    const matchResult = html.match(pattern);
    if (!matchResult) {
      return [];
    }
    let jsonObject: any[] = [];
    try {
      const sData = JSON.parse(matchResult[1]);
      const cardContent = sData.data?.cards?.[0]?.content ?? sData.cards?.[0]?.content;
      if (Array.isArray(cardContent)) {
        if (cardContent.length > 0 && Array.isArray(cardContent[0]?.content)) {
          jsonObject = cardContent[0].content!;
        } else {
          jsonObject = cardContent;
        }
      }
    } catch {
      jsonObject = [];
    }
    return jsonObject.map((v, index: number) => {
      const title = v.word ?? v.title ?? "";
      return {
        id: v.index ?? index + 1,
        title,
        desc: v.desc ?? "",
        cover: v.img ?? v.imgInfo?.src ?? "",
        author: v.show?.length ? v.show : "",
        hot: parseInt((v.hotScore ?? v.hotTag ?? "0").toString(), 10) || 0,
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(v.query ?? title)}`,
        mobileUrl: v.rawUrl ?? v.url ?? "",
      } satisfies HotListItem;
    });
  },

  "baidu-teleplay": async ({ timeoutMs }) => {
    const url = "https://top.baidu.com/board?tab=teleplay";
    const html = await fetchText(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      },
      timeoutMs
    );
    const pattern = /<!--s-data:(.*?)-->/s;
    const matchResult = html.match(pattern);
    if (!matchResult) {
      return [];
    }
    let jsonObject: any[] = [];
    try {
      const sData = JSON.parse(matchResult[1]);
      const cardContent = sData.data?.cards?.[0]?.content ?? sData.cards?.[0]?.content;
      if (Array.isArray(cardContent)) {
        if (cardContent.length > 0 && Array.isArray(cardContent[0]?.content)) {
          jsonObject = cardContent[0].content!;
        } else {
          jsonObject = cardContent;
        }
      }
    } catch {
      jsonObject = [];
    }
    return jsonObject.map((v, index: number) => {
      const title = v.word ?? v.title ?? "";
      return {
        id: v.index ?? index + 1,
        title,
        desc: v.desc ?? "",
        cover: v.img ?? v.imgInfo?.src ?? "",
        author: v.show?.length ? v.show : "",
        hot: parseInt((v.hotScore ?? v.hotTag ?? "0").toString(), 10) || 0,
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(v.query ?? title)}`,
        mobileUrl: v.rawUrl ?? v.url ?? "",
      } satisfies HotListItem;
    });
  },

  "baidu-novel": async ({ timeoutMs }) => {
    const url = "https://top.baidu.com/board?tab=novel";
    const html = await fetchText(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      },
      timeoutMs
    );
    const pattern = /<!--s-data:(.*?)-->/s;
    const matchResult = html.match(pattern);
    if (!matchResult) {
      return [];
    }
    let jsonObject: any[] = [];
    try {
      const sData = JSON.parse(matchResult[1]);
      const cardContent = sData.data?.cards?.[0]?.content ?? sData.cards?.[0]?.content;
      if (Array.isArray(cardContent)) {
        if (cardContent.length > 0 && Array.isArray(cardContent[0]?.content)) {
          jsonObject = cardContent[0].content!;
        } else {
          jsonObject = cardContent;
        }
      }
    } catch {
      jsonObject = [];
    }
    return jsonObject.map((v, index: number) => {
      const title = v.word ?? v.title ?? "";
      return {
        id: v.index ?? index + 1,
        title,
        desc: v.desc ?? "",
        cover: v.img ?? v.imgInfo?.src ?? "",
        author: v.show?.length ? v.show : "",
        hot: parseInt((v.hotScore ?? v.hotTag ?? "0").toString(), 10) || 0,
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(v.query ?? title)}`,
        mobileUrl: v.rawUrl ?? v.url ?? "",
      } satisfies HotListItem;
    });
  },

  "baidu-car": async ({ timeoutMs }) => {
    const url = "https://top.baidu.com/board?tab=car";
    const html = await fetchText(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      },
      timeoutMs
    );
    const pattern = /<!--s-data:(.*?)-->/s;
    const matchResult = html.match(pattern);
    if (!matchResult) {
      return [];
    }
    let jsonObject: any[] = [];
    try {
      const sData = JSON.parse(matchResult[1]);
      const cardContent = sData.data?.cards?.[0]?.content ?? sData.cards?.[0]?.content;
      if (Array.isArray(cardContent)) {
        if (cardContent.length > 0 && Array.isArray(cardContent[0]?.content)) {
          jsonObject = cardContent[0].content!;
        } else {
          jsonObject = cardContent;
        }
      }
    } catch {
      jsonObject = [];
    }
    return jsonObject.map((v, index: number) => {
      const title = v.word ?? v.title ?? "";
      return {
        id: v.index ?? index + 1,
        title,
        desc: v.desc ?? "",
        cover: v.img ?? v.imgInfo?.src ?? "",
        author: v.show?.length ? v.show : "",
        hot: parseInt((v.hotScore ?? v.hotTag ?? "0").toString(), 10) || 0,
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(v.query ?? title)}`,
        mobileUrl: v.rawUrl ?? v.url ?? "",
      } satisfies HotListItem;
    });
  },

  "baidu-game": async ({ timeoutMs }) => {
    const url = "https://top.baidu.com/board?tab=game";
    const html = await fetchText(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      },
      timeoutMs
    );
    const pattern = /<!--s-data:(.*?)-->/s;
    const matchResult = html.match(pattern);
    if (!matchResult) {
      return [];
    }
    let jsonObject: any[] = [];
    try {
      const sData = JSON.parse(matchResult[1]);
      const cardContent = sData.data?.cards?.[0]?.content ?? sData.cards?.[0]?.content;
      if (Array.isArray(cardContent)) {
        if (cardContent.length > 0 && Array.isArray(cardContent[0]?.content)) {
          jsonObject = cardContent[0].content!;
        } else {
          jsonObject = cardContent;
        }
      }
    } catch {
      jsonObject = [];
    }
    return jsonObject.map((v, index: number) => {
      const title = v.word ?? v.title ?? "";
      return {
        id: v.index ?? index + 1,
        title,
        desc: v.desc ?? "",
        cover: v.img ?? v.imgInfo?.src ?? "",
        author: v.show?.length ? v.show : "",
        hot: parseInt((v.hotScore ?? v.hotTag ?? "0").toString(), 10) || 0,
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(v.query ?? title)}`,
        mobileUrl: v.rawUrl ?? v.url ?? "",
      } satisfies HotListItem;
    });
  },

  baidutieba: async ({ timeoutMs }) => {
    const url = "https://tieba.baidu.com/hottopic/browse/topicList";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.errmsg !== "success") return [];
    const list = body.data?.bang_topic?.topic_list ?? [];
    return list.map((v: any) => {
      return {
        id: String(v.topic_id),
        title: v.topic_name,
        desc: v.topic_desc,
        pic: v.topic_pic,
        hot: v.discuss_num,
        url: v.topic_url,
        mobileUrl: v.topic_url,
      } satisfies HotListItem;
    });
  },

  qq: async ({ timeoutMs }) => {
    const url = "https://r.inews.qq.com/gw/event/hot_ranking_list";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.ret !== 0) return [];
    const list = body.idlist?.[0]?.newslist?.slice?.(1) ?? [];
    return list.map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        desc: v.abstract,
        pic: v.miniProShareImage,
        hot: v.readCount,
        url: `https://new.qq.com/rain/a/${v.id}`,
        mobileUrl: `https://view.inews.qq.com/a/${v.id}`,
      } satisfies HotListItem;
    });
  },

  hupu: async ({ timeoutMs }) => {
    const url = "https://bbs.hupu.com/all-gambia";
    const html = await fetchText(url, undefined, timeoutMs);
    const $ = cheerio.load(html);
    const jsonDom = $("script").first();
    const raw = jsonDom.text().split("window.$$data=")[1];
    const data = JSON.parse(raw).pageData.threads;
    return (data ?? []).map((v: any) => {
      return {
        id: v.tid,
        title: v.title,
        desc: v.desc,
        pic: v.cover,
        tip: v.lights,
        url: `https://bbs.hupu.com${v.url}`,
        mobileUrl: `https://bbs.hupu.com${v.url}`,
      } satisfies HotListItem;
    });
  },

  juejin: async ({ timeoutMs }) => {
    const url = "https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.err_msg !== "success") return [];
    return (body.data ?? []).map((v: any) => {
      return {
        id: v.content?.content_id,
        title: v.content?.title,
        hot: v.content_counter?.hot_rank,
        url: `https://juejin.cn/post/${v.content?.content_id}`,
        mobileUrl: `https://juejin.cn/post/${v.content?.content_id}`,
      } satisfies HotListItem;
    });
  },

  "github-trending": async ({ timeoutMs }) => {
    const baseUrl = "https://github.com";
    const html = await fetchText(
      `${baseUrl}/trending`,
      {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
        },
      },
      timeoutMs
    );

    const $ = cheerio.load(html);
    const listDom = $(".Box article.Box-row");
    return listDom
      .get()
      .map((repo, index) => {
        const $repo = $(repo);
        const relativeUrl = $repo.find(".h3").find("a").attr("href");
        const starsText =
          $repo
            .find(".mr-3 svg[aria-label='star']")
            .first()
            .parent()
            .text()
            .trim()
            .replace(",", "") || "0";

        return {
          id: relativeUrl || String(index),
          title: (relativeUrl || "").replace(/^\//, ""),
          desc: $repo.find("p.my-1").text().trim() || "",
          tip: formatGithubStars(parseInt(starsText, 10)),
          url: `${baseUrl}${relativeUrl}`,
          mobileUrl: `${baseUrl}${relativeUrl}`,
        } satisfies HotListItem;
      });
  },

  "hello-github": async ({ timeoutMs }) => {
    const url = "https://api.hellogithub.com/v1/?sort_by=featured&page=1&rank_by=newest&tid=all";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
        },
      },
      timeoutMs
    );
    if (!body.success) return [];
    return (body.data ?? []).map((v: any) => {
      return {
        id: v.item_id,
        title: `${v.name}-${v.title}`,
        desc: v.summary,
        hot: v.clicks_total,
        url: `https://hellogithub.com/repository/${v.full_name}`,
        mobileUrl: `https://hellogithub.com/repository/${v.full_name}`,
      } satisfies HotListItem;
    });
  },

  csdn: async ({ timeoutMs }) => {
    const url = "https://blog.csdn.net/phoenix/web/blog/hot-rank?page=0&pageSize=100";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
        },
      },
      timeoutMs
    );
    if (body.code !== 200) return [];
    return (body.data ?? []).map((v: any) => {
      return {
        id: v.articleDetailUrl,
        title: v.articleTitle,
        pic: v.picList?.[0],
        tip: v.pcHotRankScore,
        url: v.articleDetailUrl,
        mobileUrl: v.articleDetailUrl,
      } satisfies HotListItem;
    });
  },

  netease: async ({ timeoutMs }) => {
    const url = "https://m.163.com/fe/api/hot/news/flow";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.msg !== "success") return [];
    return (body.data?.list ?? []).map((v: any) => {
      return {
        id: v.skipID,
        title: v.title,
        desc: v._keyword,
        pic: v.imgsrc,
        url: `https://www.163.com/dy/article/${v.skipID}.html`,
        mobileUrl: v.url,
      } satisfies HotListItem;
    });
  },

  quark: async ({ timeoutMs }) => {
    const url =
      "https://iflow.quark.cn/iflow/api/v1/article/aggregation?aggregation_id=16665090098771297825&count=50&bottom_pos=0";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.status !== 0) return [];
    return (body.data?.articles ?? []).map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        tip: dayjs(v.publish_time).format("HH:mm"),
        url: `https://123.quark.cn/detail?item_id=${v.id}`,
        mobileUrl: `https://123.quark.cn/detail?item_id=${v.id}`,
      } satisfies HotListItem;
    });
  },

  lol: async ({ timeoutMs }) => {
    const url = "https://apps.game.qq.com/cmc/zmMcnTargetContentList?page=1&num=50&target=24&source=web_pc";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.status !== 1) return [];
    return (body.data?.result ?? []).map((v: any) => {
      return {
        id: v.iDocID,
        title: v.sTitle,
        desc: v.sAuthor,
        pic: v.sIMG,
        hot: Number(v.iTotalPlay),
        url: `https://lol.qq.com/news/detail.shtml?docid=${encodeURIComponent(v.iDocID)}`,
        mobileUrl: `https://lol.qq.com/news/detail.shtml?docid=${encodeURIComponent(v.iDocID)}`,
      } satisfies HotListItem;
    });
  },

  thepaper: async ({ timeoutMs }) => {
    const url = "https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.resultCode !== 1) return [];
    return (body.data?.hotNews ?? []).map((v: any) => {
      return {
        id: v.contId,
        title: v.name,
        pic: v.pic,
        hot: v.praiseTimes,
        url: `https://www.thepaper.cn/newsDetail_forward_${v.contId}`,
        mobileUrl: `https://m.thepaper.cn/newsDetail_forward_${v.contId}`,
      } satisfies HotListItem;
    });
  },

  kuaishou: async ({ timeoutMs }) => {
    const url = "https://www.kuaishou.com/?isHome=1";
    const html = await fetchText(url, undefined, timeoutMs);
    const result: HotListItem[] = [];
    const pattern = /window.__APOLLO_STATE__=(.*);\(function\(\)/s;
    const idPattern = /clientCacheKey=([A-Za-z0-9]+)/s;
    const matchResult = html.match(pattern);
    const jsonObject = matchResult ? JSON.parse(matchResult[1])["defaultClient"] : null;
    if (!jsonObject) return [];

    const allItems = jsonObject["$ROOT_QUERY.visionHotRank({\"page\":\"home\"})"]?.items ?? [];
    allItems.forEach((v: any) => {
      const image = jsonObject[v.id]?.poster;
      const id = String(image || "").match(idPattern)?.[1];
      if (!id) return;
      result.push({
        id,
        title: jsonObject[v.id]?.name,
        hot: Number(String(jsonObject[v.id]?.hotValue ?? "").replace("万", "")) * 10000,
        url: `https://www.kuaishou.com/short-video/${id}`,
        mobileUrl: `https://www.kuaishou.com/short-video/${id}`,
      });
    });
    return result;
  },

  dongchedi: async ({ timeoutMs }) => {
    const url = "https://www.dongchedi.com/news";
    const html = await fetchText(url, undefined, timeoutMs);
    const $ = cheerio.load(html);
    const json = $("script#__NEXT_DATA__", html).contents().text();
    const data = JSON.parse(json);
    return (data?.props?.pageProps?.hotSearchList || []).map((v: any, idx: number) => {
      return {
        id: idx + 1,
        title: v.title,
        hot: v.score,
        url: `https://www.dongchedi.com/search?keyword=${encodeURIComponent(v.title)}`,
        mobileUrl: `https://www.dongchedi.com/search?keyword=${encodeURIComponent(v.title)}`,
      } satisfies HotListItem;
    });
  },

  "history-today": async ({ timeoutMs }) => {
    const month = (new Date().getMonth() + 1).toString().padStart(2, "0");
    const day = new Date().getDate().toString().padStart(2, "0");
    const url = `https://baike.baidu.com/cms/home/eventsOnHistory/${month}.json`;
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    return (body?.[month]?.[month + day] ?? []).map((v: any, index: number) => {
      return {
        id: index,
        title: String(v.title || "").replace(/<[^>]+>/g, ""),
        tip: v.year,
        type: v.type,
        url: v.link,
        mobileUrl: v.link,
      } satisfies HotListItem;
    });
  },

  weread: async ({ timeoutMs }) => {
    const url = "https://weread.qq.com/web/bookListInCategory/rising?rank=1";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (!body.books) return [];
    return body.books.map((v: any) => {
      const info = v.bookInfo;
      const id = String(info.bookId);
      const wereadId = getWereadID(id);
      return {
        id,
        title: info.title,
        hot: v.readingCount,
        pic: String(info.cover || "").replace("s_", "t9_"),
        url: `https://weread.qq.com/web/bookDetail/${wereadId}`,
        mobileUrl: `https://weread.qq.com/web/bookDetail/${wereadId}`,
      } satisfies HotListItem;
    });
  },

  "douban-movic": async ({ timeoutMs }) => {
    const url = "https://movie.douban.com/chart/";
    const html = await fetchText(url, undefined, timeoutMs);

    const getNumbers = (text: string | undefined) => {
      if (!text) return 10000000;
      const match = text.match(/\d+/);
      return match ? Number(match[0]) : 10000000;
    };

    const $ = cheerio.load(html);
    const listDom = $(".article tr.item");
    return listDom
      .toArray()
      .map((item) => {
        const dom = $(item);
        const href = dom.find("a").attr("href") || "";
        const scoreText = dom.find(".rating_nums").text() ?? "0.0";
        return {
          id: String(getNumbers(href)),
          title: `${dom
            .find(".pl2 a")
            .text()
            .replace(/\s+/g, " ")
            .trim()
            .replace(/\n/g, "")}`,
          desc: dom.find("p.pl").text(),
          hot: getNumbers(dom.find("span.pl").text()),
          score: Number(scoreText),
          url: href,
          mobileUrl: `https://m.douban.com/movie/subject/${getNumbers(href)}/`,
        } satisfies HotListItem;
      });
  },

  "netease-music": async ({ timeoutMs }) => {
    const url = "https://music.163.com/api/playlist/detail?id=3778678";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          authority: "music.163.com",
          referer: "https://music.163.com/",
        },
      },
      timeoutMs
    );
    if (body.code !== 200) return [];
    return (body.result?.tracks ?? []).map((v: any) => {
      return {
        id: v.id,
        title: v.name,
        author: (v.artists ?? []).map((item: any) => item.name).join("/"),
        pic: v.album?.picUrl,
        tip: convertMillisecondsToTime(v.duration),
        url: `https://music.163.com/#/song?id=${v.id}`,
        mobileUrl: `https://music.163.com/m/song?id=${v.id}`,
      } satisfies HotListItem;
    });
  },

  woshipm: async ({ timeoutMs }) => {
    const url = "https://www.woshipm.com/api2/app/article/popular/daily";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
        },
      },
      timeoutMs
    );
    if (body.CODE !== 200) return [];
    return (body.RESULT ?? []).map((v: any) => {
      const itemUrl = `https://www.woshipm.com/${v.data?.type}/${v.data?.id}.html`;
      return {
        id: v.data?.id,
        title: v.data?.articleTitle,
        desc: v.data?.articleSummary,
        hot: v.scores,
        pic: v.data?.imageUrl,
        url: itemUrl,
        mobileUrl: itemUrl,
      } satisfies HotListItem;
    });
  },

  "36kr": async ({ timeoutMs }) => {
    const url = "https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot";
    const body = await fetchJson<any>(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          partner_id: "wap",
          param: {
            siteId: 1,
            platformId: 2,
          },
          timestamp: new Date().getTime(),
        }),
      },
      timeoutMs
    );

    if (body.code !== 0) return [];
    return (body.data?.hotRankList ?? []).map((v: any) => {
      return {
        id: v.itemId,
        title: v?.templateMaterial?.widgetTitle,
        pic: v?.templateMaterial?.widgetImage,
        hot: v?.templateMaterial?.statRead,
        url: `https://www.36kr.com/p/${v.itemId}`,
        mobileUrl: `https://m.36kr.com/p/${v.itemId}`,
      } satisfies HotListItem;
    });
  },

  huxiu: async ({ timeoutMs }) => {
    const url = "https://moment-api.huxiu.com/web-v3/moment/feed?platform=www";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://www.huxiu.com/moment/",
        },
      },
      timeoutMs
    );
    if (!body.success) return [];
    const list = body?.data?.moment_list?.datalist ?? [];
    return list.map((v: any) => {
      const content = String(v.content || "").replace(/<br\s*\/?>/gi, "\n");
      const [titleLine, ...rest] = content
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const title = titleLine?.replace(/。$/, "") || "";
      const intro = rest.join("\n");
      const id = v.object_id;
      return {
        id,
        title,
        desc: intro,
        tip: v.format_time,
        url: `https://www.huxiu.com/moment/${id}.html`,
        mobileUrl: `https://m.huxiu.com/moment/${id}.html`,
      } satisfies HotListItem;
    });
  },

  ifanr: async ({ timeoutMs }) => {
    const url = "https://sso.ifanr.com/api/v5/wp/buzz/?limit=50&offset=0";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const data = body?.objects;
    if (!data) return [];
    return data.map((v: any) => {
      return {
        id: v.post_id,
        title: v.post_title,
        url: v.buzz_original_url || `https://www.ifanr.com/${v.post_id}`,
        mobileUrl: v.buzz_original_url || `https://www.ifanr.com/digest/${v.post_id}`,
      } satisfies HotListItem;
    });
  },

  ithome: async ({ timeoutMs }) => {
    const url = "https://m.ithome.com/rankm";
    const html = await fetchText(url, undefined, timeoutMs);

    const replaceLink = (href: string) => {
      const match = href.match(/[html|live]\/(\d+)\.htm/);
      if (match && match[1]) {
        return `https://www.ithome.com/0/${match[1].slice(0, 3)}/${match[1].slice(3)}.htm`;
      }
      return href;
    };

    const $ = cheerio.load(html);
    const listDom = $(".rank-box .placeholder");
    return listDom.toArray().map((item, index) => {
      const dom = $(item);
      const href = dom.find("a").attr("href");
      const link = href ? replaceLink(href) : "";
      return {
        id: index,
        title: dom.find(".plc-title").text().trim(),
        pic: dom.find("img").attr("data-original"),
        hot: Number(dom.find(".review-num").text().replace(/\D/g, "")),
        url: link,
        mobileUrl: link,
      } satisfies HotListItem;
    });
  },

  "zhihu-daily": async ({ timeoutMs }) => {
    const url = "https://daily.zhihu.com/api/4/news/latest";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          Referer: "https://daily.zhihu.com/api/4/news/latest",
          Host: "daily.zhihu.com",
          "User-Agent": DEFAULT_USER_AGENT,
        },
      },
      timeoutMs
    );
    const data = body?.stories;
    if (!data) return [];
    return data.map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        url: v.url,
        mobileUrl: v.url,
      } satisfies HotListItem;
    });
  },

  "51cto": async ({ timeoutMs }) => {
    const url = "https://api-media.51cto.com/index/index/recommend";
    const params = {
      page: 1,
      page_size: 50,
      limit_time: 0,
      name_en: "",
      timestamp: Date.now(),
    };
    // 由于需要 token 和 sign，这里暂时返回空数组
    // 实际实现需要参考 DailyHotApi 项目的 getToken 和 sign 函数
    return [];
  },

  "52pojie": async ({ timeoutMs }) => {
    const url = "https://www.52pojie.cn/forum.php?mod=guide&view=digest&rss=1";
    const html = await fetchText(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    // 由于需要 RSS 解析和 GBK 编码转换，这里暂时返回空数组
    // 实际实现需要参考 DailyHotApi 项目的 parseRSS 函数和 iconv-lite 库
    return [];
  },

  "acfun": async ({ timeoutMs }) => {
    const url = "https://www.acfun.cn/rest/pc-direct/rank/channel?channelId=&rankLimit=30&rankPeriod=DAY";
    const body = await fetchJson<any>(
      url,
      {
        headers: {
          Referer: "https://www.acfun.cn/rank/list/?cid=-1&pcid=-1&range=DAY",
          "User-Agent": DEFAULT_USER_AGENT,
        },
      },
      timeoutMs
    );
    const list = body?.rankList || [];
    return list.map((v: any) => {
      return {
        id: v.dougaId,
        title: v.contentTitle,
        desc: v.contentDesc,
        pic: v.coverUrl,
        hot: v.likeCount,
        url: `https://www.acfun.cn/v/ac${v.dougaId}`,
        mobileUrl: `https://m.acfun.cn/v/?ac=${v.dougaId}`,
      } satisfies HotListItem;
    });
  },

  "coolapk": async ({ timeoutMs }) => {
    const url = "https://api.coolapk.com/v6/page/dataList?url=/feed/statList?cacheExpires=300&statType=day&sortField=detailnum&title=今日热门&title=今日热门&subTitle=&page=1";
    // 由于需要 genHeaders 函数，这里暂时返回空数组
    // 实际实现需要参考 DailyHotApi 项目的 genHeaders 函数
    return [];
  },

  "dgtle": async ({ timeoutMs }) => {
    const url = "https://www.dgtle.com/forum.php?mod=guide&view=hot&rss=1";
    const html = await fetchText(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    // 由于需要 RSS 解析，这里暂时返回空数组
    return [];
  },

  "douban-group": async ({ timeoutMs }) => {
    const url = "https://www.douban.com/group/explore";
    const html = await fetchText(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    const $ = cheerio.load(html);
    const listDom = $(".article .channel-item");
    return listDom.toArray().map((item, index) => {
      const dom = $(item);
      const url = dom.find("h3 a").attr("href") || "";
      const id = url.match(/topic\/(\d+)/)?.[1] || String(index);
      return {
        id,
        title: dom.find("h3 a").text().trim(),
        pic: dom.find(".pic-wrap img").attr("src"),
        desc: dom.find(".block p").text().trim(),
        url: url || `https://www.douban.com/group/topic/${id}`,
        mobileUrl: `https://m.douban.com/group/topic/${id}/`,
      } satisfies HotListItem;
    });
  },

  "earthquake": async ({ timeoutMs }) => {
    const url = "https://news.ceic.ac.cn/ajax/google?rand=0.2753659925589124";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.shuju?.list || [];
    return list.map((v: any) => {
      return {
        id: v.ID,
        title: v.Epi,
        desc: `${v.Loc} ${v.M}级地震`,
        url: `https://news.ceic.ac.cn/${v.ID}.html`,
        mobileUrl: `https://news.ceic.ac.cn/${v.ID}.html`,
      } satisfies HotListItem;
    });
  },

  "genshin": async ({ timeoutMs }) => {
    const url = "https://api-takumi.mihoyo.com/post/wapi/getNewsList?gids=2&page_size=50";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.data?.list || [];
    return list.map((v: any) => {
      return {
        id: v.post_id,
        title: v.title,
        pic: v.banner,
        url: `https://www.miyoushe.com/ys/article/${v.post_id}`,
        mobileUrl: `https://www.miyoushe.com/ys/article/${v.post_id}`,
      } satisfies HotListItem;
    });
  },

  "guokr": async ({ timeoutMs }) => {
    const url = "https://www.guokr.com/apis/minisite/article.json?retrieve_type=by_channel&channel_key=science&limit=50";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.result || [];
    return list.map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        desc: v.summary,
        pic: v.thumbnail,
        url: `https://www.guokr.com/article/${v.id}`,
        mobileUrl: `https://www.guokr.com/article/${v.id}`,
      } satisfies HotListItem;
    });
  },

  "hackernews": async ({ timeoutMs }) => {
    const url = "https://hacker-news.firebaseio.com/v0/topstories.json";
    const ids = await fetchJson<any[]>(url, undefined, timeoutMs);
    const items = await Promise.all(
      ids.slice(0, 30).map(async (id) => {
        const itemUrl = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
        return await fetchJson<any>(itemUrl, undefined, timeoutMs);
      })
    );
    return items.map((v) => {
      return {
        id: v.id,
        title: v.title,
        url: v.url,
        mobileUrl: v.url,
      } satisfies HotListItem;
    });
  },

  "honkai": async ({ timeoutMs }) => {
    const url = "https://api-takumi.mihoyo.com/post/wapi/getNewsList?gids=1&page_size=50";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.data?.list || [];
    return list.map((v: any) => {
      return {
        id: v.post_id,
        title: v.title,
        pic: v.banner,
        url: `https://www.miyoushe.com/bh3/article/${v.post_id}`,
        mobileUrl: `https://www.miyoushe.com/bh3/article/${v.post_id}`,
      } satisfies HotListItem;
    });
  },

  "hostloc": async ({ timeoutMs }) => {
    const url = "https://hostloc.com/forum.php?mod=guide&view=hot&rss=1";
    const html = await fetchText(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    // 由于需要 RSS 解析，这里暂时返回空数组
    return [];
  },

  "ithome-xijiayi": async ({ timeoutMs }) => {
    const url = "https://www.ithome.com/rss/xijiayi.xml";
    const html = await fetchText(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    // 由于需要 RSS 解析，这里暂时返回空数组
    return [];
  },

  "jianshu": async ({ timeoutMs }) => {
    const url = "https://www.jianshu.com/trending/weekly";
    const html = await fetchText(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    const $ = cheerio.load(html);
    const listDom = $(".note-list li");
    return listDom.toArray().map((item, index) => {
      const dom = $(item);
      const url = dom.find(".title").attr("href") || "";
      return {
        id: url.match(/p\/(\w+)/)?.[1] || String(index),
        title: dom.find(".title").text().trim(),
        desc: dom.find(".abstract").text().trim(),
        url: `https://www.jianshu.com${url}`,
        mobileUrl: `https://www.jianshu.com${url}`,
      } satisfies HotListItem;
    });
  },

  "miyoushe": async ({ timeoutMs }) => {
    const url = "https://api-takumi.mihoyo.com/post/wapi/getNewsList?gids=1&page_size=50";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.data?.list || [];
    return list.map((v: any) => {
      return {
        id: v.post_id,
        title: v.title,
        pic: v.banner,
        url: `https://www.miyoushe.com/article/${v.post_id}`,
        mobileUrl: `https://www.miyoushe.com/article/${v.post_id}`,
      } satisfies HotListItem;
    });
  },

  "netease-news": async ({ timeoutMs }) => {
    const url = "https://m.163.com/fe/api/hot/news/flow";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.msg !== "success") return [];
    return (body.data?.list ?? []).map((v: any) => {
      return {
        id: v.skipID,
        title: v.title,
        desc: v._keyword,
        pic: v.imgsrc,
        url: `https://www.163.com/dy/article/${v.skipID}.html`,
        mobileUrl: v.url,
      } satisfies HotListItem;
    });
  },

  "ngabbs": async ({ timeoutMs }) => {
    const url = "https://bbs.nga.cn/thread.php?fid=-7";
    const html = await fetchText(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    const $ = cheerio.load(html);
    const listDom = $(".topiclist tbody tr");
    return listDom.toArray().map((item, index) => {
      const dom = $(item);
      const url = dom.find(".topic a").attr("href") || "";
      return {
        id: url.match(/tid=(\d+)/)?.[1] || String(index),
        title: dom.find(".topic a").text().trim(),
        url: `https://bbs.nga.cn${url}`,
        mobileUrl: `https://bbs.nga.cn${url}`,
      } satisfies HotListItem;
    });
  },

  "nodeseek": async ({ timeoutMs }) => {
    const url = "https://www.nodeseek.com/";
    const html = await fetchText(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    const $ = cheerio.load(html);
    const listDom = $(".topic-list-item");
    return listDom.toArray().map((item, index) => {
      const dom = $(item);
      const url = dom.find(".topic-title a").attr("href") || "";
      return {
        id: url.match(/topic\/(\d+)/)?.[1] || String(index),
        title: dom.find(".topic-title a").text().trim(),
        url: `https://www.nodeseek.com${url}`,
        mobileUrl: `https://www.nodeseek.com${url}`,
      } satisfies HotListItem;
    });
  },

  "qq-news": async ({ timeoutMs }) => {
    const url = "https://r.inews.qq.com/gw/event/hot_ranking_list";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    if (body.ret !== 0) return [];
    const list = body.idlist?.[0]?.newslist?.slice?.(1) ?? [];
    return list.map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        desc: v.abstract,
        pic: v.miniProShareImage,
        hot: v.readCount,
        url: `https://new.qq.com/rain/a/${v.id}`,
        mobileUrl: `https://view.inews.qq.com/a/${v.id}`,
      } satisfies HotListItem;
    });
  },

  "sina-news": async ({ timeoutMs }) => {
    const url = "https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2510&k=&num=50&page=1";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.result?.data || [];
    return list.map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        desc: v.intro,
        pic: v.pic,
        url: v.url,
        mobileUrl: v.url,
      } satisfies HotListItem;
    });
  },

  "sina": async ({ timeoutMs }) => {
    const url = "https://top.sina.com.cn/api/feed/mix?cat=hdtop";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.data?.list || [];
    return list.map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        desc: v.content,
        pic: v.pic,
        url: v.url,
        mobileUrl: v.url,
      } satisfies HotListItem;
    });
  },

  "smzdm": async ({ timeoutMs }) => {
    const url = "https://www.smzdm.com/homepage/json_more?timesort=1714483200&p=1";
    const body = await fetchJson<any>(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    const list = body?.data?.list || [];
    return list.map((v: any) => {
      return {
        id: v.article_id,
        title: v.article_title,
        pic: v.article_pic,
        url: v.article_url,
        mobileUrl: v.article_url,
      } satisfies HotListItem;
    });
  },

  "sspai": async ({ timeoutMs }) => {
    const url = "https://sspai.com/api/v1/articles?limit=50&offset=0&sort=recommended";
    const body = await fetchJson<any>(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
    }, timeoutMs);
    const list = body?.data || [];
    return list.map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        desc: v.summary,
        pic: v.banner,
        url: `https://sspai.com/post/${v.id}`,
        mobileUrl: `https://sspai.com/post/${v.id}`,
      } satisfies HotListItem;
    });
  },

  "starrail": async ({ timeoutMs }) => {
    const url = "https://api-takumi.mihoyo.com/post/wapi/getNewsList?gids=6&page_size=50";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.data?.list || [];
    return list.map((v: any) => {
      return {
        id: v.post_id,
        title: v.title,
        pic: v.banner,
        url: `https://www.miyoushe.com/sr/article/${v.post_id}`,
        mobileUrl: `https://www.miyoushe.com/sr/article/${v.post_id}`,
      } satisfies HotListItem;
    });
  },

  "v2ex": async ({ timeoutMs }) => {
    const url = "https://www.v2ex.com/api/topics/hot.json";
    const body = await fetchJson<any[]>(url, undefined, timeoutMs);
    return body.map((v) => {
      return {
        id: v.id,
        title: v.title,
        desc: v.content,
        url: `https://www.v2ex.com/t/${v.id}`,
        mobileUrl: `https://www.v2ex.com/t/${v.id}`,
      } satisfies HotListItem;
    });
  },

  "weatheralarm": async ({ timeoutMs }) => {
    const url = "http://www.weatheralarm.cn/home/alarm.do";
    const body = await fetchJson<any>(url, undefined, timeoutMs);
    const list = body?.data || [];
    return list.map((v: any) => {
      return {
        id: v.id,
        title: v.title,
        desc: v.content,
        url: `http://www.weatheralarm.cn/home/detail.do?id=${v.id}`,
        mobileUrl: `http://www.weatheralarm.cn/home/detail.do?id=${v.id}`,
      } satisfies HotListItem;
    });
  },
};

export const fetchHotList = async (source: string, options: FetchHotListOptions): Promise<HotListItem[]> => {
  const provider = providers[source];
  if (!provider) throw new Error(`Unsupported source: ${source}`);
  const items = await provider(options);
  
  // 处理数据：如果 desc 字段为空、或与 title 完全相同、或以 # 开头结尾且中间内容与 title 相同，则删除 desc 字段
  return items.map(item => {
    if (!item.desc || item.desc.trim() === '') {
      // desc 为空或空白字符串，删除 desc 字段
      const { desc, ...rest } = item;
      return rest;
    }
    
    // 检查 desc 是否与 title 完全相同
    if (item.desc === item.title) {
      const { desc, ...rest } = item;
      return rest;
    }
    
    // 检查 desc 是否以 # 开头和结尾，且中间内容与 title 完全相同
    const match = item.desc.match(/^#(.*)#$/);
    if (match && match[1] === item.title) {
      const { desc, ...rest } = item;
      return rest;
    }
    
    // 检查 desc 是否以 # 开头或结尾，且中间内容与 title 完全相同
    const trimmedDesc = item.desc.trim();
    if ((trimmedDesc.startsWith('#') || trimmedDesc.endsWith('#')) && 
        trimmedDesc.replace(/^#|#$/g, '') === item.title) {
      const { desc, ...rest } = item;
      return rest;
    }
    
    return item;
  });
};
