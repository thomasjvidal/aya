const { cors } = require('./_lib/cors');
module.exports = (req, res) => {
  if (cors(req, res)) return;
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
  });
};
