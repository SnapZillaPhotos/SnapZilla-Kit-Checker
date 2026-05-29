export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN not configured' });

  const notionHeaders = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    // Use Notion search to find the Kits database by title
    // This works even for inline databases that are tricky to access by ID directly
    const searchRes = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({
        query: 'Kits',
        filter: { value: 'database', property: 'object' },
      }),
    });

    if (!searchRes.ok) {
      const err = await searchRes.json();
      return res.status(502).json({ error: 'Notion search failed', details: err });
    }

    const searchData = await searchRes.json();

    // Find the Kits database (prefer exact title match)
    const kitsDb = searchData.results.find(db => {
      const title = db.title?.[0]?.plain_text ?? '';
      return title.toLowerCase() === 'kits';
    }) || searchData.results[0];

    if (!kitsDb) {
      return res.status(404).json({
        error: 'Kits database not found via search',
        hint: 'Make sure the integration is connected to the SnapZilla Kits page in Notion',
        searchResults: searchData.results.map(r => ({ id: r.id, title: r.title?.[0]?.plain_text }))
      });
    }

    const KITS_DB = kitsDb.id;

    // Query the kits database
    const kitsRes = await fetch(`https://api.notion.com/v1/databases/${KITS_DB}/query`, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({ sorts: [{ property: 'Kit', direction: 'ascending' }] }),
    });

    if (!kitsRes.ok) {
      const err = await kitsRes.json();
      return res.status(502).json({ error: 'Notion error fetching kits', details: err });
    }

    const kitsData = await kitsRes.json();

    // For each kit, fetch its equipment items in parallel
    const kits = await Promise.all(
      kitsData.results.map(async (kit) => {
        const props = kit.properties;
        const kitName = props['Kit']?.title?.[0]?.plain_text ?? 'Unnamed Kit';
        const notes = props['Notes']?.rich_text?.[0]?.plain_text ?? '';
        const icon = kit.icon?.emoji ?? null;

        const itemRelations = props['Equipment items (auto)']?.relation ?? [];

        const items = await Promise.all(
          itemRelations.map(async (rel) => {
            try {
              const itemRes = await fetch(`https://api.notion.com/v1/pages/${rel.id}`, {
                headers: notionHeaders,
              });
              if (!itemRes.ok) return null;
              const item = await itemRes.json();
              const p = item.properties;
              return {
                name: p['Item']?.title?.[0]?.plain_text ?? '',
                brand: p['Brand']?.rich_text?.[0]?.plain_text ?? '',
                model: p['Model']?.rich_text?.[0]?.plain_text ?? '',
                category: p['Category']?.select?.name ?? '',
                labelCode: p['Label Code']?.rich_text?.[0]?.plain_text ?? '',
                serial: p['Serial / Identifier']?.rich_text?.[0]?.plain_text ?? '',
                storageLocation: p['Storage Location']?.rich_text?.[0]?.plain_text ?? '',
              };
            } catch {
              return null;
            }
          })
        );

        return {
          id: kit.id,
          name: kitName,
          icon,
          notes,
          items: items.filter(Boolean),
        };
      })
    );

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ kits, dbId: KITS_DB });

  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
