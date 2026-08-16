const TIANAPI_KEY = '5f55824300d94ed37420dc0710a84989'
const CACHE_SOURCE = 'api_cache'

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
  const first = items[0]
  if (cacheDoc && cacheDoc._id) {
    await db.collection('daily_data').doc(cacheDoc._id).update({
      quote: first.quote || '',
      author: first.author || '',
      source: CACHE_SOURCE,
      book_name: first.book_name || '',
      items,
      updateTime: now
    })
    return
  }
  await db.collection('daily_data').add({
    date: dateStr,
    quote: first.quote || '',
    author: first.author || '',
    source: CACHE_SOURCE,
    book_name: first.book_name || '',
    items,
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
  if (cacheDoc && !forceRefresh) {
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
    cached: !!(cacheDoc && !forceRefresh)
  }
}
