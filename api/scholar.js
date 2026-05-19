module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const scholarId = 'jLPVuhoAAAAJ'; 
  // 强制使用英文界面抓取，以防万一
  const url = `https://scholar.google.com/citations?hl=en&user=${scholarId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const html = await response.text();
    
    // 终极正则：直接去抠谷歌学术引用数表格里的第一个数字（绝对精准）
    const match = html.match(/<td class="gsc_rsb_std">(\d+)<\/td>/);
    const citations = match ? match[1] : 'N/A';

    res.status(200).json({ citations });
  } catch (error) {
    console.error("抓取失败:", error);
    res.status(200).json({ citations: 'N/A' }); 
  }
};