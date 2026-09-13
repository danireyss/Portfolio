import { toast } from 'sonner'
import type { SiteFile } from '@/api/types/SiteFile'
import { Button } from '@/components/ui/button'
import { UploadField } from '../fields'
import { useImportResume, useUpload } from '../queries'
import type { EditorProps } from '../types'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What the resume page shows now, e.g. "2 jobs, 1 school, 4 skill groups, and 1 award". */
const sections = (site: SiteFile) =>
  [
    count(site.experience.length, 'job', 'jobs'),
    count(site.education.length, 'school', 'schools'),
    count(site.skill_groups.length, 'skill group', 'skill groups'),
    `and ${count(site.awards.length, 'award', 'awards')}`,
  ].join(', ')

const reason = (error: unknown) => (error instanceof Error ? error.message : 'Please try again.')

/** The resume PDF: uploading a new one replaces it right away, and the resume page is read from it. */
export function ResumeFileEditor({ content, onDone }: EditorProps) {
  const upload = useUpload()
  const importResume = useImportResume()

  const readPdf = async () => {
    const { site } = await importResume.mutateAsync()
    toast.success(`The resume page now matches the PDF: ${sections(site)}.`)
    onDone()
  }

  return (
    <div className="grid gap-5 px-4">
      <p className="text-sm leading-relaxed text-prose">
        {content.resume_url ? (
          <>
            Visitors download the{' '}
            <a href={content.resume_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              current PDF
            </a>
            . A new upload replaces it as soon as it finishes, and the resume page’s experience,
            education, skills, and awards are read from it.
          </>
        ) : (
          'There is no PDF yet. Once you upload one, the resume page offers it for download and shows what it says.'
        )}
      </p>
      <UploadField
        label="Upload a new resume"
        accept="application/pdf"
        hint="A PDF."
        onUpload={async ([file]) => {
          await upload.mutateAsync({ kind: 'resume', files: [file] })
          await readPdf().catch((error: unknown) => {
            throw new Error(`The new PDF is live, but the resume page couldn’t be read from it. ${reason(error)}`)
          })
        }}
      />
      <div className="flex flex-wrap gap-2">
        {content.resume_url && (
          <Button
            type="button"
            variant="outline"
            disabled={importResume.isPending}
            onClick={() => void readPdf().catch((error: unknown) => toast.error(reason(error)))}
          >
            Update the resume page from this PDF
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  )
}
