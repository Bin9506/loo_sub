// XPTV 扩展脚本：P-Stream（TMDB 驱动）
// 说明：
// - 列表/搜索/详情来自 TMDB，需使用你提供的 Read API Token。
// - 播放：返回 P-Stream 详情页占位线路；若你配置了可访问其后端的代理，我可升级为直链解析。

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// 读取订阅传入的配置（参考文档：通过 $config_str 注入）
const $config = (typeof $config_str !== 'undefined' && $config_str) ? argsify($config_str) : {}

// TMDB Read API Token（强制从订阅传入的 $config.TMDB_TOKEN 读取，无默认值）
const TMDB_TOKEN = ($config && $config.TMDB_TOKEN) ? $config.TMDB_TOKEN : null

function ensureToken() {
  if (!TMDB_TOKEN) {
    try { if (typeof $utils !== 'undefined' && $utils.toastError) { $utils.toastError('缺少 TMDB_TOKEN：请在订阅 config 中配置'); } } catch (e) {}
    $print('TMDB_TOKEN missing in $config')
    return false
  }
  return true
}

const TMDB_BASE = 'https://api.themoviedb.org/3'

const appConfig = {
  ver: 20251106,
  title: 'P-Stream · TMDB',
  site: 'https://pstream.mov',
  // 静态 tabs，部分运行时不会调用 getTabs，这里提前内置
  tabs: [
    { name: '电影 · 热门', ext: { kind: 'movie', sort: 'popular' } },
    { name: '电影 · 最新', ext: { kind: 'movie', sort: 'latest' } },
    { name: '电影 · 高分', ext: { kind: 'movie', sort: 'top' } },
    { name: '剧集 · 热门', ext: { kind: 'series', sort: 'popular' } },
    { name: '剧集 · 最新', ext: { kind: 'series', sort: 'latest' } },
    { name: '剧集 · 高分', ext: { kind: 'series', sort: 'top' } },
  ],
}

function tmdbHeaders() {
  if (!ensureToken()) { throw new Error('TMDB_TOKEN is required via subscription config') }
  return {
    'User-Agent': UA,
    'Accept': 'application/json',
    'Authorization': `Bearer ${TMDB_TOKEN}`,
  }
}

function tmdbPoster(path) {
  if (!path) return ''
  return `https://image.tmdb.org/t/p/w342/${path}`
}

function tmdbTypeFromMediaType(mediaType) {
  return mediaType === 'tv' ? 'series' : 'movie'
}

function makeVodId(mediaType, id) {
  const t = mediaType === 'tv' ? 'series' : 'movie'
  return `tmdb-${t}-${id}`
}

function parseVodId(vodId) {
  // tmdb-movie-123 / tmdb-series-456
  const m = /^tmdb-(movie|series)-(\d+)$/.exec(vodId || '')
  if (!m) return null
  return { type: m[1], id: m[2] }
}

// 入口信息
async function getConfig() {
  // 直接返回静态配置，并打印订阅传入配置，增强兼容性与可观测性
  $print('getConfig', $config)
  ensureToken()
  return jsonify(appConfig)
}

// 分类 Tab
async function getTabs() {
  const tabs = [
    { name: '电影 · 热门', ext: { kind: 'movie', sort: 'popular' } },
    { name: '电影 · 最新', ext: { kind: 'movie', sort: 'latest' } },
    { name: '电影 · 高分', ext: { kind: 'movie', sort: 'top' } },
    { name: '剧集 · 热门', ext: { kind: 'series', sort: 'popular' } },
    { name: '剧集 · 最新', ext: { kind: 'series', sort: 'latest' } },
    { name: '剧集 · 高分', ext: { kind: 'series', sort: 'top' } },
  ]
  return tabs
}

// 列表卡片
async function getCards(ext) {
  try {
    ext = argsify(ext)
    $print('getCards', ext)
    if (!ensureToken()) { return jsonify({ list: [] }) }
    const page = Number(ext.page || 1)
    const kind = ext.kind === 'series' ? 'tv' : 'movie'
    const sort = ext.sort || 'popular'

    let url = `${TMDB_BASE}/discover/${kind}`
    const params = new URLSearchParams()

    if (sort === 'popular') params.set('sort_by', 'popularity.desc')
    else if (sort === 'top') {
      params.set('sort_by', 'vote_average.desc')
      params.set('vote_count.gte', '200') // 避免冷门条目高分干扰
    } else if (sort === 'latest') {
      params.set('sort_by', kind === 'movie' ? 'release_date.desc' : 'first_air_date.desc')
      params.set(kind === 'movie' ? 'release_date.lte' : 'first_air_date.lte', new Date().toISOString().slice(0, 10))
    }
    params.set('page', String(page))
    url += `?${params.toString()}`

    const { data } = await $fetch.get(url, { headers: tmdbHeaders() })
    const results = data?.results || []

    const list = results.map(item => ({
      vod_id: makeVodId(kind, item.id),
      vod_name: kind === 'movie' ? (item.title || item.original_title || '') : (item.name || item.original_name || ''),
      vod_pic: tmdbPoster(item.poster_path),
      vod_remarks: (() => {
        if (kind === 'movie') return (item.release_date || '').slice(0, 4)
        return (item.first_air_date || '').slice(0, 4)
      })(),
      ext: { tmdb_id: item.id, kind },
    }))

    return jsonify({ list })
  } catch (err) {
    $print(err)
  }
}

// 详情页：汇总基本信息 + 生成占位播放线路（P-Stream 详情页）
async function getTracks(ext) {
  try {
    ext = argsify(ext)
    $print('getTracks', ext)
    // 兼容三种传参来源：vod_id、ext.url（自定义）、ext.tmdb_id+ext.kind
    let id, type
    const parsed = parseVodId(ext?.url || ext?.vod_id)
    if (parsed) {
      id = parsed.id
      type = parsed.type
    } else if (ext?.tmdb_id && ext?.kind) {
      id = String(ext.tmdb_id)
      type = ext.kind === 'tv' ? 'series' : 'movie'
    } else {
      return jsonify({ list: [] })
    }

    // TMDB 详情（用于标题/封面）
    const kind = type === 'series' ? 'tv' : 'movie'
    const detailUrl = `${TMDB_BASE}/${kind}/${id}`
    const { data } = await $fetch.get(detailUrl, { headers: tmdbHeaders() })

    const title = kind === 'movie' ? (data?.title || data?.original_title || '') : (data?.name || data?.original_name || '')
    const pstreamDetail = `https://pstream.mov/media/tmdb-${kind}-${id}` // P-Stream 详情页（受 Cloudflare 保护）

    const tracks = [
      {
        name: 'P-Stream 详情页',
        pan: '',
        ext: { url: pstreamDetail },
      },
    ]

    return jsonify({
      list: [
        {
          title: title || '详情',
          tracks,
        },
      ],
    })
  } catch (err) {
    $print(err)
  }
}

// 播放：占位（返回详情页 URL）。若需直链解析，请提供可转发到 fed-api.pstream.mov 的代理。
async function getPlayinfo(ext) {
  try {
    ext = argsify(ext)
    $print('getPlayinfo', ext)
    const playUrl = ext.url || ''
    if (!playUrl) return jsonify({ urls: [] })
    // 返回详情页链接占位，并附加常见头（参考指南 headers 可选）
    return jsonify({
      urls: [playUrl],
      headers: [
        { 'User-Agent': UA, 'Referer': 'https://pstream.mov/' },
      ],
    })
  } catch (err) {
    $print(err)
  }
}

// 搜索：TMDB multi，返回电影/剧集混合结果
async function search(ext) {
  try {
    ext = argsify(ext)
    $print('search', ext)
    if (!ensureToken()) { return jsonify({ list: [] }) }
    const text = (ext.text || '').trim()
    const page = Number(ext.page || 1)
    if (!text) return jsonify({ list: [] })

    const url = `${TMDB_BASE}/search/multi?query=${encodeURIComponent(text)}&page=${page}`
    const { data } = await $fetch.get(url, { headers: tmdbHeaders() })
    const results = (data?.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv')

    const list = results.map(item => {
      const kind = item.media_type === 'tv' ? 'tv' : 'movie'
      return {
        vod_id: makeVodId(kind, item.id),
        vod_name: kind === 'movie' ? (item.title || item.original_title || '') : (item.name || item.original_name || ''),
        vod_pic: tmdbPoster(item.poster_path),
        vod_remarks: kind === 'movie' ? (item.release_date || '').slice(0, 4) : (item.first_air_date || '').slice(0, 4),
        ext: { tmdb_id: item.id, kind },
      }
    })

    return jsonify({ list })
  } catch (err) {
    $print(err)
  }
}

// 兼容别名：部分运行时使用 tabs/list/detail/play 作为入口
async function tabs() { return await getTabs() }
async function list(ext) { return await getCards(ext) }
async function detail(ext) { return await getTracks(ext) }
async function play(ext) { return await getPlayinfo(ext) }
async function init() { return true }