import type { Metadata } from 'next'
import { MessageSquare, Mail, Phone, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrgId } from '@/lib/supabase/helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'

export const metadata: Metadata = { title: 'Messages' }
export const revalidate = 60 // Refresh more frequently — contact forms are real-time

export default async function MessagesPage() {
  const supabase = await createClient()
  const orgId = await getCurrentOrgId(supabase)

  let contacts: Array<{
    id: string
    name: string
    email: string | null
    phone: string | null
    message: string | null
    status: string
    created_at: string
  }> = []

  if (orgId) {
    const { data } = await supabase
      .from('contact_submissions')
      .select('id, name, email, phone, message, status, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)

    contacts = data ?? []
  }

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-4xl mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-nunito font-bold text-foreground">Messages</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Contact form submissions from your website.
        </p>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No messages yet"
          description="When visitors fill out the contact form on your website, their messages will appear here."
        />
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <Card key={contact.id} className="bg-card border-border rounded-xl overflow-hidden">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-strawberry/10 flex items-center justify-center shrink-0">
                      <span className="text-strawberry text-sm font-bold">
                        {contact.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{contact.name}</CardTitle>
                      <div className="flex items-center gap-3 mt-0.5">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            <Mail className="w-3 h-3" />
                            {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3" />
                            {contact.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        contact.status === 'new'
                          ? 'bg-strawberry/10 text-strawberry border-strawberry/20'
                          : contact.status === 'replied'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {contact.status === 'new' ? '● New' : contact.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(contact.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </CardHeader>
              {contact.message && (
                <CardContent className="px-4 pb-4 pt-0">
                  <p className="text-sm text-muted-foreground pl-10 border-l-2 border-border ml-4 pl-3">
                    {contact.message}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
