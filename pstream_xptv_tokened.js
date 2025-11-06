// XPTV 扩展脚本：P-Stream（TMDB 驱动，内置 Token 版）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// 内置 TMDB Read API Token（用于无需订阅配置的场景）
const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhMmY0MTBmZGRjYTI1ZjBkNTJjNDQxMjc5MDUxZWNjMyIsIm5iZiI6MTc1NTcwNjQzMi44MTc5OTk4LCJzdWIiOiI2OGE1ZjQ0MGQyMGEyZWMyNThhODE3YjgiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.yNLDqbN1Mlkt_htaG_RPDi2IJ5dWqLfNSBTTWDMjT-U'

const TMDB_BASE = 'https://api.themoviedb.org/3'

const appConfig = {
  ver: 20251106,
  title: 'P-Stream · TMDB (tokened)',
  site: 'https://pstream.mov',
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
  return {
    'User-Agent': UA,
    'Accept': 'application/json',
    'Authorization': `Bearer ${TMDB_TOKEN}`,
  }
}

function tmdbPoster(path) { return path ? `https://image.tmdb.org/t/p/w342/${path}` : '' }
function makeVodId(kind, id) { const t = kind === 'tv' ? 'series' : 'movie'; return `tmdb-${t}-${id}` }
function parseVodId(vodId) { const m = /^tmdb-(movie|series)-(\d+)$/.exec(vodId || ''); return m ? { type: m[1], id: m[2] } : null }

async function getConfig() { $print('getConfig tokened'); return jsonify(appConfig) }

async function getCards(ext) {
  try {
    ext = argsify(ext); $print('getCards tokened', ext)
    const page = Number(ext.page || 1)
    const kind = ext.kind === 'series' ? 'tv' : 'movie'
    const sort = ext.sort || 'popular'
    let q = `page=${page}`
    if (sort === 'popular') q += '&sort_by=popularity.desc'
    else if (sort === 'top') q += '&sort_by=vote_average.desc&vote_count.gte=200'
    else if (sort === 'latest') {
      q += `&sort_by=${kind === 'movie' ? 'release_date.desc' : 'first_air_date.desc'}`
      q += `&${kind === 'movie' ? 'release_date.lte' : 'first_air_date.lte'}=${new Date().toISOString().slice(0, 10)}`
    }
    const url = `${TMDB_BASE}/discover/${kind}?${q}`
    const { data } = await $fetch.get(url, { headers: tmdbHeaders() })
    const results = data?.results || []
    const list = results.map(item => ({
      vod_id: makeVodId(kind, item.id),
      vod_name: kind === 'movie' ? (item.title || item.original_title || '') : (item.name || item.original_name || ''),
      vod_pic: tmdbPoster(item.poster_path),
      vod_remarks: kind === 'movie' ? (item.release_date || '').slice(0, 4) : (item.first_air_date || '').slice(0, 4),
      ext: { tmdb_id: item.id, kind },
    }))
    return jsonify({ list })
  } catch (err) { $print(err) }
}

async function getTracks(ext) {
  try {
    ext = argsify(ext); $print('getTracks tokened', ext)
    let id, type
    const parsed = parseVodId(ext?.url || ext?.vod_id)
    if (parsed) { id = parsed.id; type = parsed.type } else if (ext?.tmdb_id && ext?.kind) { id = String(ext.tmdb_id); type = ext.kind === 'tv' ? 'series' : 'movie' } else { return jsonify({ list: [] }) }
    const kind = type === 'series' ? 'tv' : 'movie'
    const detailUrl = `${TMDB_BASE}/${kind}/${id}`
    const { data } = await $fetch.get(detailUrl, { headers: tmdbHeaders() })
    const title = kind === 'movie' ? (data?.title || data?.original_title || '') : (data?.name || data?.original_name || '')
    const pstreamDetail = `https://pstream.mov/media/tmdb-${kind}-${id}`
    const tracks = [ { name: 'P-Stream 详情页', pan: '', ext: { url: pstreamDetail } } ]
    return jsonify({ list: [ { title: title || '详情', tracks } ] })
  } catch (err) { $print(err) }
}

async function getPlayinfo(ext) {
  try {
    ext = argsify(ext); $print('getPlayinfo tokened', ext)
    const playUrl = ext.url || ''
    if (!playUrl) return jsonify({ urls: [] })
    return jsonify({ urls: [playUrl], headers: [ { 'User-Agent': UA, 'Referer': 'https://pstream.mov/' } ] })
  } catch (err) { $print(err) }
}

async function search(ext) {
  try {
    ext = argsify(ext); $print('search tokened', ext)
    const text = (ext.text || '').trim(); const page = Number(ext.page || 1); if (!text) return jsonify({ list: [] })
    const url = `${TMDB_BASE}/search/multi?query=${encodeURIComponent(text)}&page=${page}`
    const { data } = await $fetch.get(url, { headers: tmdbHeaders() })
    const results = (data?.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv')
    const list = results.map(item => { const kind = item.media_type === 'tv' ? 'tv' : 'movie'; return { vod_id: makeVodId(kind, item.id), vod_name: kind === 'movie' ? (item.title || item.original_title || '') : (item.name || item.original_name || ''), vod_pic: tmdbPoster(item.poster_path), vod_remarks: kind === 'movie' ? (item.release_date || '').slice(0, 4) : (item.first_air_date || '').slice(0, 4), ext: { tmdb_id: item.id, kind } } })
    return jsonify({ list })
  } catch (err) { $print(err) }
}