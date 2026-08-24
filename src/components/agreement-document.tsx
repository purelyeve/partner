import {
  AGREEMENT_EFFECTIVE_DATE,
  AGREEMENT_INTRO,
  AGREEMENT_TITLE,
  AGREEMENT_VERSION_LABEL,
  PARTNER_AGREEMENT_SECTIONS,
} from '@/content/partner-agreement'
import { Card } from '@/components/ui'

export function AgreementDocument({ className }: { className?: string }) {
  return (
    <Card className={className ?? 'max-h-[50vh] overflow-y-auto space-y-6 text-sm leading-relaxed'}>
      <div>
        <h2 className="text-base font-serif mb-1">{AGREEMENT_TITLE}</h2>
        <p className="text-xs text-pe-brown">
          Agreement Version 1.0 | Effective {AGREEMENT_EFFECTIVE_DATE}
        </p>
      </div>
      <p className="whitespace-pre-line">{AGREEMENT_INTRO}</p>
      {PARTNER_AGREEMENT_SECTIONS.map((section) => (
        <div key={section.title}>
          <h3 className="text-base font-serif mb-2">{section.title}</h3>
          <p className="whitespace-pre-line text-pe-charcoal">{section.body}</p>
        </div>
      ))}
      <p className="text-xs text-pe-brown border-t border-pe-beige pt-4">
        {AGREEMENT_VERSION_LABEL}
      </p>
    </Card>
  )
}
