// @ts-nocheck
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

function initials(name: string | undefined) {
  if (!name) return "U";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = auth.currentUser;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
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

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-md border border-stroke-subtle bg-surface shadow-md">
          <button onClick={() => { setOpen(false); navigate('/settings'); }} className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surfaceAlt">Settings</button>
          <button onClick={() => { setOpen(false); navigate('/profile'); }} className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surfaceAlt">Account</button>
          <div className="border-t border-stroke-subtle" />
          <button onClick={() => signOut(auth)} className="w-full text-left px-4 py-2 text-sm text-accent-error hover:bg-surfaceAlt">Logout</button>
        </div>
      )}
    </div>
  );
}
