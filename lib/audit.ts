import { sql } from './db'

// Every consequential action gets a row. FCRA disputes and client questions
// both come down to "who did what, when" — this table is the answer.
export async function audit(
  actor: string,
  action: string,
  orderId: number | null,
  detail: Record<string, any> = {}
) {
  try {
    await sql`
      INSERT INTO audit_log (order_id, actor, action, detail)
      VALUES (${orderId}, ${actor}, ${action}, ${JSON.stringify(detail)})
    `
  } catch (err) {
    console.error('Audit write failed:', err)
  }
}
