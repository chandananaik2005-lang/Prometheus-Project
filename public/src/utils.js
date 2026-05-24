export const CAT_COLORS = {
  'AI & ML':    '#7f77dd',
  'Apple':      '#888780',
  'Mobile':     '#378add',
  'Cybersecurity': '#d85a30',
  'Social Media':  '#d4537e',
  'EV & Auto':  '#639922',
  'Startups':   '#ba7517',
  'Gaming':     '#1d9e75',
  'Telecom':    '#1d9e75',
  'Crypto':     '#ba7517',
  'General Tech': '#5f5e5a',
};

export const CAT_CLASS = {
  'AI & ML': 'cat-AI', 'Apple': 'cat-Apple', 'Mobile': 'cat-Mobile',
  'Cybersecurity': 'cat-Cyber', 'Social Media': 'cat-Social', 'EV & Auto': 'cat-EV',
  'Startups': 'cat-Startup', 'Gaming': 'cat-Gaming', 'Telecom': 'cat-Telecom',
  'Crypto': 'cat-Crypto', 'General Tech': 'cat-General',
};

export function getCatClass(cat) { return CAT_CLASS[cat] || 'cat-General'; }

export function formatDate(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return str; }
}
