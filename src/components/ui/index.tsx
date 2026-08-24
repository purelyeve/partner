import { cn } from '@/lib/utils'

export function Button({
  children,
  className,
  variant = 'primary',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const variants = {
    primary: 'bg-pe-gold text-white hover:bg-pe-brown',
    secondary: 'bg-pe-cream text-pe-dark-brown border border-pe-beige hover:bg-pe-beige',
    ghost: 'text-pe-gold hover:text-pe-brown hover:bg-pe-cream',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  }
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center px-5 py-2.5 text-sm tracking-wide transition-colors rounded-sm cursor-pointer disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Alert({
  children,
  variant = 'info',
}: {
  children: React.ReactNode
  variant?: 'info' | 'success' | 'warning' | 'error'
}) {
  const styles = {
    info: 'bg-pe-cream border-pe-beige text-pe-charcoal',
    success: 'bg-green-50 border-green-200 text-green-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-900',
  }
  return (
    <div className={cn('border rounded-sm px-4 py-3 text-sm', styles[variant])}>
      {children}
    </div>
  )
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('border border-pe-beige bg-white rounded-sm p-6', className)}>
      {children}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'gold'
}) {
  const tones = {
    neutral: 'bg-pe-cream text-pe-brown',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
    gold: 'bg-pe-gold/15 text-pe-dark-brown',
  }
  return (
    <span className={cn('inline-block text-xs px-2 py-0.5 rounded-sm', tones[tone])}>
      {children}
    </span>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-red-600 text-xs mt-1">{message}</p>
}

export function Label({
  htmlFor,
  required,
  children,
  className,
}: {
  htmlFor?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('block text-sm text-pe-brown mb-1', className)}
    >
      {children}
      {required && <span className="text-pe-gold"> *</span>}
    </label>
  )
}
