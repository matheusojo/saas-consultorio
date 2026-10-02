// PASSO 2 — Cliente Supabase (usado no navegador).
// Instale: npm install @supabase/supabase-js lucide-react
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local');
}

// A anon key é pública por design; a segurança vem das políticas RLS do schema.sql.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
