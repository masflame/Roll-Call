// @ts-nocheck
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  showBack?: boolean;
  noBackground?: boolean;
}

function PageHeader({ title, description, action, showBack = true, noBackground = false }: PageHeaderProps) {
  const navigate = useNavigate();
  const outerClass = noBackground
    ? "hidden lg:block"
    : "hidden lg:block bg-surface/95 border-b border-stroke-subtle";

  const innerClass = noBackground ? "max-w-6xl mx-auto px-4 py-0" : "max-w-6xl mx-auto px-4 py-3";

  return (
    <div className={outerClass}>
      <div className={innerClass}>
        <div className="space-y-3">
          {showBack && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-sm font-medium text-text-muted transition hover:text-text-primary"
            >
              &larr; Back
            </button>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-4 lg:hidden">
              <div className="w-1.5 h-8 rounded bg-brand-primary/90" />
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
                {description && <p className="text-sm text-text-muted">{description}</p>}
              </div>
            </div>
            {action}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PageHeader;
