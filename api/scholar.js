// source/api/scholar.js
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600'); // 缓存1小时

  const scholarId = 'jLPVuhoAAAAJ'; // 你的 Google Scholar ID
  const url = `https://scholar.google.com/citations?hl=zh-CN&user=${scholarId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    
    // 匹配引用数
    const match = html.match(/Cited by\s*<\/a>\s*(\d+)/);
    const citations = match ? match[1] : 'N/A';

    res.status(200).json({ citations });
  } catch (error) {
    res.status(500).json({ citations: 'N/A' });
  }
};