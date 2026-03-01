import { motion, AnimatePresence } from "framer-motion";

import { ReactNode } from "react";

/**
 * PageTransition: Unified fade/slide animation for page/modal changes.
 * Uses consistent timing and easing for all transitions.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={window.location.pathname}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
        style={{ width: "100%" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}