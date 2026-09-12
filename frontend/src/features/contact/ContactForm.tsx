import { ArrowRight, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useSendContact } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Mirrors the backend's rules and messages in backend/src/routes/contact.rs, which has the final
// say. Plain functions rather than a schema library keep the contact page's code small.
const NAME_ERROR = 'Enter your name (up to 100 characters).'
const EMAIL_ERROR = 'Enter a valid email address.'
const MESSAGE_ERROR = 'Write between 10 and 5,000 characters.'

const trim = (value: string) => value.trim()
const validName = (name: string) => (name.length >= 1 && name.length <= 100) || NAME_ERROR
const validMessage = (message: string) =>
  (message.length >= 10 && message.length <= 5000) || MESSAGE_ERROR

/** Deliberately loose, like the backend's is_valid_email: `local@dotted.domain`, no whitespace. */
function validEmail(email: string) {
  const [local, domain, ...rest] = email.split('@')
  const ok =
    rest.length === 0 &&
    !!local &&
    !!domain &&
    email.length <= 254 &&
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !/[\s\p{Cc}]/u.test(email)
  return ok || EMAIL_ERROR
}

type ContactValues = {
  name: string
  email: string
  message: string
  /** Honeypot; see the hidden input below. */
  website: string
}

const FIELDS = ['name', 'email', 'message'] as const
type FieldName = (typeof FIELDS)[number]
const isFieldName = (field: string): field is FieldName => FIELDS.includes(field as FieldName)

// Only called on submit. It lives outside the component because react/purity can't tell that
// handleSubmit's callback doesn't run during render.
const msSince = (start: number) => Date.now() - start

export function ContactForm() {
  // When the form was shown; the backend drops submissions made implausibly fast.
  const [openedAt] = useState(() => Date.now())
  const sendContact = useSendContact()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    defaultValues: { name: '', email: '', message: '', website: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await sendContact.mutateAsync({ ...values, elapsed_ms: msSince(openedAt) })
      reset()
      toast.success("Thanks! Your message is on its way, and I'll get back to you soon.")
    } catch (error) {
      const fieldErrors = error instanceof ApiError ? (error.body?.fields ?? []) : []
      if (fieldErrors.length > 0) {
        for (const { field, message } of fieldErrors) {
          if (isFieldName(field)) setError(field, { message })
        }
        return
      }
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't reach the server. Please try again.",
      )
    }
  })

  const describedBy = (field: FieldName) => (errors[field] ? `contact-${field}-error` : undefined)

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormRow id="contact-name" label="Name" error={errors.name?.message}>
        <Input
          id="contact-name"
          autoComplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={describedBy('name')}
          {...register('name', { setValueAs: trim, validate: validName })}
        />
      </FormRow>
      <FormRow id="contact-email" label="Email" error={errors.email?.message}>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={describedBy('email')}
          {...register('email', { setValueAs: trim, validate: validEmail })}
        />
      </FormRow>
      <FormRow id="contact-message" label="Message" error={errors.message?.message}>
        <Textarea
          id="contact-message"
          rows={6}
          aria-invalid={!!errors.message}
          aria-describedby={describedBy('message')}
          {...register('message', { setValueAs: trim, validate: validMessage })}
        />
      </FormRow>

      {/* Honeypot: hidden from people and screen readers. Bots that fill it in are silently dropped. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="animate-spin" data-icon="inline-start" />
            Sending…
          </>
        ) : (
          <>
            Send message
            <ArrowRight data-icon="inline-end" />
          </>
        )}
      </Button>
    </form>
  )
}

function FormRow({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
