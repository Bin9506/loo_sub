const appConfig = { ver: 1, title: 'Sanity Test', site: 'https://example', tabs: [ { name: '测试', ext: { id: 0 } } ] }
async function getConfig() { $print('getConfig sanity'); return jsonify(appConfig) }
async function getCards(ext) {
  ext = argsify(ext); $print('getCards sanity', ext)
  return jsonify({ list: [ { vod_id: 't1', vod_name: '测试条目', vod_pic: '', vod_remarks: '', ext: { url: 'https://example.com/play' } } ] })
}
async function getTracks(ext) {
  ext = argsify(ext); $print('getTracks sanity', ext)
  return jsonify({ list: [ { title: '默认', tracks: [ { name: '占位', pan: '', ext: { url: ext.url || 'https://example.com/play' } } ] } ] })
}
async function getPlayinfo(ext) {
  ext = argsify(ext); $print('getPlayinfo sanity', ext)
  const url = ext.url || 'https://example.com/play'
  return jsonify({ urls: [url], headers: [ { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://example.com/' } ] })
}
async function search(ext) { ext = argsify(ext); $print('search sanity', ext); return jsonify({ list: [] }) }
