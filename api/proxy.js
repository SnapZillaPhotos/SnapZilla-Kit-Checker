module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DATABASE_ID = '36f69937e3f4800a8bfae26b7d106a73';

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN not configured on server' });
  }

  try {
    const data = req.body;

    const properties = {
      "Sales entry": {
        title: [{ text: { content: data["Sales entry"] || '' } }]
      },
      "Staff name": {
        rich_text: [{ text: { content: data["Name"] || '' } }]
      },
      "Venue": {
        rich_text: [{ text: { content: data["Venue"] || '' } }]
      },
      "Kit number": {
        rich_text: [{ text: { content: String(data["Kit number"] || '') } }]
      },
      "Breaks": {
        rich_text: [{ text: { content: data["Breaks"] || '' } }]
      },
      "Sales log": {
        rich_text: [{ text: { content: (data["Sales log"] || '').slice(0, 2000) } }]
      },
      "Notes": {
        rich_text: [{ text: { content: data["Notes"] || '' } }]
      },
      "Magnets sold":       { number: data["Magnets sold"] || 0 },
      "Prints sold":        { number: data["Prints sold"] || 0 },
      "Keyrings sold":      { number: data["Keyrings sold"] || 0 },
      "Discounts (£)":      { number: data["Discounts (£)"] || 0 },
      "Total card (£)":     { number: data["Total card (£)"] || 0 },
      "Total cash (£)":     { number: data["Total cash (£)"] || 0 },
      "Starting float (£)": { number: data["Starting float (£)"] || 0 },
      "Date": {
        date: { start: data["date:Date:start"] || new Date().toISOString().split('T')[0] }
      },
      "Start time": {
        date: { start: data["date:Start time:start"] || new Date().toISOString() }
      },
      "Finish time": {
        date: { start: data["date:Finish time:start"] || new Date().toISOString() }
      },
    };

    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties,
      }),
    });

    const result = await notionRes.json();

    if (result.object === 'page') {
      return res.status(200).json({ ok: true, id: result.id });
    } else {
      console.error('Notion error:', JSON.stringify(result));
      return res.status(400).json({ error: result.message || 'Notion rejected the request', details: result });
    }
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Proxy failed', detail: err.message });
  }
}
