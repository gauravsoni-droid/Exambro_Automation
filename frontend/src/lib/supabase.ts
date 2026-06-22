import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

/** Public URL for a path in the `media` storage bucket (generated images, idea uploads). */
export function mediaUrl(path: string): string {
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}
