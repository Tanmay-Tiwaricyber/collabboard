import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Lock,
  QrCode,
  Share2,
  Twitter,
  X,
  Mail,
  MessageCircle,
} from 'lucide-react';
import { useBoard } from '../store/board';
import { buildShareUrl, copyText, shareUrlForBoardId, urlLengthWarning, shareSlug } from '../utils/share';
import { exportSVG } from '../utils/export';

export default function ShareDialog({ onClose }: { onClose: () => void }) {
  const elements = useBoard((s) => s.elements);
  const app = useBoard((s) => s.app);
  const boardName = useBoard((s) => s.boardName);
  const boardId = useBoard((s) => s.boardId);
  const [tab, setTab] = useState<'link' | 'embed' | 'image'>('link');
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [svgUrl, setSvgUrl] = useState('');

  const shareUrl = useMemo(
    () =>
      buildShareUrl({
        name: boardName,
        elements,
        theme: app.theme,
        pattern: app.backgroundPattern,
      }),
    [boardName, elements, app.theme, app.backgroundPattern],
  );

  const localUrl = useMemo(() => shareUrlForBoardId(boardId), [boardId]);
  const warning = urlLengthWarning(shareUrl);
  const tooBig = shareUrl.length > 120000;

  // the SVG data URL is big; compute it lazily and cache it
  useEffect(() => {
    const svg = exportSVG(elements, app.theme === 'dark' ? '#0f1016' : '#ffffff', 16);
    const bytes = new TextEncoder().encode(svg);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    setSvgUrl(`data:image/svg+xml;base64,${btoa(bin)}`);
  }, [elements, app.theme]);

  useEffect(() => {
    let cancelled = false;
    const make = async () => {
      try {
        const mod = await import('qrcode');
        const data = await mod.toDataURL(shareUrl, { margin: 1, width: 260, color: { dark: '#14141c', light: '#ffffff' } });
        if (!cancelled) setQr(data);
      } catch {
        if (!cancelled) setQr(null);
      }
    };
    if (tab === 'link') make();
    return () => {
      cancelled = true;
    };
  }, [shareUrl, tab]);

  const copy = async (text: string, key: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const copyEmbed = async () => {
    setBusy(true);
    await copy(exportSVG(elements, app.theme === 'dark' ? '#0f1016' : '#ffffff', 16), 'embed');
    setBusy(false);
  };

  const copyImageLink = async () => {
    setBusy(true);
    if (!svgUrl) return setBusy(false);
    await copy(svgUrl, 'image');
    setBusy(false);
  };

  const encodedName = encodeURIComponent(boardName);
  const shareText = encodeURIComponent(`Take a look at my board "${boardName}" on CollabBoard`);
  const plainUrl = tooBig ? localUrl : shareUrl;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-modal">
        <div className="modal-head">
          <div>
            <h2>
              <Share2 size={18} /> Share this board
            </h2>
            <p className="muted">Anyone with the link can open a live, zoomable copy — no account needed.</p>
          </div>
          <button className="ghost-btn icon-only" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="tabs">
          <button className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>
            <Link2 size={15} /> Share link
          </button>
          <button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')}>
            <ExternalLink size={15} /> Image link
          </button>
          <button className={tab === 'embed' ? 'active' : ''} onClick={() => setTab('embed')}>
            <QrCode size={15} /> Embed SVG
          </button>
        </div>

        {tab === 'link' && (
          <>
            <div className="share-link-row">
              <input readOnly value={tooBig ? localUrl : shareUrl} onFocus={(e) => e.target.select()} />
              <button className="primary-btn" onClick={() => copy(tooBig ? localUrl : shareUrl, 'main')}>
                {copied === 'main' ? <Check size={15} /> : <Copy size={15} />}
                {copied === 'main' ? 'Copied' : 'Copy'}
              </button>
            </div>
            {warning && <p className="hint warn">{warning}</p>}
            {tooBig && (
              <p className="hint warn">
                This board is too large to fit in a URL. The link above opens the board saved in <em>this</em> browser
                only. Use Export → Board file to move it elsewhere.
              </p>
            )}
            <div className="share-grid">
              <div className="qr-box">
                {qr ? <img src={qr} alt="QR code for this board" /> : <div className="qr-placeholder"><QrCode size={28} /></div>}
                <span className="muted tiny">Scan to open on mobile</span>
              </div>
              <div className="share-actions">
                <a
                  className="secondary-btn"
                  href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(plainUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Twitter size={15} /> Share on X
                </a>
                <a
                  className="secondary-btn"
                  href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(plainUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={15} /> WhatsApp
                </a>
                <a
                  className="secondary-btn"
                  href={`mailto:?subject=${encodedName}&body=${shareText}%0A%0A${encodeURIComponent(plainUrl)}`}
                >
                  <Mail size={15} /> Email
                </a>
                <button className="secondary-btn" onClick={() => window.open(plainUrl, '_blank')}>
                  <ExternalLink size={15} /> Preview
                </button>
              </div>
            </div>
            <div className="share-note">
              <Lock size={14} />
              <span>
                The board data is encoded inside the link itself — nothing is uploaded to a server, so links work
                forever and stay private. Local autosave keeps an editable copy at <code>{'<origin>/#local=…'}</code>.
              </span>
            </div>
            <div className="share-link-row small">
              <input readOnly value={localUrl} onFocus={(e) => e.target.select()} />
              <button className="ghost-btn" onClick={() => copy(localUrl, 'local')}>
                {copied === 'local' ? <Check size={14} /> : <Copy size={14} />} Copy edit link
              </button>
            </div>
          </>
        )}

        {tab === 'image' && (
          <>
            <p className="hint">
              A self-contained SVG {`data:`} URL — paste it anywhere that accepts an image URL (Notion, GitHub READMEs,
              wikis). It renders crisply at any zoom.
            </p>
            <div className="share-link-row">
              <input readOnly value="data:image/svg+xml;base64,…" />
              <button className="primary-btn" onClick={copyImageLink} disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : copied === 'image' ? <Check size={15} /> : <Copy size={15} />}
                {copied === 'image' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="muted tiny">Length: {Math.round(svgUrl.length / 1024).toLocaleString()} KB self-contained</p>
          </>
        )}

        {tab === 'embed' && (
          <>
            <p className="hint">Inline the whole board as editable vector markup.</p>
            <pre className="code-block">{svgUrl.slice(0, 900)}…</pre>
            <div className="modal-actions">
              <span className="spacer" />
              <button className="primary-btn" onClick={copyEmbed} disabled={busy}>
                {copied === 'embed' ? <Check size={15} /> : <Copy size={15} />} Copy SVG
              </button>
            </div>
          </>
        )}

        <div className="share-footer">
          <span className="muted tiny">
            {elements.length} element{elements.length === 1 ? '' : 's'} · board “{shareSlug(boardName)}”
          </span>
          <span className="muted tiny">Link size: {(shareUrl.length / 1024).toFixed(1)} KB</span>
        </div>
      </div>
    </div>
  );
}
