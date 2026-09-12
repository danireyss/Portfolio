import { toast } from 'sonner'
import { RESUME_PDF_URL } from '@/api/client'
import { Button } from '@/components/ui/button'
import { UploadField } from '../fields'
import { useUpload } from '../queries'
import type { EditorProps } from '../types'

/** The resume PDF: uploading a new one replaces it right away. */
export function ResumeFileEditor({ content, onDone }: EditorProps) {
  const upload = useUpload()

  return (
    <div className="grid gap-5 px-4">
      <p className="text-sm leading-relaxed text-prose">
        {content.has_resume ? (
          <>
            Visitors download the{' '}
            <a href={RESUME_PDF_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              current PDF
            </a>
            . A new upload replaces it as soon as it finishes.
          </>
        ) : (
          'There is no PDF yet. Once you upload one, the resume page offers it for download.'
        )}
      </p>
      <UploadField
        label="Upload a new resume"
        accept="application/pdf"
        hint="A PDF."
        onUpload={async ([file]) => {
          await upload.mutateAsync({ kind: 'resume', files: [file] })
          toast.success('The new resume is live.')
          onDone()
        }}
      />
      <div>
        <Button type="button" variant="ghost" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  )
}
