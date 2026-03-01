// @ts-nocheck
import { useState, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

function initials(name: string | undefined) {
  if (!name) return "U";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<Record<string, any> | null>(null);
  const navigate = useNavigate();
  const user = auth.currentUser;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) {
              // set a hidden fixed placeholder so the menu doesn't flash at 0,0
              setMenuStyle({ position: 'fixed', top: '0px', left: '0px', visibility: 'hidden', opacity: 0, transform: 'scale(0.98)', zIndex: 60 });
            }
            // when closing, keep menuStyle until exit animation completes
            return next;
          });
        }}
        aria-haspopup="true"
        aria-label="Profile menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surfaceAlt text-text-primary"
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="avatar" className="h-9 w-9 rounded-full object-cover block" />
        ) : (
          <span className="font-semibold text-sm">{initials(user?.displayName)}</span>
        )}
      </button>

      <AnimatePresence onExitComplete={() => setMenuStyle(null)}>
        {open && (
          <motion.div
            ref={menuRef}
            style={menuStyle ?? undefined}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 600, damping: 35 }}
            className="rounded-md border border-stroke-subtle bg-surface shadow-md transform origin-top-right relative"
          >
            <div>
              <button onClick={() => { setOpen(false); navigate('/settings'); }} className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surfaceAlt">Settings</button>
              <button onClick={() => { setOpen(false); navigate('/profile'); }} className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surfaceAlt">Account</button>
              <div className="border-t border-stroke-subtle" />
              <button onClick={() => { signOut(auth); }} className="w-full text-left px-4 py-2 text-sm text-accent-error hover:bg-surfaceAlt">Logout</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Positioning: measure button and menu to keep dropdown inside viewport */}
      {open && (
        <ProfileMenuPositioner buttonRef={buttonRef} menuRef={menuRef} setMenuStyle={setMenuStyle} />
      )}
    </div>
  );
}

function ProfileMenuPositioner({ buttonRef, menuRef, setMenuStyle }: { buttonRef: any; menuRef: any; setMenuStyle: (s: Record<string, any> | null) => void }) {
  useLayoutEffect(() => {
    if (!buttonRef?.current || !menuRef?.current) return;
    const btn = buttonRef.current as HTMLElement;
    const menu = menuRef.current as HTMLElement;

    requestAnimationFrame(() => {
      const btnRect = btn.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // prefer opening below the button; if not enough space, open above
      let top = btnRect.bottom + 8;
      if (top + menuRect.height > vh - 8) {
        top = btnRect.top - menuRect.height - 8;
      }

      // align to the right edge of the button by default; if that overflows, align to the left edge
      let left = btnRect.right - menuRect.width;
      if (left < 8) left = btnRect.left;
      if (left + menuRect.width > vw - 8) left = vw - menuRect.width - 8;

      // set final visible style (triggers transition from initial hidden placeholder)
      setMenuStyle({ position: 'fixed', top: `${Math.max(8, top)}px`, left: `${Math.max(8, left)}px`, zIndex: 60, opacity: 1, transform: 'scale(1)', transition: 'opacity .15s ease-out, transform .15s ease-out' });
    });

    function onResize() {
      setMenuStyle(null);
    }

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [buttonRef, menuRef, setMenuStyle]);

  return null;
}
