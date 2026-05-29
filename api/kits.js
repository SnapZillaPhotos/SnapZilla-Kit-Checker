export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: 'NOTION_TOKEN not configured' });

  const KITS_DB = '8eb08e72-83d7-4f87-9e0f-c88baf003793';

  try {
    // 1. Fetch all kits from the Kits database
    const kitsRes = await fetch(`https://api.notion.com/v1/databases/${KITS_DB}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sorts: [{ property: 'Kit', direction: 'ascending' }] }),
    });

    if (!kitsRes.ok) {
      const err = await kitsRes.json();
      return res.status(502).json({ error: 'Notion error fetching kits', details: err });
    }

    const kitsData = await kitsRes.json();

    // 2. For each kit, fetch its equipment items in parallel
    const kits = await Promise.all(
      kitsData.results.map(async (kit) => {
        const props = kit.properties;
        const kitName = props['Kit']?.title?.[0]?.plain_text ?? 'Unnamed Kit';
        const notes = props['Notes']?.rich_text?.[0]?.plain_text ?? '';
        const icon = kit.icon?.emoji ?? null;

        // Get related equipment item page IDs
        const itemRelations = props['Equipment items (auto)']?.relation ?? [];

        // Fetch each equipment item page
        const items = await Promise.all(
          itemRelations.map(async (rel) => {
            try {
              const itemRes = await fetch(`https://api.notion.com/v1/pages/${rel.id}`, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Notion-Version': '2022-06-28',
                },
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

    // Cache for 60 seconds on Vercel edge
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ kits });

  } catch (err) {
    return res.status(500).json({ error: 'Unexpected error', details: err.message });
  }
}
