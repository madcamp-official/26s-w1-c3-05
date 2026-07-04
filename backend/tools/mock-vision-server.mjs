import http from 'node:http'

const port = Number(process.env.VISION_MOCK_PORT ?? 8001)

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/cat-detection') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Not found' }))
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })

  req.on('end', () => {
    const payload = JSON.parse(body || '{}')
    const imageUrl = String(payload.imageUrl ?? '').toLowerCase()
    const isCat = !['not-cat', 'dog', 'rejected'].some((keyword) => imageUrl.includes(keyword))

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        isCat,
        confidence: isCat ? 0.93 : 0.08,
      }),
    )
  })
})

server.listen(port, () => {
  console.log(`Mock vision service listening on http://localhost:${port}`)
})
