import { CheckCircle2, Info, AlertTriangle } from 'lucide-react';

export default function Toast({ message, kind = 'info' }: { message: string; kind?: 'info' | 'error' | 'success' }) {
  return (
    <div className={`toast toast-${kind}`} role="status">
      {kind === 'success' ? <CheckCircle2 size={16} /> : kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
      <span>{message}</span>
    </div>
  );
}
