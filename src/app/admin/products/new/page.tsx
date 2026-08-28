import Link from 'next/link'
import ProductForm from '../product-form'

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm">
          ← Products
        </Link>
        <h1 className="text-3xl mt-2">Add product</h1>
      </div>
      <ProductForm />
    </div>
  )
}
