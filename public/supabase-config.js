const SUPABASE_CONFIG = {
  url: "https://ekqsgshptafxivdjczoc.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrcXNnc2hwdGFmeGl2ZGpjem9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzY3MTEsImV4cCI6MjA5NzY1MjcxMX0.9FI39GrtdSKi_JQS_y_-5dPG-IOoQbWdXFBaO8bHfZU"
};

const supabaseClient = supabase.createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey
);
