// api/scholar.js
// 彻底干掉 node-fetch，使用 Node.js 18+ 原生自带的 fetch

module.exports = async (req, res) => {
  // 设置响应头允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600'); // 缓存1小时，防封IP

  const scholarId = 'jLPVuhoAAAAJ'; // 你的 Google Scholar ID
  const url = `https://scholar.google.com/citations?hl=zh-CN&user=${scholarId}`;

  try {
    const response = await fetch(url, {
      headers: {
        // 伪装成浏览器
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const html = await response.text();
    
    // 正则匹配引用数
    const match = html.match(/Cited by\s*<\/a>\s*(\d+)/);
    const citations = match ? match[1] : 'N/A';

    res.status(200).json({ citations });
  } catch (error) {
    console.error("抓取失败:", error);
    res.status(200).json({ citations: 'N/A' }); 
  }
};