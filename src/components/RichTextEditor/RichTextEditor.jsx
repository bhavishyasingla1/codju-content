import { useRef, useCallback, useEffect, useState } from 'react';
import { getCharCount, stripHtml, copyToClipboard } from '../../utils/helpers';
import './RichTextEditor.css';

export default function RichTextEditor({ value = '', onChange, placeholder = 'Start writing...', showCopyButton = false, showCharCount = false, readOnly = false }) {
  const [copied, setCopied] = useState(false);
  const editorRef = useRef(null);
  const isInternalChange = useRef(false);

  // Sync external value changes
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCommand = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const handleLink = useCallback(() => {
    const url = prompt('Enter URL:');
    if (url) {
      execCommand('createLink', url);
    }
  }, [execCommand]);

  const handleCopy = useCallback(async () => {
    const text = stripHtml(value);
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const charCount = getCharCount(value);

  const ToolButton = ({ command, icon, title, onClick }) => (
    <button
      className="rte__tool-btn"
      onMouseDown={(e) => {
        e.preventDefault();
        if (onClick) {
          onClick();
        } else {
          execCommand(command);
        }
      }}
      title={title}
      type="button"
    >
      {icon}
    </button>
  );

  return (
    <div className="rte">
      {/* Toolbar */}
      {(!readOnly || showCopyButton) && (
        <div className="rte__toolbar">
          {!readOnly && (
            <>
              <div className="rte__tool-group">
                <ToolButton
                  command="bold"
                  title="Bold"
                  icon={<strong>B</strong>}
                />
                <ToolButton
                  command="italic"
                  title="Italic"
                  icon={<em>I</em>}
                />
                <ToolButton
                  command="underline"
                  title="Underline"
                  icon={<u>U</u>}
                />
              </div>

              <div className="rte__divider" />

              <div className="rte__tool-group">
                <ToolButton
                  command="insertUnorderedList"
                  title="Bullet List"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <circle cx="4" cy="6" r="1" fill="currentColor" />
                      <circle cx="4" cy="12" r="1" fill="currentColor" />
                      <circle cx="4" cy="18" r="1" fill="currentColor" />
                    </svg>
                  }
                />
                <ToolButton
                  command="insertOrderedList"
                  title="Numbered List"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="10" y1="6" x2="21" y2="6" />
                      <line x1="10" y1="12" x2="21" y2="12" />
                      <line x1="10" y1="18" x2="21" y2="18" />
                      <text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="inherit">1</text>
                      <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="inherit">2</text>
                      <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="inherit">3</text>
                    </svg>
                  }
                />
              </div>

              <div className="rte__divider" />

              <div className="rte__tool-group">
                <ToolButton
                  command="formatBlock"
                  title="Heading 2"
                  icon={<strong>H2</strong>}
                  onClick={() => execCommand('formatBlock', '<h2>')}
                />
                <ToolButton
                  command="formatBlock"
                  title="Heading 3"
                  icon={<strong>H3</strong>}
                  onClick={() => execCommand('formatBlock', '<h3>')}
                />
                <ToolButton
                  command="formatBlock"
                  title="Paragraph"
                  icon={<span>P</span>}
                  onClick={() => execCommand('formatBlock', '<p>')}
                />
              </div>

              <div className="rte__divider" />

              <div className="rte__tool-group">
                <ToolButton
                  command="createLink"
                  title="Insert Link"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  }
                  onClick={handleLink}
                />
              </div>

              <div className="rte__divider" />

              <div className="rte__tool-group">
                <ToolButton
                  command="undo"
                  title="Undo"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1,4 1,10 7,10" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                  }
                />
                <ToolButton
                  command="redo"
                  title="Redo"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23,4 23,10 17,10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  }
                />
              </div>
            </>
          )}

          {showCopyButton && (
            <>
              <div className="rte__spacer" />
              <button
                className={`rte__copy-btn ${copied ? 'rte__copy-btn--success' : ''}`}
                onClick={handleCopy}
                type="button"
                title="Copy text"
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Editor area */}
      <div
        ref={editorRef}
        className={`rte__editor ${readOnly ? 'rte__editor--readonly' : ''}`}
        contentEditable={!readOnly}
        onInput={!readOnly ? handleInput : undefined}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      {/* Footer */}
      {showCharCount && (
        <div className="rte__footer">
          <span className="rte__char-count">{charCount} characters</span>
        </div>
      )}
    </div>
  );
}
