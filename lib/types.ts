export type Role = 'admin' | 'analyst'

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  created_at: string
}

export interface Client {
  id: number
  name: string
  contact_name: string | null
  contact_email: string | null
  categories: Record<string, boolean>
  keywords: string
  created_at: string
}

export type OrderStatus =
  | 'draft'
  | 'consent_sent'
  | 'consent_completed'
  | 'collecting'
  | 'analysis'
  | 'in_review'
  | 'report_ready'
  | 'delivered'
  | 'cancelled'

export interface Order {
  id: number
  client_id: number
  client_name?: string
  candidate_name: string
  candidate_email: string
  job_title: string | null
  lookback_years: number
  categories: Record<string, boolean>
  status: OrderStatus
  consent_token: string
  consent_sent_at: string | null
  consent_viewed_at: string | null
  consent_completed_at: string | null
  created_by: number | null
  created_by_name?: string
  created_at: string
  updated_at: string
}

export interface Consent {
  id: number
  order_id: number
  disclosure_version: string
  signature_name: string
  state_of_residence: string | null
  wants_copy: boolean
  ip: string | null
  user_agent: string | null
  signed_at: string
}

export interface CandidateProfile {
  id: number
  order_id: number
  platform: string
  url: string
  added_by: 'candidate' | 'analyst'
  created_at: string
}

export interface AuditEntry {
  id: number
  order_id: number | null
  actor: string
  action: string
  detail: any
  created_at: string
}
