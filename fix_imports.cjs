const fs = require('fs');
let content = fs.readFileSync('src/components/admin/AdminDashboardModal.tsx', 'utf8');
content = content.replace(/import \{[\s\S]*?\} from 'lucide-react';/, `import { ShieldCheck, Activity, Download, Key, Users, Building2, Plus, FileText, Copy, Check, RefreshCw, Trash2, Search, Ticket, X, Tag, Percent, Sparkles } from 'lucide-react';`);
fs.writeFileSync('src/components/admin/AdminDashboardModal.tsx', content, 'utf8');
console.log("Fixed imports regex");

