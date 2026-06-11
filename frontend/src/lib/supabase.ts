import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

/** Public URL for a path in the `media` storage bucket (generated images, idea uploads). */
export function mediaUrl(path: string): string {
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}
