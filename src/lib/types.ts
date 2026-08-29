export type UserRole = 'admin' | 'distributor'

export type ApplicationStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'suspended'
  | 'removed'

export type DocumentStatus = 'pending' | 'accepted' | 'rejected'
export type DocumentKind = 'signed_agreement' | 'resale_certificate'
export type PackageOrderStatus = 'draft' | 'awaiting_payment' | 'paid' | 'fulfilled' | 'cancelled'
export type BusinessStructure = 'sole_proprietor' | 'llc' | 'corporation' | 'other'

export interface Profile {
  id: string
  role: UserRole
  email: string
  full_name: string
  phone: string
  created_at: string
  updated_at: string
}

export interface Distributor {
  id: string
  profile_id: string
  business_name: string
  business_structure: BusinessStructure
  business_structure_other: string
  mailing_line1: string
  mailing_line2: string
  mailing_city: string
  mailing_state: string
  mailing_postal_code: string
  mailing_country: string
  fulfillment_same_as_mailing: boolean
  fulfillment_line1: string
  fulfillment_line2: string
  fulfillment_city: string
  fulfillment_state: string
  fulfillment_postal_code: string
  fulfillment_country: string
  tax_id_last4: string | null
  resale_certificate_number: string
  resale_state: string
  application_status: ApplicationStatus
  application_submitted_at: string | null
  application_decided_at: string | null
  application_decision_note: string
  agreement_signed_at: string | null
  resale_accepted_at: string | null
  intro_started_at: string | null
  intro_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface InventoryPackage {
  id: string
  sku: string
  name: string
  description: string
  unit_count: number
  price_cents: number
  weight_oz: number
  length_in?: number
  width_in?: number
  height_in?: number
  box_count?: number
  image_path: string
  is_active: boolean
  sort_order: number
}

export interface PackageOrder {
  id: string
  order_number: string
  distributor_id: string
  package_id: string
  sku_snapshot: string
  name_snapshot: string
  unit_count_snapshot: number
  unit_price_cents: number
  quantity: number
  subtotal_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  ship_to_name: string
  ship_to_line1: string
  ship_to_line2: string
  ship_to_city: string
  ship_to_state: string
  ship_to_postal_code: string
  ship_to_country: string
  shipping_carrier: string
  shipping_service: string
  easypost_shipment_id: string
  easypost_rate_id: string
  status: PackageOrderStatus
  stripe_checkout_session_id: string | null
  paid_at: string | null
  tracking_code: string
  label_url?: string
  label_urls?: string[]
  created_at: string
}

export interface DistributorDocument {
  id: string
  distributor_id: string
  kind: DocumentKind
  storage_path: string
  file_name: string
  mime_type: string
  status: DocumentStatus
  review_note: string
  reviewed_at: string | null
  uploaded_at: string
}

export interface DistributorInventory {
  id: string
  distributor_id: string
  sku: string
  quantity_on_hand: number
  low_stock_threshold: number
}

export interface Product {
  id: string
  sku: string
  name: string
  description: string
  retail_cents: number
  wholesale_cents: number
  weight_oz: number
  image_path: string
  is_active: boolean
  sort_order: number
  created_at?: string
}

export type InvoiceCustomerType = 'direct_to_customer' | 'retail_wholesale'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'expired' | 'cancelled'
export type InvoiceDiscountType = 'none' | 'percent' | 'amount'

export interface Customer {
  id: string
  distributor_id: string
  full_name: string
  email: string
  phone: string
  billing_line1: string
  billing_line2: string
  billing_city: string
  billing_state: string
  billing_postal_code: string
  billing_country: string
  shipping_same_as_billing: boolean
  shipping_line1: string
  shipping_line2: string
  shipping_city: string
  shipping_state: string
  shipping_postal_code: string
  shipping_country: string
  resale_certificate_number: string
  resale_document_path: string
  resale_document_name: string
  created_at: string
}

export interface Invoice {
  id: string
  invoice_number: string
  distributor_id: string
  customer_id: string
  customer_type: InvoiceCustomerType
  status: InvoiceStatus
  public_token: string
  customer_name_snapshot: string
  customer_email_snapshot: string
  customer_phone_snapshot: string
  seller_name_snapshot?: string
  seller_email_snapshot?: string
  seller_phone_snapshot?: string
  ship_to_line1: string
  ship_to_line2: string
  ship_to_city: string
  ship_to_state: string
  ship_to_postal_code: string
  ship_to_country: string
  discount_type: InvoiceDiscountType
  discount_value: number
  discount_cents: number
  subtotal_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  free_shipping: boolean
  shipping_carrier: string
  shipping_service: string
  paid_at: string | null
  sent_at: string | null
  expires_at: string | null
  tracking_code: string
  inventory_deducted_at?: string | null
  created_at: string
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  product_id: string | null
  sku_snapshot: string
  name_snapshot: string
  unit_price_cents: number
  quantity: number
  line_total_cents: number
  sort_order: number
}

export interface ShippingRate {
  id: string
  carrier: string
  service: string
  rateCents: number
  deliveryDays: number | null
}

export interface DistributorWithProfile extends Distributor {
  profiles: Profile
}
