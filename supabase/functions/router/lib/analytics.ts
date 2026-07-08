import { dbQuery } from './db.ts';

export async function getAdminAnalytics(filters: { from?: string; to?: string; city?: string }) {
  const where: string[] = [];
  const values: Array<string | null> = [];

  if (filters.from) {
    values.push(filters.from);
    where.push(`redeemed_at >= $${values.length}::timestamptz`);
  }
  if (filters.to) {
    values.push(filters.to);
    where.push(`redeemed_at <= $${values.length}::timestamptz`);
  }
  if (filters.city) {
    values.push(filters.city);
    where.push(`city = $${values.length}`);
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const totals = await dbQuery<{ redemptions: string; unique_customers: string }>(
    `SELECT COUNT(*)::text AS redemptions, COUNT(DISTINCT user_id)::text AS unique_customers FROM redemptions ${clause}`,
    values,
  );
  const vendorUsage = await dbQuery<{ vendor_id: string; vendor_name: string; redemptions: string }>(
    `SELECT v.id AS vendor_id, v.name AS vendor_name, COUNT(r.id)::text AS redemptions FROM redemptions r JOIN vendors v ON v.id = r.vendor_id ${clause} GROUP BY v.id, v.name ORDER BY COUNT(r.id) DESC`,
    values,
  );
  const cardUsage = await dbQuery<{ card_id: string; card_name: string; redemptions: string }>(
    `SELECT c.id AS card_id, c.name AS card_name, COUNT(r.id)::text AS redemptions FROM redemptions r JOIN cards c ON c.id = r.card_id ${clause} GROUP BY c.id, c.name ORDER BY COUNT(r.id) DESC`,
    values,
  );
  const timeSeries = await dbQuery<{ day: string; redemptions: string }>(
    `SELECT to_char(date_trunc('day', redeemed_at), 'YYYY-MM-DD') AS day, COUNT(*)::text AS redemptions FROM redemptions WHERE redeemed_at >= now() - interval '30 days' ${filters.city ? 'AND city = $1' : ''} GROUP BY 1 ORDER BY 1`,
    filters.city ? [filters.city] : [],
  );

  const topPerformers = vendorUsage.slice(0, 5);
  return {
    totals: {
      redemptions: Number(totals[0]?.redemptions ?? '0'),
      uniqueCustomers: Number(totals[0]?.unique_customers ?? '0'),
    },
    usageByVendor: vendorUsage.map((item) => ({ vendorId: item.vendor_id, vendorName: item.vendor_name, redemptions: Number(item.redemptions) })),
    usageByCard: cardUsage.map((item) => ({ cardId: item.card_id, cardName: item.card_name, redemptions: Number(item.redemptions) })),
    timeSeries: timeSeries.map((item) => ({ day: item.day, redemptions: Number(item.redemptions) })),
    topPerformers: topPerformers.map((item) => ({ vendorId: item.vendor_id, vendorName: item.vendor_name, redemptions: Number(item.redemptions) })),
  };
}

export async function getVendorAnalytics(vendorId: string) {
  const daily = await dbQuery<{ day: string; redemptions: string }>(
    `SELECT to_char(date_trunc('day', redeemed_at), 'YYYY-MM-DD') AS day, COUNT(*)::text AS redemptions FROM redemptions WHERE vendor_id = $1 GROUP BY 1 ORDER BY 1 DESC LIMIT 30`,
    [vendorId],
  );
  const cards = await dbQuery<{ card_id: string; card_name: string; redemptions: string; unique_customers: string }>(
    `SELECT c.id AS card_id, c.name AS card_name, COUNT(r.id)::text AS redemptions, COUNT(DISTINCT r.user_id)::text AS unique_customers FROM redemptions r JOIN cards c ON c.id = r.card_id WHERE r.vendor_id = $1 GROUP BY c.id, c.name ORDER BY COUNT(r.id) DESC`,
    [vendorId],
  );
  const aggregate = await dbQuery<{ redemptions: string; unique_customers: string }>(
    `SELECT COUNT(*)::text AS redemptions, COUNT(DISTINCT user_id)::text AS unique_customers FROM redemptions WHERE vendor_id = $1`,
    [vendorId],
  );
  return {
    totals: {
      redemptions: Number(aggregate[0]?.redemptions ?? '0'),
      uniqueCustomers: Number(aggregate[0]?.unique_customers ?? '0'),
    },
    daily: daily.map((item) => ({ day: item.day, redemptions: Number(item.redemptions) })),
    byCard: cards.map((item) => ({ cardId: item.card_id, cardName: item.card_name, redemptions: Number(item.redemptions), uniqueCustomers: Number(item.unique_customers) })),
  };
}
