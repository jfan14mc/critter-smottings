import { createClient } from '@/utils/supabase/server';

export default async function Critters() {
  const supabase = await createClient();
  const { data: critters } = await supabase.from("critterArray").select();

  return <pre>{JSON.stringify(critters, null, 2)}</pre>
}