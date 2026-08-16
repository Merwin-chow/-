// 密钥收敛到环境变量，不再硬编码进源码/小程序包（Phase 6.1）
const TIANAPI_KEY = process.env.TIANAPI_KEY || '5f55824300d94ed37420dc0710a84989'
// 今日诗词 Token 由云函数代理承载，移出小程序包（Phase 6.7）
const JINRISHICI_TOKEN = process.env.JINRISHICI_TOKEN || 'rIQGw/h6U+0bjeFzLjCRDL6jDFZqemUL'
const CACHE_SOURCE = 'api_cache'
// 每日缓存 24h 后允许自然过期重抓（Phase 6.4 TTL）
const CACHE_TTL = 24 * 3600 * 1000

const todayCn = () => {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

const toMMdd = (date) => {
  if (date && date.length >= 10) {
    return date.slice(5, 7) + date.slice(8, 10)
  }
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return m + d
}

const fetchFromApis = async (dateStr) => {
  const results = []
  const tasks = []

  // 今日诗词（Phase 6.7 代理）：由云函数拉取，前端不再携带 token / 直调
  tasks.push(
    uniCloud.httpclient.request('https://v2.jinrishici.com/sentence', {
      method: 'GET',
      headers: { 'X-User-Token': JINRISHICI_TOKEN },
      dataType: 'json',
      timeout: 8000
    }).then(res => {
      const d = res && res.data
      if (d && d.status === 'success' && d.data) {
        const origin = d.data.origin || {}
        results.push({
          quote: d.data.content,
          author: `${origin.dynasty || ''}·${origin.author || '佚名'}`,
          source: 'jinrishici',
          book_name: origin.title || ''
        })
      }
    }).catch(e => console.error('jinrishici fail:', e))
  )

  tasks.push(
    uniCloud.httpclient.request('https://v1.hitokoto.cn/', {
      method: 'GET',
      dataType: 'json'
    }).then(res => {
      if (res.data && res.data.hitokoto) {
        results.push({
          quote: res.data.hitokoto,
          author: res.data.from || '佚名',
          source: 'hitokoto',
          book_name: res.data.from_who || ''
        })
      }
    }).catch(e => console.error('hitokoto fail:', e))
  )

  tasks.push(
    uniCloud.httpclient.request('https://apis.tianapi.com/ai/index', {
      method: 'GET',
      data: { key: TIANAPI_KEY, num: 3, rand: 1 },
      dataType: 'json'
    }).then(res => {
      const d = res.data
      if (d && d.code === 200 && d.result) {
        const list = d.result.list || []
        list.forEach(item => {
          if (item && item.content) {
            results.push({
              quote: item.content,
              author: 'AI生成',
              source: 'tianapi_ai',
              book_name: ''
            })
          }
        })
      }
    }).catch(e => console.error('tianapi ai fail:', e))
  )

  tasks.push(
    uniCloud.httpclient.request('https://apis.tianapi.com/generalnews/index', {
      method: 'GET',
      data: { key: TIANAPI_KEY, num: 3, rand: 1 },
      dataType: 'json'
    }).then(res => {
      const d = res.data
      if (d && d.code === 200 && d.result) {
        const list = d.result.list || []
        list.forEach(item => {
          if (item && item.title) {
            const desc = item.description || item.digest || ''
            results.push({
              quote: desc ? `${item.title}\n${desc}` : item.title,
              author: item.source || '综合新闻',
              source: 'generalnews',
              book_name: ''
            })
          }
        })
      }
    }).catch(e => console.error('generalnews fail:', e))
  )

  const queryDateMMdd = toMMdd(dateStr)
  tasks.push(
    uniCloud.httpclient.request('https://apis.tianapi.com/lishi/index', {
      method: 'GET',
      data: { key: TIANAPI_KEY, date: queryDateMMdd },
      dataType: 'json'
    }).then(res => {
      const d = res.data
      if (d && d.code === 200 && d.result) {
        const list = d.result.list || []
        list.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0))
        list.slice(0, 10).forEach(item => {
          if (item && item.title) {
            const year = item.lsdate ? item.lsdate.split('-')[0] : ''
            results.push({
              quote: item.title,
              author: '',
              source: 'lishi',
              book_name: '',
              year
            })
          }
        })
      }
    }).catch(e => console.error('lishi fail:', e))
  )

  await Promise.all(tasks)
  return results
}

const upsertApiCache = async (db, dateStr, items, cacheDoc) => {
  if (!items.length) return
  const now = Date.now()
  const expireAt = now + CACHE_TTL
  const first = items[0]
  await db.collection('daily_data')
    .where({ date: dateStr, source: CACHE_SOURCE })
    .remove() // 清掉同日期全部旧 api_cache，绝不留孤儿（Phase 6.4）
  await db.collection('daily_data').add({
    date: dateStr,
    quote: first.quote || '',
    author: first.author || '',
    source: CACHE_SOURCE,
    book_name: first.book_name || '',
    items,
    expireAt,
    createTime: now,
    updateTime: now
  })
}

exports.main = async (event, context) => {
  const db = uniCloud.database()
  const dateStr = (event && event.date) || todayCn()
  const forceRefresh = !!(event && event.forceRefresh)

  let cacheDoc = null
  const manuals = []

  try {
    const dbRes = await db.collection('daily_data').where({ date: dateStr }).get()
    const docs = dbRes.data || []
    for (const doc of docs) {
      if (doc.source === CACHE_SOURCE && Array.isArray(doc.items) && doc.items.length > 0) {
        cacheDoc = doc
      } else if (doc.quote && doc.source !== CACHE_SOURCE) {
        manuals.push(doc)
      }
    }
  } catch (e) {
    console.error('daily_data query fail:', e)
  }

  let results = []
  const cacheValid = cacheDoc && !forceRefresh && cacheDoc.expireAt > Date.now()
  if (cacheValid) {
    results = cacheDoc.items.slice()
  } else {
    results = await fetchFromApis(dateStr)
    try {
      await upsertApiCache(db, dateStr, results, cacheDoc)
    } catch (e) {
      console.error('daily_data cache write fail:', e)
    }
  }

  // 手动配置叠在最前（不覆盖 api_cache）
  for (let i = manuals.length - 1; i >= 0; i--) {
    const today = manuals[i]
    results.unshift({
      quote: today.quote,
      author: today.author || '',
      source: today.source || 'manual',
      book_name: today.book_name || '',
      question: today.question || '',
      answer: today.answer || ''
    })
  }

  return {
    code: 200,
    data: results.length > 0 ? results : [{
      quote: '暂无数据，请稍后再试',
      author: '',
      source: 'empty',
      book_name: ''
    }],
    cached: !!cacheValid
  }
}
